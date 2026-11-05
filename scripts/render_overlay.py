#!/usr/bin/env python3
"""Render an SVG in headless Chrome and overlay it on the source raster for fit QA.

One command per fit iteration: renders the SVG at the source image's exact pixel
size (real browser, no rasterizer dependency), composites a cyan overlay of the
render silhouette onto the source, and reports IoU / src_only / render_only pixel
counts. Inspect the overlay with multimodal vision; use the numbers only as a
trend signal between iterations.

Requires Pillow + numpy (use a venv if the system Python is externally managed)
and a Chrome/Chromium binary (auto-detected, or set CHROME_BIN). On Windows the
default install paths of Chrome, Edge and Playwright's chromium headless shell
are checked too.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

CHROME_CANDIDATES = [
    os.environ.get("CHROME_BIN", ""),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
]


def windows_candidates() -> list[str]:
    """Chrome, Edge, then Playwright's headless shell, at their default Windows install paths."""
    roots = [os.environ.get(k, "") for k in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
    found = [
        str(Path(root) / rel)
        for rel in (r"Google\Chrome\Application\chrome.exe", r"Microsoft\Edge\Application\msedge.exe")
        for root in roots
        if root
    ]
    pw_root = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "")
    if pw_root in ("", "0"):
        pw_root = str(Path(os.environ.get("LOCALAPPDATA", "")) / "ms-playwright")
    # Headless shell only: launched directly, Playwright's chrome-win64\chrome.exe
    # exits with code 3 (Playwright itself starts it with --no-sandbox).
    shells = Path(pw_root).glob("chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe")

    def revision(exe: Path) -> int:
        tail = exe.parents[1].name.rsplit("-", 1)[-1]
        return int(tail) if tail.isdigit() else -1

    found += [str(exe) for exe in sorted(shells, key=revision, reverse=True)]
    return found


def find_chrome() -> str:
    candidates = list(CHROME_CANDIDATES)
    if os.name == "nt":
        candidates[1:1] = windows_candidates()
    for cand in candidates:
        if not cand:
            continue
        if Path(cand).exists():
            return cand
        found = shutil.which(cand)
        if found:
            return found
    raise SystemExit("No Chrome/Chromium found. Set CHROME_BIN to a browser binary.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render SVG via headless Chrome and build a cyan fit overlay.")
    parser.add_argument("svg", type=Path, help="Fitted SVG file.")
    parser.add_argument("source", type=Path, help="Source raster image (PNG/JPG/WebP).")
    parser.add_argument("--out", type=Path, required=True, help="Overlay PNG path (e.g. outputs/fit_iterations/01_x_overlay.png).")
    parser.add_argument("--render-out", type=Path, default=None, help="Also save the bare SVG render PNG here.")
    parser.add_argument("--report", type=Path, default=None, help="Optional JSON metrics path.")
    parser.add_argument(
        "--fg-threshold", type=int, default=720,
        help="Pixel is foreground when R+G+B < threshold (default 720 = non-near-white).",
    )
    return parser.parse_args()


def render_svg(svg: Path, width: int, height: int, chrome: str) -> Image.Image:
    from PIL import Image

    with tempfile.TemporaryDirectory() as td:
        wrapper = Path(td) / "wrap.html"
        shot = Path(td) / "shot.png"
        wrapper.write_text(
            "<!doctype html><html><head><style>html,body{margin:0;padding:0}</style></head>"
            f'<body><img src="{svg.resolve().as_uri()}" width="{width}" height="{height}"></body></html>',
            encoding="utf-8",
        )
        cmd = [
            chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            f"--screenshot={shot}", f"--window-size={width},{height}",
            "--default-background-color=FFFFFFFF",
        ]
        if os.name == "nt":
            # Throwaway profile, so the user's own Chrome/Edge profile is never touched.
            cmd.append(f"--user-data-dir={Path(td) / 'profile'}")
        cmd.append(wrapper.resolve().as_uri())
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode("utf-8", "replace").strip()[-800:]
            raise SystemExit(
                f"Browser render failed (exit code {exc.returncode}): {chrome}\n"
                f"{stderr or '(no stderr)'}\n"
                "Set CHROME_BIN to a different Chrome/Chromium/Edge binary."
            ) from exc
        return Image.open(shot).convert("RGB").copy()


def main() -> int:
    args = parse_args()

    import numpy as np
    from PIL import Image

    src_img = Image.open(args.source).convert("RGB")
    W, H = src_img.size
    render = render_svg(args.svg, W, H, find_chrome())
    if args.render_out:
        args.render_out.parent.mkdir(parents=True, exist_ok=True)
        render.save(args.render_out)

    a = np.asarray(src_img).astype(int)
    b = np.asarray(render).astype(int)
    src_sil = a.sum(axis=2) < args.fg_threshold
    ren_sil = b.sum(axis=2) < args.fg_threshold

    over = a.copy()
    over[ren_sil] = (over[ren_sil] * 0.35 + np.array([0, 200, 220]) * 0.65).astype(int)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(over.astype(np.uint8)).save(args.out)

    inter = int((src_sil & ren_sil).sum())
    union = int((src_sil | ren_sil).sum())
    metrics = {
        "svg": str(args.svg),
        "source": str(args.source),
        "overlay": str(args.out),
        "iou": round(inter / union, 4) if union else 0.0,
        "src_only_px": int((src_sil & ~ren_sil).sum()),
        "render_only_px": int((ren_sil & ~src_sil).sum()),
    }
    print(f"IoU={metrics['iou']}  src_only={metrics['src_only_px']}  render_only={metrics['render_only_px']}")
    print("Numbers are a trend signal — judge the overlay visually.")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
