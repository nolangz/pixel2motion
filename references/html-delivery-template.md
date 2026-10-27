# HTML Delivery Template

Use this contract for the final `logo_motion.html`. The CueRecord sample is the model: one HTML file that presents the main logo animation, small atomic motion studies, and live playback controls.

## Required Page Structure

- Hero stage: a centered primary SVG animation in `#logo-root`; this is the element captured by QA tooling. User-facing motion templates should display the main logo at 0.7x of the SVG's intrinsic width, still capped by the viewport.
- Atomic motions row: three or four small variants derived from the same `logo.svg`, such as hover, pulse, arc/spin, and press/squash. These are motion atoms, not unrelated decoration.
- Controls: replay button, slow-motion toggle, and speed range slider. The speed slider must affect the live main animation, not only the next replay.
- Principles strip: compact pills for the Disney principles used by the choreography; highlight active principles during the run when using a JS timeline.
- Footer/help text may be minimal, but do not use explanatory marketing copy.

## Main Animation

- Prefer an act/phase timeline for logo reveals: staging hold, anticipation, action, overlap/follow-through, final settle.
- Use explicit SVG transform pivots for complex marks. A helper like `T(px, py, {x, y, sx, sy, rot})` is safer than relying on CSS `transform-origin` when SVG bounding boxes are awkward.
- Store the finished logo state in a `setFinalLogo()` function or equivalent. Reduced motion and `?static=1` must land there.
- CSS keyframe animations must use `animation-fill-mode: both` or `forwards` so `?t=<ms>` and `?static=1` can expose real timeline states.
- Keep `window.__p2mReady = true` only after the animation is rendered, seeked, or static-finalized.

## Atomic Motions

- Build atoms from the same semantic parts used by the main SVG (`#mark`, `#dot`, `#wordmark`, letters, accents).
- Each atom should isolate one principle or interaction: hover appeal, ambient pulse, arc/spin, press squash, draw-on, or letter cascade.
- Atomic variants must be interactive or visibly moving, but they must not distract from the hero animation.
- If a generic script clone cannot safely preserve unique IDs, use a data-URI image fallback for atomic thumbnails and hand-author semantic atomic variants when the user expects production polish.

## Tuners

- Replay restarts the main animation deterministically.
- Slow motion toggles to a readable default around 0.25x.
- Speed slider default should be slow enough to inspect the principles, often around 0.4x to 0.6x for showcase delivery.
- Playback-rate changes should apply to currently running animations.

## QA Hooks

- `?t=<ms>` pauses the main animation at an exact timestamp for frame capture.
- `?static=1` shows the final static logo.
- In QA/chromeless mode, hide controls and atomic variants if needed, but keep `#logo-root` available for screenshots.
- `prefers-reduced-motion: reduce` must show the finished static logo immediately.
- The `?t=` hook also powers quantitative QA: `scripts/probe_motion_continuity.py` reads computed styles at seeked timestamps (catches silently-dropped keyframe easings — see the literal-easing rule) and sweeps ink-pixel deltas across risk windows (catches handoff stalls/pops invisible in coarse frame strips).
- The decisive Final Frame Contract check is SAME-pipeline: capture `?static=1` and `?t=<end>` with the same tool/viewport/DPR and require an exact 0 diff; cross-pipeline diffs against the Phase 2 render contain resampling noise and are confirmed visually.

## Optional Hosted Preview

Only when the user asks for a link to share the animation (for example with a client or on a phone). The showcase is one dependency-free file, so it can be published as-is; the QA hooks keep working on the hosted copy (`<url>?static=1`, `<url>?t=<ms>`).

- deed.page is a third-party static host that needs no account. Published pages are public, so confirm the logo is cleared for sharing first. Free pages show a small "Published with deed.page" badge.
- Publish with a unique slug (lowercase letters, digits and hyphens): `curl -sS -T logo_motion.html "https://deed.page/v1/sites?slug=<brand>-motion-<suffix>"`. Add `-H "X-Ttl: 604800"` for a link that expires after a week.
- Return the `url` field. A first publish also returns a `token`, the only key that can replace (`-H "Authorization: Bearer <token>"` on the same command) or delete (`curl -sS -X DELETE "https://deed.page/v1/sites/<slug>" -H "Authorization: Bearer <token>"`) the page. Give it to the user and never write it into the HTML or `motion_spec.md`.
- MCP-capable agents can use the server at `https://deed.page/mcp` instead (`publish_site`). Docs: https://deed.page/docs
