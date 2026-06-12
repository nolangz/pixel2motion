#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_HTML = resolve(ROOT, "docs/index.html");
const TRANSPARENT_MOV = process.argv.includes("--transparent-mov");
const TRANSPARENT = process.argv.includes("--transparent") || TRANSPARENT_MOV;
const KEEP_FRAMES = process.argv.includes("--keep-frames");
const OUT_DIR = resolve(ROOT, TRANSPARENT ? "outputs/videos/claude_4k120_transparent" : "outputs/videos/claude_4k120");
const HTML_DIR = resolve(OUT_DIR, "html");
const FRAMES_DIR = resolve(OUT_DIR, "frames");
const FPS = 120;
const WIDTH = 3840;
const HEIGHT = 2160;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const TARGETS = [
  { name: "N", title: "N — Claude", speed: 1, holdMs: 50, slug: "n" },
  { name: "Focus", title: "Focus — Claude", speed: 1, holdMs: 50, slug: "focus" },
  { name: "Continuum", title: "Continuum — Claude", speed: 1, holdMs: 50, slug: "continuum" },
  { name: "Horizon", title: "Horizon — Claude", speed: 1, holdMs: 50, slug: "horizon" },
  { name: "CueRecord", title: "CueRecord — Claude", mode: "cuerecord", wallDurationMs: 6650, slug: "cuerecord" },
];

const onlyArg = process.argv.find(arg => arg.startsWith("--only="));
const only = onlyArg
  ? new Set(onlyArg.slice("--only=".length).split(",").map(value => value.trim().toLowerCase()).filter(Boolean))
  : null;
const SELECTED_TARGETS = only
  ? TARGETS.filter(target => only.has(target.slug) || only.has(target.name.toLowerCase()))
  : TARGETS;

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractSrcdoc(source, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<iframe[^>]*title="${escaped}"[\\s\\S]*?srcdoc="([\\s\\S]*?)"`, "m");
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not find iframe srcdoc for ${title}`);
  return decodeHtml(match[1]);
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: options.stdio ?? "pipe", ...options });
    let stderr = "";
    if (child.stderr) child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited ${code}\n${stderr}`));
    });
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still booting.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(wsUrl);
  }

  async open() {
    await new Promise((resolvePromise, reject) => {
      this.ws.addEventListener("open", resolvePromise, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", event => {
      const payload = JSON.parse(event.data);
      if (payload.id && this.pending.has(payload.id)) {
        const { resolvePromise, reject } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) reject(new Error(JSON.stringify(payload.error)));
        else resolvePromise(payload.result);
      } else if (payload.method) {
        this.events.push(payload);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolvePromise, reject });
    });
  }

  async waitForEvent(method, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const index = this.events.findIndex(event => event.method === method);
      if (index >= 0) return this.events.splice(index, 1)[0].params;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
    }
    throw new Error(`Timed out waiting for CDP event ${method}`);
  }

  close() {
    this.ws.close();
  }
}

async function launchChrome() {
  const profileDir = mkdtempSync(resolve(tmpdir(), "p2m-chrome-"));
  const port = 9222 + Math.floor(Math.random() * 1000);
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--run-all-compositor-stages-before-draw",
    `--window-size=${WIDTH},${HEIGHT}`,
    "about:blank",
  ], { stdio: "ignore" });

  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: WIDTH,
    screenHeight: HEIGHT,
  });
  await client.send("Emulation.setDefaultBackgroundColorOverride", {
    color: TRANSPARENT ? { r: 0, g: 0, b: 0, a: 0 } : { r: 255, g: 255, b: 255, a: 1 },
  });

  return { client, chrome, profileDir };
}

async function preparePage(client, htmlPath, target) {
  const url = target.mode === "cuerecord"
    ? pathToFileURL(htmlPath).href
    : `${pathToFileURL(htmlPath).href}?t=0`;
  await client.send("Page.navigate", { url });
  await client.waitForEvent("Page.loadEventFired");
  await client.send("Runtime.evaluate", {
    expression: "document.fonts ? document.fonts.ready : Promise.resolve()",
    awaitPromise: true,
  });

  if (target.mode === "cuerecord") {
    await installCueRecordSeek(client);
    return {
      declared: target.wallDurationMs,
      maxEnd: target.wallDurationMs,
      animationCount: 0,
      mode: target.mode,
    };
  }

  await waitUntilReady(client);
  const result = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const root = document.getElementById("logo-root");
      const declared = Number(root?.dataset?.p2mDuration || 0);
      const animations = root ? root.getAnimations({ subtree: true }) : [];
      const maxEnd = Math.max(0, ...animations.map(animation => {
        const timing = animation.effect?.getComputedTiming?.();
        const end = Number(timing?.endTime || 0);
        return Number.isFinite(end) ? end : 0;
      }));
      return { declared, maxEnd, animationCount: animations.length };
    })()`,
    returnByValue: true,
  });
  return result.result.value;
}

async function installCueRecordSeek(client) {
  await client.send("Runtime.evaluate", {
    expression: `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 500))))`,
    awaitPromise: true,
  });
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      if (typeof cancelHero === "function") cancelHero();
      if (!layoutReady && typeof layoutHero === "function") layoutHero();
      heroSvg.style.visibility = "visible";

      const cueDur = {
        p1: 170,
        p2: 130,
        p3: 160,
        p4: 360,
        p5: 380,
        p6: 140,
        p7: 170,
        p8: 560,
        letterDelay: 52,
        letterDur: 310,
        settle: 540,
      };
      const starts = {};
      starts.p1 = 0;
      starts.p2 = starts.p1 + cueDur.p1;
      starts.p3 = starts.p2 + cueDur.p2;
      starts.p4 = starts.p3 + cueDur.p3;
      starts.p5 = starts.p4 + cueDur.p4;
      starts.p6 = starts.p5 + cueDur.p5;
      starts.p7 = starts.p6 + cueDur.p6;
      starts.p8 = starts.p7 + cueDur.p7;
      starts.letters = starts.p8 + cueDur.p8 * 0.55;
      const lastLetterFinish = (letters.length - 1) * cueDur.letterDelay + cueDur.letterDur;
      const waitAfterLand = Math.max(0, lastLetterFinish - Math.round(cueDur.p8 * 0.45));
      starts.settle = starts.p8 + cueDur.p8 + waitAfterLand + 60;
      const total = starts.settle + cueDur.settle;

      function clamp01(value) {
        return Math.max(0, Math.min(1, value));
      }

      function cPress(sx, sy, y = 0, rot = 0) {
        C.setAttribute("transform", T(C_CX, C_CY, { y, sx, sy, rot }));
      }

      window.__p2mCueSeek = function cueSeek(wallMs) {
        if (typeof cancelHero === "function") cancelHero();
        if (!layoutReady && typeof layoutHero === "function") layoutHero();
        heroSvg.style.visibility = "visible";
        resetHero();

        const ms = Math.max(0, Math.min(total, wallMs * 0.45));

        if (ms >= starts.p2 && ms < starts.p3) {
          const e = ease.inout(clamp01((ms - starts.p2) / cueDur.p2));
          cPress(1 - 0.10 * e, 1 + 0.14 * e, -16 * e, -2.5 * e);
        } else if (ms >= starts.p3 && ms < starts.p4) {
          const e = ease.out3(clamp01((ms - starts.p3) / cueDur.p3));
          cPress(0.90 + 0.42 * e, 1.14 - 0.37 * e, -16 + 54 * e, -2.5 + 5 * e);
        } else if (ms >= starts.p4 && ms < starts.p5) {
          const sp = ease.spring(clamp01((ms - starts.p4) / cueDur.p4));
          cPress(1.32 + (1 - 1.32) * sp, 0.77 + (1 - 0.77) * sp, 38 * (1 - sp), 2.5 * (1 - sp));
        } else if (ms >= starts.p5) {
          cPress(1, 1, 0, 0);
        }

        if (ms < starts.p5) {
          dot.setAttribute("opacity", "0");
          dotG.setAttribute("transform", T(DOT_CX, DOT_CY, { sx: 0.001, sy: 0.001 }));
        } else if (ms < starts.p6) {
          const t = clamp01((ms - starts.p5) / cueDur.p5);
          const sp = Math.max(0, ease.spring(t));
          const travel = 1 - ease.out3(t);
          const stretch = Math.max(0, 1 - Math.min(sp, 1));
          const sx = Math.max(0.001, sp * (1 + stretch * 0.55));
          const sy = Math.max(0.001, sp * (1 - stretch * 0.35));
          dotG.setAttribute("transform", T(DOT_CX, DOT_CY, { x: 26 * travel, y: -24 * travel, sx, sy }));
          dot.setAttribute("opacity", ease.out3(t));
        } else {
          dotG.setAttribute("transform", T(DOT_CX, DOT_CY, {}));
          dot.setAttribute("opacity", "1");
        }

        if (ms >= starts.p7 && ms < starts.p8) {
          const e = ease.inout(clamp01((ms - starts.p7) / cueDur.p7));
          const k = STAGE_SCALE * (1 + 0.015 * e);
          mark.setAttribute("transform", T(C_CX, C_CY, {
            x: (stageCx - C_CX) + 26 * e,
            y: (STAGE_CY - C_CY) - 14 * e,
            sx: k,
            sy: k
          }));
        } else if (ms >= starts.p8 && ms < starts.p8 + cueDur.p8) {
          const t = clamp01((ms - starts.p8) / cueDur.p8);
          const e = ease.inout(t);
          setMarkTravel(e);
          const lag = 9 * Math.sin(Math.PI * e);
          dotG.setAttribute("transform", T(DOT_CX, DOT_CY, { x: lag, y: lag * 0.3 }));
        } else if (ms >= starts.p8 + cueDur.p8) {
          setMarkTravel(1);
          dotG.setAttribute("transform", T(DOT_CX, DOT_CY, {}));
        }

        letters.forEach((el, i) => {
          const letterStart = starts.letters + i * cueDur.letterDelay;
          if (ms < letterStart) {
            setLetter(el, { o: 0, x: -34, y: 26 });
          } else if (ms < letterStart + cueDur.letterDur) {
            const t = clamp01((ms - letterStart) / cueDur.letterDur);
            const ee = ease.backOut(t);
            setLetter(el, {
              o: Math.min(1, t * 2.4),
              x: -28 * (1 - ee),
              y: 20 * (1 - ee)
            });
          } else {
            setLetter(el, { o: 1, x: 0, y: 0 });
          }
        });

        if (ms >= starts.settle && ms < starts.settle + cueDur.settle) {
          const t = clamp01((ms - starts.settle) / cueDur.settle);
          const wobble = Math.sin(t * Math.PI * 2.6) * (1 - t) * 0.013;
          lockup.setAttribute("transform", T(lockCx, C_CY, { sx: 1 + wobble, sy: 1 + wobble }));
        } else if (ms >= starts.settle + cueDur.settle) {
          setFinalLogo();
        } else {
          lockup.setAttribute("transform", "");
        }

        return { wallMs, timelineMs: ms, total };
      };

      window.__p2mCueSeek(0);
      window.__p2mReady = true;
      return { total, starts };
    })()`,
    returnByValue: true,
  });
}

async function waitUntilReady(client) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const result = await client.send("Runtime.evaluate", {
      expression: "window.__p2mReady === true",
      returnByValue: true,
    });
    if (result.result.value === true) return;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
  }
  throw new Error("Timed out waiting for window.__p2mReady");
}

async function seek(client, timelineMs) {
  await client.send("Runtime.evaluate", {
    expression: `(async () => {
      const root = document.getElementById("logo-root");
      const animations = root ? root.getAnimations({ subtree: true }) : [];
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = ${timelineMs.toFixed(4)};
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return animations.length;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function seekCueRecord(client, wallMs) {
  await client.send("Runtime.evaluate", {
    expression: `(async () => {
      window.__p2mCueSeek(${wallMs.toFixed(4)});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function screenshot(client, framePath) {
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    omitBackground: TRANSPARENT,
  });
  writeFileSync(framePath, Buffer.from(shot.data, "base64"));
}

async function encodeVideo(framesPattern, outputPath) {
  const args = TRANSPARENT_MOV ? [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", framesPattern,
    "-vf", `scale=${WIDTH}:${HEIGHT}:flags=lanczos,setsar=1`,
    "-c:v", "qtrle",
    "-pix_fmt", "argb",
    "-r", String(FPS),
    outputPath,
  ] : TRANSPARENT ? [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", framesPattern,
    "-vf", `scale=${WIDTH}:${HEIGHT}:flags=lanczos,setsar=1`,
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuva420p",
    "-auto-alt-ref", "0",
    "-b:v", "0",
    "-crf", "18",
    "-deadline", "good",
    "-cpu-used", "4",
    "-row-mt", "1",
    "-r", String(FPS),
    outputPath,
  ] : [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", framesPattern,
    "-vf", `scale=${WIDTH}:${HEIGHT}:flags=lanczos,setsar=1`,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "16",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    outputPath,
  ];
  await run("ffmpeg", args);
}

async function ffprobe(outputPath) {
  const args = [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate,duration,nb_frames,codec_name",
    "-of", "json",
    outputPath,
  ];
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolvePromise(JSON.parse(stdout).streams?.[0] ?? {});
      else reject(new Error(stderr));
    });
  });
}

async function main() {
  mkdirSync(HTML_DIR, { recursive: true });
  mkdirSync(FRAMES_DIR, { recursive: true });
  const source = readFileSync(SOURCE_HTML, "utf8");
  const metadata = [];

  if (SELECTED_TARGETS.length === 0) {
    throw new Error(`No targets matched ${onlyArg}`);
  }

  for (const target of SELECTED_TARGETS) {
    const html = extractSrcdoc(source, target.title);
    const htmlPath = resolve(HTML_DIR, `${target.slug}_claude.html`);
    writeFileSync(htmlPath, html, "utf8");
  }

  const { client, chrome, profileDir } = await launchChrome();
  try {
    for (const target of SELECTED_TARGETS) {
      const htmlPath = resolve(HTML_DIR, `${target.slug}_claude.html`);
      const frameDir = resolve(FRAMES_DIR, target.slug);
      rmSync(frameDir, { recursive: true, force: true });
      mkdirSync(frameDir, { recursive: true });

      const timing = await preparePage(client, htmlPath, target);
      const coreDurationMs = Math.ceil(Math.max(timing.declared || 0, timing.maxEnd || 0));
      const timelineDurationMs = coreDurationMs + (target.holdMs || 0);
      const outputDurationMs = target.mode === "cuerecord"
        ? target.wallDurationMs
        : timelineDurationMs / target.speed;
      const frameCount = Math.ceil((outputDurationMs / 1000) * FPS) + 1;
      console.log(`${target.name}: ${timing.animationCount} animations, timeline=${timelineDurationMs}ms, speed=${target.speed || 1}x, frames=${frameCount}`);

      for (let index = 0; index < frameCount; index += 1) {
        const videoMs = (index / FPS) * 1000;
        const timelineMs = Math.min(coreDurationMs, videoMs * (target.speed || 1));
        const framePath = resolve(frameDir, `frame_${String(index).padStart(6, "0")}.png`);
        if (target.mode === "cuerecord") {
          await seekCueRecord(client, Math.min(target.wallDurationMs, videoMs));
        } else {
          await seek(client, timelineMs);
        }
        await screenshot(client, framePath);
        if (index % 60 === 0 || index === frameCount - 1) {
          console.log(`  ${target.name}: ${index + 1}/${frameCount}`);
        }
      }

      const outputPath = resolve(
        OUT_DIR,
        TRANSPARENT
          ? `${target.slug}_claude_4k_120fps_transparent.${TRANSPARENT_MOV ? "mov" : "webm"}`
          : `${target.slug}_claude_4k_120fps.mp4`
      );
      await encodeVideo(resolve(frameDir, "frame_%06d.png"), outputPath);
      const stream = await ffprobe(outputPath);
      metadata.push({
        name: target.name,
        title: target.title,
        speed: target.speed,
        html: htmlPath,
        output: outputPath,
        timeline_duration_ms: coreDurationMs,
        hold_ms: target.holdMs || 0,
        output_duration_ms: Math.round(outputDurationMs),
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
        frame_count: frameCount,
        ffprobe: stream,
      });
      console.log(`  encoded -> ${outputPath}`);
      if (!KEEP_FRAMES) {
        rmSync(frameDir, { recursive: true, force: true });
      }
    }
  } finally {
    client.close();
    chrome.kill("SIGTERM");
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(`warning: could not remove Chrome profile ${profileDir}: ${error.message}`);
    }
  }

  const reportPath = resolve(OUT_DIR, "export_report.json");
  writeFileSync(reportPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(`report -> ${reportPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
