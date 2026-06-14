---
name: pixel2motion
description: "Turn a raster logo (PNG/JPG/WebP/screenshot) into a clean minimal SVG with edge smoothness as the primary hard gate and IoU optimized as high as reasonably possible without a fixed global threshold, then into a choreographed logo animation delivered as standalone JS-rendered HTML, applying Disney's 12 animation principles. Use when asked to animate a logo, build a logo reveal / splash screen / brand intro, convert a logo image into animated SVG or HTML, add motion to a vectorized mark, or create loading/idle/hover motion for a brand mark. v2: also handles self-crossing draw-on choreography (split-fill, exact easing subdivision, tip glint), closed variable-width ribbon fitting, and quantitative motion QA (easing probe, ink-delta continuity sweep)."
---

# Pixel2Motion (v2)

**Pixel → Vector → Motion.** This skill fuses two disciplines:

1. **Vectorization discipline** (from logo-vectorizer-minimal-smooth): fit the raster source with the *lowest-complexity* editable geometry that passes visual QA.
2. **Motion discipline** (from Disney's 12 Principles of Animation): choreograph that geometry into brand-appropriate motion with evidence-based timing and easing.

The fusion rests on one insight: **minimal smooth geometry IS animatable geometry**. A logo built from 3 semantic parts animates cleanly; a logo built from 400 pixel-stair traced points cannot be choreographed or accepted as a professional logo vector. Phase 2 therefore does not merely vectorize — it *structures for motion*. And the animation must always land exactly on the QA-verified static vector (the **Final Frame Contract**).

## Deliverables

- `logo.svg` — final static vector (motion-ready structure)
- `logo_motion.html` — showcase-style standalone HTML with the main animation, atomic motion studies, replay/slow/speed controls, and QA hooks
- `motion_spec.md` — personality words, principles applied, timeline table, easing tokens, atomic motions, tunable controls
- `outputs/fit_iterations/*.png` + `overlay_progress_strip.png` — geometry QA evidence
- `outputs/motion_frames/*.png` + `motion_strip.png` — motion QA evidence
- `final_render.png`, `html_render.png` — static renders; path audit artifacts when smoothness was a concern

---

## Phase 1 — PIXEL: Read the source, write the brief

1. **Analyze the raster source.** Record image size, mode, alpha, foreground colors, background (transparent/solid). Identify the *semantic parts*: mark vs wordmark, individual letters, dots, swooshes, containers, negative space. Each part is a future actor in the animation.
2. **Write the motion brief** before touching geometry:
   - **Personality**: 3 brand motion words (e.g. "swift, precise, confident"). Derive from the logo's own visual language (geometric = engineered motion, organic = flowing motion, rounded = soft/bouncy) plus any user-stated brand context. See `references/motion-personality.md` to map words → timing scale, easing tokens, principle emphasis.
   - **Usage context**: splash/intro (deliberate 1200–2000ms), header reveal (300–800ms), loading state (continuous loop), hover micro-interaction (150–300ms). Ask the user only if genuinely ambiguous; default to a splash-style reveal plus a static end state.
   - **Choreography sketch**: which parts move, in what order, using which reveal pattern (see `references/reveal-patterns.md`).
3. Record the brief in `motion_spec.md`. Every later parameter must trace back to it.

## Phase 2 — VECTOR: Fit minimal geometry, structured for motion

Follow the lowest-complexity-first workflow. **Do not maximize pixel-fit by default**; start with the simplest editable geometry that can explain the mark, escalating only when an overlay shows a structural mismatch.

### Complexity Ladder

Use the first level that matches the source well enough:

1. **Primitives**: circles, ellipses, rects, lines, simple arcs, transforms.
2. **Primitive composites**: boolean-like combinations of a few primitives or masks.
3. **Few-curve analytic paths**: a small number of cubic segments for smooth ribbons, swooshes, C-marks, leaves, waves, shields. For closed and/or self-intersecting variable-width ribbons (∞ marks, scripts) use the centerline-scaffold recipe — `references/ribbon-fitting.md` + `scripts/fit_ribbon_centerline.py`; its report also emits each crossing's arc fractions, which Phase 3's split draw-on needs.
4. **Smoothed outline paths**: more knots only where the source has real shape changes; preserve G1 tangent continuity, no noisy handle flips.
5. **Trace-derived paths**: only for irregular silhouettes where simpler geometry fails (`scripts/raster_logo_trace.py` for measurement/starter masks). Trace output is a measurement aid, never automatically final art. Smooth or refit the trace before delivery.

If a higher-complexity version improves only pixel antialiasing, keep the lower one. If a lower-complexity version has wrong endpoints, width profile, center, silhouette, negative space, or visibly stair-stepped edges, move up one level or refit with smooth curves. Prefer live SVG `<text>` for wordmarks unless exact letterforms are required. Decide the provisional complexity from the source itself and record the reason in `motion_spec.md`.

### Smoothness Gate (hard requirement)

IoU is not allowed to hide bad vector craft. **A smooth logo source must ship as smooth vector geometry.** The final SVG fails geometry acceptance if any intended smooth edge visibly stair-steps, chatters, has pixel-grid orthogonal runs, contains noisy trace knots, or looks like a bitmap mask at 200-400% zoom, even when IoU is numerically high.

- Pixel-grid contours from threshold masks are acceptable only as starter measurements or for genuinely pixel-art logos. For ordinary logos, refit them into primitives, arcs, ellipses, or cubic paths before Phase 3.
- A path made mostly of 1px horizontal/vertical line segments is a failed smoothness gate for curves, swooshes, ellipses, circles, letters, and rounded shapes.
- Smooth parts must be represented by the lowest number of curve segments that preserves silhouette, width profile, extrema, and negative space. Do not chase antialiasing with hundreds of line segments.
- When replacing a high-IoU jagged trace with a smoother curve slightly lowers IoU, prefer the smooth version if structural landmarks still match. The smooth result may pass with a lower IoU when the residuals are explainable, visually minor, and caused by deliberate smoothing, antialiasing, font substitution, or raster-source artifacts. Record the tradeoff in `motion_spec.md`.
- Inspect a zoomed render (`final_render.png` or a dedicated zoom crop) before accepting. If the user would notice stair-stepping in a screenshot or browser zoom, the vector is not accepted.

### Motion-Ready Structure (the fusion layer)

The SVG is a cast of actors, not just a picture. While fitting geometry, enforce:

- **One element (or `<g>`) per semantic part**, with stable ids: `#mark`, `#wordmark`, `#letter-a`, `#dot`, `#swoosh`. Animation targets ids/classes — never structural selectors like `path:nth-child(3)`.
- **Split paths along animation seams.** If the choreography sketch animates the swoosh separately from the dot, they must be separate elements even if one compound path could render both.
- **Transform origins**: parts that scale/rotate get `transform-box: fill-box; transform-origin: center` (or a deliberate origin) — set via CSS in Phase 3, but verify each part's bounding box makes that origin sensible now.
- **Draw-on readiness**: any stroke that will be drawn on gets `pathLength="1"` so dash animation is `stroke-dasharray: 1; stroke-dashoffset: 1 → 0` regardless of true length. Confirm the path's start point and direction match the intended draw direction; reverse the path if not.
- **Wordmark letters**: if letters will stagger, give each its own element/`<text>` span; a single `<text>` cannot cascade.
- **No baked transforms that fight choreography**: keep part-local coordinates simple so animated transforms compose predictably.

### Geometry QA (evidence required)

- Write SVG with a correct `viewBox`; render to PNG; generate a cyan overlay over the source; save every overlay under `outputs/fit_iterations/NN_name_overlay.png`.
- Inspect overlays with multimodal vision: centers, radii, endpoints, width profile, extrema, negative space, silhouette.
- Compute and record IoU every iteration, but do **not** use a fixed global IoU threshold. Optimize IoU as high as reasonably possible after smoothness and structural correctness are protected. A slightly lower IoU can pass when the overlay is visually faithful and residuals are documented; a high-IoU fit still fails if it has structural mismatches, noisy handles, visible bumps, wrong negative space, pixel-stair edges, or path-audit failures.
- Iterate one complexity level at a time; prefer moving/retuning a few knots before adding knots; add local complexity only where the overlay proves failure. If a path looks bumpy, reduce knots and re-fit macro curves — do not add points.
- For complex smooth paths or any hand-fitted curve that feels uneven, run `scripts/svg_path_audit.py` (noisy handles, tangent jumps, tiny alternating segments, and stair-step trace runs are failures even at high IoU).
- Save at least one smoothness evidence image when the source has curves: a zoomed crop, path audit artifact, or render that makes edge quality inspectable. Record the visual verdict in `motion_spec.md`.
- Finish with `scripts/overlay_progress_strip.py` (source + current-run overlays + final render only).

### Iteration budget: smooth accepted fit or best-of-10

Fitting loops rabbit-hole easily. Default budget: **10 geometry iterations per run** (one iteration = one geometry change + render + overlay inspection). The loop stops when either one arrives first: **accepted fit** (smoothness, structural, and visual checks pass, with IoU pushed as high as practical) or **10 iterations attempted**.

- Number every iteration's artifacts (`NN_name_overlay.png`) and record metrics per iteration (IoU, `src_only_px`, `render_only_px`, boundary RMS / local residuals, audit warnings, smoothness verdict, visual verdict). Persist the fitting scripts and parameters under `outputs/fit_work/` so any iteration can be resumed later — never leave them in throwaway temp paths.
- Reaching accepted fit early ends the loop early; proceed to Phase 3 immediately.
- When the 10-iteration budget is exhausted: stop refining and select the best candidate. Ranking for "best": (1) smoothness gate pass, (2) no structural mismatch, (3) IoU and pixel deltas, (4) boundary RMS / local residuals, (5) fewest audit kinks and tangent issues, (6) visual overlay verdict, (7) lowest editable complexity. A clean-but-slightly-loose fit generally beats a tighter fit with a visible tangent kink; an invisible kink may ride along only as a disclosed known issue.
- If the shipped candidate has a lower IoU than another rejected candidate, report why it still passes or why it is only a preview (e.g. "IoU is lower because jagged threshold artifacts were smoothed; endpoints and silhouette landmarks match"). Geometry-only refinement does not require redoing the choreography — part ids and the centerline survive, so `motion.css` is reusable and only re-packaging (`animate_svg_showcase.py`) plus the Final Frame Contract re-check are needed.

## Phase 3 — MOTION: Choreograph with the 12 principles

Choreograph against `references/twelve-principles-for-logos.md`. Minimum bar: every animation consciously applies **Staging, Slow In/Slow Out, Timing, Follow Through, and Appeal**; the rest as personality demands.

### Structure the timeline with the Golden Ratio

```
Anticipation : Action : Follow-through  =  20% : 50% : 30%
```

For a 1500ms reveal: ~300ms anticipation, ~750ms main action, ~450ms settle. Stagger overlapping parts by 10–20% of the part's own duration; never let all parts start or stop on the same frame (the #1 mechanical-motion mistake). Heavier/larger parts move slower; the drag hierarchy (root → primary → secondary → tertiary detail) orders the cascade.

### Derive parameters, don't invent them

Pick the duration band from usage context, easing tokens and exaggeration level from the personality mapping, and the reveal pattern from the part inventory. `references/reveal-patterns.md` has annotated, principle-tagged patterns: draw-on, staggered assembly, scale-pop with overshoot, mask wipe, morph-from-primitive, letter cascade, plus idle loops and hover states. Define CSS custom properties (`--p2m-duration`, `--p2m-ease-*`) once and use them everywhere — brand consistency lives in tokens. **Exception that overrides this rule: inside `@keyframes`, timing functions must be literal** (see Implementation) — a token referenced there is silently dropped and the motion degrades to linear without any error.

### Implementation

- Read `references/html-delivery-template.md` before building `logo_motion.html`.
- Author the main animation as **CSS keyframes targeting the part ids** in `motion.css`, or as a bespoke JS act/phase timeline when the choreography needs measured pivots, live sequencing, or per-letter layout. If using JS, preserve the same QA hooks described below.
- CSS keyframes must use `animation-fill-mode: both` or `forwards`; otherwise deterministic `?t=<ms>` frame capture and `?static=1` final-state checks are not reliable.
- **Keyframe easing must be literal.** `animation-timing-function: var(--token)` inside `@keyframes` does not resolve in Chromium: the declaration is silently dropped and the segment falls back to the animation's base timing function — usually `linear`, the exact mechanical look the principles forbid. Worse, multi-piece choreography whose pieces were paced by subdivided easings degrades to per-piece constant speeds with **speed cliffs at every handoff** (a measured 4.3× velocity discontinuity read as a "stutter"). Keep tokens for `animation:` shorthands (durations/delays resolve fine) and documentation, but write literal `cubic-bezier(...)` in every keyframe, with a comment naming the token. This failure is invisible in casual playback and in evenly-spaced frame strips — verify with the easing probe (Motion QA step 3).
- **Author all part animations on one shared clock** (one duration, phase offsets as intra-keyframe percentages) so `?t=<ms>` maps 1:1 to the choreography and probes/captures stay trivial to reason about.
- Prefer a single-keyframes-per-element design; when one element needs independent property timelines (e.g. eased movement + linear fades), use comma-separated parallel animations on the same clock.
- Build the default deliverable with `scripts/animate_svg_showcase.py` — it recreates the main SVG via JavaScript DOM calls, wraps motion CSS for reduced-motion safety, and adds a template shell with atomic motion studies, principles strip, replay button, slow-motion toggle, speed slider, `?t=<ms>`, `?static=1`, and `window.__p2mReady`.
- `scripts/animate_svg_html.py` remains a minimal fallback for QA or debugging; it is not the preferred final user-facing HTML because it lacks the atomic motions and tuners.
- The HTML must stay dependency-free and derived from the same geometry as `logo.svg`; atomic variants must reuse the same mark, not separate decorative redraws.
- The default HTML motion stage displays the main logo at **0.7x of the SVG's intrinsic width** (`width * 0.7`, still capped by the viewport). This leaves breathing room around the animation and reduces clipping risk. QA screenshots may override the viewport/crop, but the user-facing template should keep the 0.7x presentation scale.
- **Reduced motion is mandatory**: under `prefers-reduced-motion: reduce` the logo must appear immediately in its final static state.
- Infinite loops (loading/idle) must be seamless: the 100% keyframe state must equal the 0% state; test mentally at 30 seconds — still pleasant?

### Draw-on across self-intersections

A wide masked draw stroke following a self-crossing centerline (∞ marks, script signatures, monograms) prematurely reveals the *other* branch wherever the paths cross — an "X" pops in before the pen draws it. When the centerline self-intersects, apply the **split-fill recipe** in `references/reveal-patterns.md` §1b: cut the fill into pieces between crossing passes (each with its own mask spine), use **butt caps** with dash pattern `1 1` (round caps make the visible tip lead the pen by half the stroke width — it stalls at every handoff, then the next piece pops in as a cap-radius disk), subdivide the global easing **exactly** (de Casteljau) so the combined pace equals the design, and bridge the paint-under-ink dead window at the later pass with a tip glint riding `offset-path`. The dash-math artifact table in the same reference prevents the t=0 cap-dot and tail-leak artifacts. Get the cut fractions from `scripts/fit_ribbon_centerline.py`'s report (it emits each exclusion's arc fractions). Prove the fix with frames around each crossing pass plus the continuity sweep (Motion QA step 4).

### Showcase HTML requirements

The final HTML must follow the provided template pattern:

- **Main animation**: a primary hero stage in `#logo-root`, replayable by click/tap and by the Replay button.
- **Atomic motions**: at least 3 small studies such as hover, pulse, arc/spin, press/squash, draw-on, or letter cascade. They should demonstrate isolated motion principles and target semantic parts when practical.
- **Tuners**: replay button, slow-motion toggle, and speed slider. The speed slider must affect the live main animation, not only future replays.
- **Principles strip**: compact pills for the principles used; when using a JS timeline, highlight active principles during the phase where they are visible.
- **QA hooks**: keep `#logo-root`, `?t=<ms>`, `?static=1`, and `window.__p2mReady` compatible with `scripts/capture_motion_frames.py`.

### Motion QA (evidence required)

1. Capture frames at choreography-significant timestamps with `scripts/capture_motion_frames.py` (uses the `?t=` hook for deterministic seeking): at minimum t=0, end of anticipation, mid-action, peak overshoot, settle, and final — **plus every risk window**: each crossing pass, piece handoff, and occluder entry/exit gets its own bracketing frames (a strip of evenly-spaced beats hides handoff defects entirely).
2. Inspect the strip with multimodal vision: Does anticipation read? Do parts cascade rather than move in lockstep? Does overshoot stay within personality bounds? Is anything clipped by the viewBox mid-flight (expand viewBox or rein in the motion — never let the logo clip)?
3. **Probe the easing actually applied** with `scripts/probe_motion_continuity.py --probe`: read computed values (`stroke-dashoffset`, `offset-distance`, …) at 2–3 seeked timestamps and compare against the designed curve. Values matching the LINEAR window fraction at every timestamp mean a keyframe timing function was silently dropped (see the literal-easing rule). The t=0 frame must also be checked for dash artifacts (cap ink-dot, tail leak).
4. **Continuity sweep across risk windows** with `--ink-sweep`: ink-pixel deltas every ~10ms across handoffs/crossings. A flatline followed by a jump is the stall+pop signature and fails the run. A single near-zero sample where the pen passes *under* already-painted ink is physical — bridge it perceptually (tip glint), don't leave it bare.
5. **Final Frame Contract**: the captured final frame must match `final_render.png` (the QA-verified static vector) in geometry, color, scale, and position. Use `--compare-final` for a cross-pipeline pixel-diff number, then run the decisive **same-pipeline check**: capture `?static=1` and `?t=<end>` with the same tool, viewport, and DPR — these must match **exactly (0 diff)**. Cross-pipeline residue (different renderer/DPR/resampling) is noise to confirm visually, not chase numerically. An animation that lands somewhere else than the verified logo fails the run.
6. For loops, capture one frame just before and just after the seam; they must be visually identical.
7. Assemble `motion_strip.png` as the motion analog of the overlay progress strip.

---

## Bundled Scripts

```bash
# Phase 2 — measurement / starter trace (inspect & simplify its output; never final art by default)
python3 scripts/raster_logo_trace.py source.png --out outputs

# Phase 2 — render + cyan overlay + IoU metrics in one step (headless Chrome; set CHROME_BIN if needed)
python3 scripts/render_overlay.py logo.svg source.png \
  --out outputs/fit_iterations/02_refined_overlay.png \
  --render-out outputs/final_render.png --report outputs/fit_metrics.json

# Phase 2 — closed / self-intersecting variable-width ribbons (∞ marks, scripts):
# centerline scaffold + auto-recenter + source edge snap; report includes each
# exclusion's arc fractions (= split-cut parameters for Phase 3)
python3 scripts/fit_ribbon_centerline.py source.png --seeds seeds.json --out-dir outputs/ribbon_fit

# Phase 2 — Bezier smoothness audit before accepting complex paths
python3 scripts/svg_path_audit.py logo.svg --out-svg bezier_segments.svg --report bezier_audit.json

# Phase 2 — geometry QA strip
python3 scripts/overlay_progress_strip.py --source source.png --dir outputs/fit_iterations \
  --pattern "*overlay*.png" --final-image outputs/final_render.png --out outputs/overlay_progress_strip.png

# Phase 3 — static HTML (intermediate check of JS DOM reconstruction)
python3 scripts/svg_to_js_html.py logo.svg --out logo_static.html --title "Logo"

# Phase 3 — animated showcase HTML deliverable
python3 scripts/animate_svg_showcase.py logo.svg --css motion.css --out logo_motion.html \
  --title "Logo Motion" --duration-hint 1500

# Phase 3 — minimal fallback HTML (debug/QA only, not preferred final delivery)
python3 scripts/animate_svg_html.py logo.svg --css motion.css --out logo_motion_minimal.html \
  --title "Logo Motion" --duration-hint 1500

# Phase 3 — deterministic frame capture + strip + final-frame diff (requires playwright)
python3 scripts/capture_motion_frames.py logo_motion.html \
  --times 0,300,700,1000,1250,1500 --out outputs/motion_frames \
  --strip outputs/motion_strip.png --compare-final outputs/final_render.png

# Phase 3 — easing probe: is the designed curve the one the browser runs? (requires playwright)
python3 scripts/probe_motion_continuity.py logo_motion.html \
  --times 500,700,900 --probe "#draw-stroke:stroke-dashoffset,#pen-glint:offset-distance"

# Phase 3 — ink-delta continuity sweep across handoffs/crossings (requires playwright)
python3 scripts/probe_motion_continuity.py logo_motion.html --ink-sweep 850:1010:10
```

Environment notes: Pillow/numpy via a venv when system Python is externally managed (`python3 -m venv .venv && .venv/bin/pip install pillow numpy`); geometry rendering uses headless Chrome (`CHROME_BIN` if needed), while motion frame capture requires Playwright or equivalent deterministic browser screenshot tooling.

If Playwright is unavailable, use any real-browser screenshot tooling available in the environment with the same `?t=<ms>` URLs; wall-clock screenshots of a running animation are not acceptable evidence (non-deterministic).

## Acceptance Criteria

Completion requires evidence, not claims:

**Geometry (inherited):**
- `logo.svg` exists, renders, and uses the lowest complexity that passes overlay QA and the smoothness gate; structural mismatches (center, scale, endpoints, width profile, spacing, negative space, silhouette) are absent; smooth marks pass visual zoom inspection and path audit when budgeted or when curves felt uneven.
- Report final IoU and pixel deltas, but do not apply a fixed global IoU pass/fail value. IoU should be as high as practical after preserving smoothness and structural correctness. If a lower-IoU result passes, explain exactly why the residuals are acceptable.
- Final geometry must not contain visible stair-stepped edges on intended smooth shapes. A jagged trace with excellent IoU is rejected unless the source is deliberately pixel art and this is explicitly documented.
- `overlay_progress_strip.png` shows source → current-run iterations → final render.
- **Budgeted delivery**: if the 10-iteration budget ran out, shipping the best-of-run geometry is acceptable when smoothness, structure, and visual QA pass and the residuals are disclosed. If residuals are not acceptable, label the output as a preview, keep the fit state resumable from `outputs/fit_work/`, and offer continued refinement. The Final Frame Contract applies to whatever geometry shipped.

**Structure (fusion):**
- Every choreographed part is an independently addressable element with a stable id; draw-on paths carry `pathLength="1"`; the part inventory in `motion_spec.md` matches the SVG structure.

**Motion (new):**
- `logo_motion.html` follows the showcase template: main animation in `#logo-root`, atomic motion studies, replay/slow/speed controls, principles strip, dependency-free execution, `prefers-reduced-motion`, `?t=` seeking, `?static=1`, and `window.__p2mReady`.
- The speed control changes playback for the currently running main animation; Replay restarts deterministically; atomic motions are visibly interactive/moving and derived from `logo.svg`.
- The choreography demonstrably applies the principles claimed in `motion_spec.md`; timeline follows the 20/50/30 shape (or documents why not); no two parts share identical start+end times unless intentional staging.
- `motion_strip.png` exists and has been inspected with multimodal vision; nothing clips mid-flight.
- **Easing verified applied** (probe at 2–3 timestamps; not linear-by-accident) and **no stall+pop signature** in the continuity sweep across handoffs/crossings.
- **Final Frame Contract holds**: captured final frame ≡ verified static render (cross-pipeline diff reported + visual confirmation, same-pipeline `?static=1` vs `?t=<end>` exact). Loops are seam-checked.
- IoU is a required reported diagnostic but not a fixed-threshold gate for the full motion deliverable: a technically smooth animation fails if it is off-personality, mechanical (lockstep parts, linear easing), or lands off the verified logo.

## References

- `references/twelve-principles-for-logos.md` — each Disney principle with logo-specific application and parameter ranges
- `references/motion-personality.md` — brand personality → timing scale, easing tokens, exaggeration bounds, principle emphasis
- `references/reveal-patterns.md` — choreography pattern library: reveals, idle loops, hover states, with timing tables and CSS skeletons; §1b split-fill draw-on for self-crossing marks + dash-math artifact table
- `references/html-delivery-template.md` — required final HTML structure: main animation, atomic motions, tuners, principles strip, QA hooks
- `references/ribbon-fitting.md` — closed/self-intersecting variable-width ribbon fitting (centerline scaffold + recenter + source edge snap) and wordmark font matching

## v2 changelog

Hardened from a production run (calligraphic ∞ + bead + serif wordmark) where the draw-on visibly stuttered at the second self-crossing. Three stacked causes were isolated and each produced a new rule or tool:

1. `var()` timing functions inside `@keyframes` silently degrade to linear in Chromium → literal-easing rule + easing probe (`scripts/probe_motion_continuity.py --probe`). This was the dominant cause: per-piece linear pacing created a 4.3× speed cliff at the piece handoff.
2. Round-cap draw masks make the visible tip lead the pen by half the stroke width → stall+pop at handoffs (measured 50ms flatline + cap-disk jump) → butt-cap dash recipe + dash-math artifact table + ink-delta continuity sweep (`--ink-sweep`).
3. The later crossing pass paints *under* existing ink → a physically unavoidable ~10–25ms dead window → tip-glint secondary action (offset-path on the centerline, base opacity 0, exits under an occluder).

Also new: split-fill recipe for self-crossing draw-ons with exact de Casteljau easing subdivision (reveal-patterns §1b), `scripts/fit_ribbon_centerline.py` + `references/ribbon-fitting.md` for closed variable-width ribbon geometry (its report emits the split-cut arc fractions Phase 3 needs), same-pipeline Final Frame Contract check (exact-0 expectation), and risk-window frame bracketing in Motion QA.
