# Feature Doc: LED-Matrix-Simulation (Interactive Documentation, Left Column)

**Status:** IMPLEMENTED (2026-09-25) — sync strategy **S1 (line-citation mirror)** chosen by the developer; open questions resolved with the defaults proposed here (see §7)
**Target:** `basic-control/docs/InteractiveDocumentation.html` (docs subsystem only, no firmware change required)
**Date:** 2026-09-25

---

## 1. Goal

Add a live **LED-matrix visualization** to the left column ("Interactive Controls",
`InteractiveDocumentation.html:113-144`) of the *Verdrahtungsplan* tab. The component
shows exactly what the physical 8×12 Arduino LED matrix shows at any moment — the
rotating ring (direction + speed), the inner icon (⏸ / ▶ / ◀, blinking during ramps),
and the dAtA profile dots — driven by the existing JS state-machine simulation.

The mirror must follow the **same logic structure as `led_animation.cpp`** so it stays
in sync when the firmware evolves, with minimal code volume and the same documented
mirroring convention already used by `honey_state_machine.js` / `honey_config.js`.

---

## 2. Current-State Analysis

### 2.1 Arduino side (master source of truth)

The firmware separates the matrix *logic* cleanly from the *hardware*:

| File | Role |
|---|---|
| `basic-control/led_animation.h` | `LedAnimationState { ringPos, lastLedStep, frame[8][12] }` + single entry point `updateLedAnimationFrame()` |
| `basic-control/led_animation.cpp` | Pure frame computation. **No hardware calls, no side effects.** All geometry/icons as `static const` tables |
| `basic-control/main.cpp:117-125` | The only hardware touch: `loop()` = `readInputs` → `tickController` → `updateLedAnimationFrame` → `ledMatrix.renderBitmap(animState.frame, 8, 12)` |

`updateLedAnimationFrame(animState, controller, nowMs, config)` is a **pure function**
of `(ControllerState, nowMs)` — the `config` parameter is passed through to
`getRampProgress()` which ignores it (`controller_state.cpp:37`). This is the property
that makes a faithful JS port trivial.

**What a frame contains** (all geometry in `led_animation.cpp`):

- **Ring** — 36 border LEDs, `RING[36]` table (`:7-16`). 4 LEDs lit at positions
  `{pos, pos+1, pos+18, pos+19}` (two opposite pairs, `:131-139`). Steps one position
  per `stepMs = 250 − 220 · rampProgress` (`:123-124`), i.e. 250 ms/step at rest,
  30 ms/step at full ramp progress.
  - Ring off in `STANDBY` / `WAITING` (`:100-104`)
  - `ACCELERATING`: direction = `targetDirection` (`:105-107`)
  - `RUNNING_CW/CCW`: fixed direction (`:108-113`)
  - `DECELERATING`: direction = `runningDirection` (`:114-116`)
- **Inner icon** (`:150-179`) — ⏸ (`ICON_PAUSE`, 20 px, `:20-26`), ▶ (`ICON_PLAY_CW`, 9 px, `:29-35`), ◀ (`ICON_PLAY_CCW`, `:36-42`).
  Blinks at ~1.25 Hz (`(nowMs / 400) % 2 == 0`, `:182`) while a ramp runs; solid otherwise.
- **Profile dots** (`drawProfileMarkerDots`, `:45-76`) — only `DATASET_2` (one 2×2 dot)
  and `DATASET_4` (two stacked 2×2 dots) left of the icon; drawn only when the icon is visible.

| State | Ring | Icon | Blink | Dots |
|---|---|---|---|---|
| STANDBY | off | ⏸ | no | dAtA-dep. (usually none) |
| ACCELERATING | target dir, speed ∝ progress | ▶/◀ (target dir) | yes | dAtA-dep. |
| RUNNING_CW / CCW | fixed dir, max speed | ▶/◀ | no | dAtA-dep. |
| DECELERATING | running dir, speed ∝ progress | ▶/◀ (target dir) if auto-restart, else ⏸ | yes | dAtA-dep. |
| WAITING | off | ▶/◀ if auto-restart, else ⏸ | yes | dAtA-dep. |

### 2.2 JS/docs side (existing mirror conventions)

The docs subsystem already mirrors the firmware with an explicit, proven convention —
**manual port with line citations, C++ is always master**:

- `honey_config.js` — mirrors `config.h` + `speed_dataset.cpp`, every value cites its
  C++ origin (`config.h:88-97`), header states: *"Change C++ first, then mirror here."*
- `honey_state_machine.js` — mirrors `controller_state.cpp` + `controller_logic.cpp`;
  every handler cites its source (`controller_logic.cpp:101-149`). Pure JS, no DOM.
- `getState(nowMs)` (`honey_state_machine.js:175-189`) already returns **every field the
  matrix renderer needs**: `id`, `targetDirection`, `runningDirection`,
  `selectedRunDataset`, `restartIntent`, and `progress` (= C++ `getRampProgress`).
- Component layout: one `.js` file per component in `docs/js/components/` referencing a
  `<template id="...-tpl">` in the HTML; pure modules live in `docs/js/lib/`
  (`bmpWriter.js`, `hardware_fault_injector.js`). Registered in `docs/js/app.js`.
- `useSimulation.js` drives the UI: 100 ms `setInterval` tick + `requestAnimationFrame`
  loop (`:150-163`) for smooth `simState` updates.

### 2.3 Gap

There is **no JS port of `led_animation.cpp` yet** — the BMP subsystem renders
RPM-over-time charts (`useBmpSimulation.js`), not the LED matrix. So the new feature is
a new mirror module + one Vue component; the existing state machine needs **zero
changes** because `getState()` already exposes the required snapshot.

---

## 3. Requirements

### R1 — Faithful 1:1 mirror of `updateLedAnimationFrame`
Same tables (`RING`, `ICON_*`), same constants (36, 250, 220, 400, dot geometry), same
per-state switch structure, same function names where possible. Every block cites its
C++ source line, exactly like `honey_state_machine.js`. Visual output must match the
real matrix pixel-for-pixel at `simSpeed = 1.0`.

### R2 — Left-column component in the wiring tab
New `<led-matrix-display>` in the left column between `<status-display>` and
`<state-machine-legend>` (`InteractiveDocumentation.html:127-143`). Rendered at the
matrix's natural aspect ratio (12×8), no interaction, captioned "LED Matrix (Arduino)".

### R3 — Live, driven by the existing simulation
No own state machine, no new inputs. Reads `simState` (reactive) on every animation
frame, same rAF cadence the rest of the UI already uses.

### R4 — Low code volume
Target ≈ 230 lines total (see §4.1). The ring/icon/dot logic is a near-transcription of
~140 C++ lines and must not grow in the port.

### R5 — Loose coupling: pure module, no DOM
The port lives in `docs/js/lib/led_matrix.js` as a **pure module** (plain object in,
plain frame out, no Vue, no canvas, no `window`). This makes it headless-testable in
Node — same philosophy as `honey_state_machine.js` and `bmpWriter.js`.

### R6 — Sync strategy for future firmware evolution
The plan must keep the mirror in sync when `led_animation.cpp` changes: citations (§5
S1), an automated drift check (§5 S2), optionally a golden-frame harness (§5 S3), and a
change-checklist (§5 S6).

### R7 — LOCKED state behavior
`LOCKED` is a UI-simulation-only state (no firmware equivalent — the Wippschalter X2
cuts power). The matrix shows **all LEDs off** while `simState.id === 'LOCKED'`
(power cut), documented as such.

### R8 — simSpeed semantics
Ring speed derives from `simState.progress`, which already respects `simSpeed` (the
state machine scales ramp durations) — so the ring speeds up automatically in 5× demo
mode, exactly like the firmware would if its ramps were faster. The 1.25 Hz icon blink
stays wall-clock (C++ uses raw `nowMs`; identical at `simSpeed = 1.0`). Document this
deliberate divergence in the module header.

---

## 4. Design

### 4.1 File map and sizes

| File | LOC | Purpose |
|---|---|---|
| `docs/js/lib/led_matrix.js` (new) | ~140 | Pure mirror of `led_animation.cpp` |
| `docs/js/components/LedMatrixDisplay.js` (new) | ~55 | Vue component: rAF loop + canvas draw |
| `InteractiveDocumentation.html` (edit) | +30 | `<template id="led-matrix-tpl">` + tag in left column |
| `docs/js/app.js` (edit) | +4 | import + `app.component('LedMatrixDisplay', ...)` |
| `verify_matrix_sync.js` (new, optional) | ~70 | Static drift check between C++ and JS (§5 S2) |

**Total ≈ 230 lines (+70 optional).**

### 4.2 Core module API — mirrors the C++ interface

```js
// led_matrix.js — pure JS mirror of basic-control/led_animation.cpp
// C++ is MASTER: change led_animation.cpp first, then mirror here.

// Mirrors led_animation.cpp:5-16
const RING = [ /* 36 × {r, c}, same order */ ];

// Mirrors led_animation.cpp:20-43
const ICON_PAUSE   = [ /* 20 × {r, c} */ ];   const ICON_PAUSE_N = 20;
const ICON_PLAY_CW = [ /*  9 × {r, c} */ ];
const ICON_PLAY_CCW = [ /*  9 × {r, c} */ ];  const ICON_PLAY_N = 9;

// Mirrors LedAnimationState (led_animation.h:9-13)
function makeInitialLedAnimationState() {
    return { ringPos: 0, lastLedStep: 0, frame: createFrame() };
}

// Mirrors led_animation.cpp:88-191 (signature 1:1)
function updateLedAnimationFrame(animState, stateSnapshot, nowMs) {
    // stateSnapshot = sm.getState(nowMs) result; contains exactly the
    // ControllerState fields the C++ reads (id, targetDirection,
    // runningDirection, selectedRunDataset, restartIntent, progress).
    // config param dropped: C++ ignores it (controller_state.cpp:37).
}
```

Key mapping notes:

- `getRampProgress(controller, nowMs, config)` → `stateSnapshot.progress` (same value,
  computed by the JS mirror of `controller_state.cpp:33-66`).
- `nowMs` arithmetic is identical (JS `%` on positive numbers matches C++ for this use).
- `drawProfileMarkerDots` stays a module-private helper, same name.

### 4.3 Component: `LedMatrixDisplay.js`

```js
export default {
    name: 'LedMatrixDisplay',
    template: '#led-matrix-tpl',
    props: { simState: { type: Object, required: true } },
    mounted() {
        this.anim = makeInitialLedAnimationState();
        var raf = () => {
            var s = this.simState;
            if (s.id === 'LOCKED') { drawFrame(this.ctx, darkFrame()); }   // R7
            else { updateLedAnimationFrame(this.anim, s, Date.now());       // s IS the snapshot
                   drawFrame(this.ctx, this.anim.frame); }
            this._rafId = requestAnimationFrame(raf);
        };
        raf();
    },
    unmounted() { cancelAnimationFrame(this._rafId); }
};
```

- No Vue reactivity for pixels: the frame is a plain 8×12 array drawn imperatively to
  a canvas each rAF (same "no reactivity overhead" decision as
  `useBmpSimulation.js:14`). Reading reactive `simState` fields once per frame is
  negligible.
- One-frame skew vs. `useSimulation`'s own rAF is invisible (≤ 16 ms) and matches the
  C++ model, where progress is computed at call time anyway.

### 4.4 Rendering: canvas (primary)

`<canvas width="120" height="80">` — 12 cols × 8 rows × 10 px logical pixels, upscaled
by CSS with `image-rendering: pixelated` (same trick as the existing
`.bmp-overlay-img` class, `InteractiveDocumentation.html:29-35`). LED-on = amber
(`#fbbf24`), LED-off = dark cell (`#27272a`), 1 px gap between cells for the LED look.

`drawFrame(ctx, frame)` = 10 lines (two nested loops) — the JS analogue of
`ledMatrix.renderBitmap(animState.frame, 8, 12)` (`main.cpp:109,124`), deliberately
kept outside the pure module so it stays headless-testable.

*Alternative (rejected for now):* CSS grid of 96 divs — more markup, per-tick class
updates through Vue or imperative DOM, no gain. *Alternative 2:* SVG — same as canvas
but more code. Both are drop-in swaps later; `drawFrame` is the only seam.

### 4.5 Data flow

```
Arduino:                           Docs (new):
loop()                             LedMatrixDisplay rAF (~60 Hz)
  readInputs          ──mirror──     sm.tick (useSimulation, 100 ms + clicks)
  tickController      ──mirror──     (existing honey_state_machine.js)
  updateLedAnimationFrame ──1:1──    updateLedAnimationFrame(anim, simState, Date.now())
  renderBitmap        ──analogue──   drawFrame(ctx, anim.frame)  → <canvas>
```

---

## 5. Sync Strategy (keeping C++ and JS aligned as code evolves)

> **Decision (2026-09-25):** S1 is the chosen strategy for this project.
> S2/S3 are documented here for reference only — not implemented.

### S1 — Mirror with line citations (existing convention, mandatory)

The port is organized **in the same order as `led_animation.cpp`** (geometry → helper →
`makeInitial*` → `updateLedAnimationFrame`), with identical names and a `// Mirrors
led_animation.cpp:NN` comment on every constant and block. This is the exact pattern
`honey_state_machine.js` already uses successfully. *Cost: 0 tooling. Catch: relies on
discipline — hence S2/S3.*

### S2 — Static drift check (recommended, CI-friendly)

A small Node script (`verify_matrix_sync.js`, ~70 lines, style of `npm run snapshot`)
parses both files and compares the **duplicated data**:

- `RING` table (36 entries, same order)
- `ICON_PAUSE` / `ICON_PLAY_CW` / `ICON_PLAY_CCW` tables
- magic numbers: `36`, `250`, `220`, `400`, `18`, `19`, dot geometry (`{1,4}` rows,
  2×2 size, `iconMinCol − 3`), blink divisor `400`

Regex-based extraction is acceptable here because both sources keep the tables in a
stable, comment-marked layout. Runs as `npm run verify:matrix`; failure message points
to the exact C++ line that changed. This catches the most common drift (constant and
geometry changes) with zero hardware.

### S3 — Golden-frame harness (optional, strongest fidelity)

The only *honest* golden source is the real firmware. Add a compile-time-only dump mode
to `main.cpp` (`#ifdef MATRIX_FRAME_DUMP`: after each `updateLedAnimationFrame`, print
the 12 bytes of `frame` as hex per tick) and a scripted button sequence over serial.
`verify_matrix_sync.js` then replays the same scenario headless against the JS module
and diffs frame-by-frame. *Cost: ~30 lines firmware (compiled out by default) + one
flashing session per C++ change. Use when the animation logic itself (not just data)
changes.*

### S4 — Module purity (enabler for S2/S3)

Because `led_matrix.js` takes a plain snapshot object and returns a plain frame, both
checks run headless in Node — no browser, no Vue. Keep it that way: never let the
module touch DOM/canvas/`Date.now()`-independent state beyond `animState`.

### S5 — Bidirectional pointers in headers

The repo convention is one-directional (JS cites C++). Add the reverse pointer once:
a `// Mirror (docs): docs/js/lib/led_matrix.js — keep in sync` comment at the top of
`led_animation.cpp` / `led_animation.h`, so a firmware edit in that file surfaces the
reminder at the exact place the change happens.

### S6 — Change checklist

| Change in `led_animation.cpp` | Mirror action in `led_matrix.js` |
|---|---|
| Ring / icon / dot geometry tables | Copy tables, update citations |
| Magic numbers (step 250/220 ms, blink 400 ms, 36 positions) | Copy values; S2 flags mismatches |
| Per-state ring/icon switch | Mirror switch; update per-state table in §2.1 of this doc |
| New field read from `ControllerState` | Extend `getState()` snapshot in `honey_state_machine.js` (pure addition — R5 keeps old consumers working) |
| New config-driven timing | Add to `HoneyConfig` with citation; pass through snapshot |

*Deliberately NOT proposed:* a code-generated shared geometry file (e.g. JSON →
`matrix_geometry.h` + `.js`). It makes C++ the master only at build time and adds a
build step + regex/emitter fragility for a table that changes rarely. S2 delivers the
same guarantee with less tooling. Revisit only if geometry churn becomes frequent.

---

## 6. Implementation Steps

1. **`docs/js/lib/led_matrix.js`** — port geometry tables and
   `updateLedAnimationFrame` 1:1 with citations (§4.2). Run a quick Node smoke test
   (few hardcoded state snapshots → assert known frames, e.g. STANDBY = ⏸ only).
2. **`InteractiveDocumentation.html`** — add `<template id="led-matrix-tpl">` (canvas
   + caption, `pixelated` class) and insert `<led-matrix-display :sim-state="simState">`
   between `status-display` and `state-machine-legend` (line ~141).
3. **`docs/js/components/LedMatrixDisplay.js`** — component per §4.3/§4.4.
4. **`docs/js/app.js`** — import + register component (4 lines).
5. **Manual verification** — `npm run docs`, then in the browser at 5× and 1×:
   STANDBY (⏸, no ring) → Start (▶/◀ blink, ring accelerates) → RUNNING (solid ▶,
   fast ring) → Stop (blinking ⏸, ring slows in running direction) → WAITING →
   auto-restart path (direction change in RUNNING). Toggle X2 lock → dark matrix.
6. **Optional:** `verify_matrix_sync.js` + `npm run verify:matrix` (S2); update
   `ARCHITECTURE.md` folder map (maintenance rule 1) and this doc's §2.1 table if
   per-state behavior changed.

---

## 7. Resolved Decisions

1. **Placement** → between `status-display` and `state-machine-legend` (as proposed).
2. **LED color** → amber `#fbbf24`, LED-off `#27272a` (Uno R4 matrix look).
3. **Blink in demo mode** → 1.25 Hz wall-clock (R8); ring speed follows
   `simState.progress` and thus scales with `simSpeed` automatically.
4. **S3 golden-frame harness** → deferred (S1 chosen as the sync strategy).
5. **Matrix on the schematic** → out of scope, noted as a cheap follow-up.

## 8. Implementation Log (2026-09-25)

Implemented per §4–§6 with strategy S1:

| File | Change |
|---|---|
| `docs/js/lib/led_matrix.js` | new — pure 1:1 mirror of `led_animation.cpp` (line-cited) |
| `docs/js/components/LedMatrixDisplay.js` | new — rAF loop + canvas draw (LOCKED → dark) |
| `docs/InteractiveDocumentation.html` | `.led-matrix-canvas` style, `#led-matrix-tpl` template, `<led-matrix-display>` tag in the left column |
| `docs/js/app.js` | import + component registration |
| `docs/js/composables/useSimulation.js` | `simState` additionally projects `targetDirection`, `runningDirection`, `restartIntent` (snapshot fields the renderer reads) |
| `tests/led_matrix_smoke.mjs` | new — headless port validation, 20 assertions |
| `package.json` | `npm run verify:matrix` script |

One port subtlety worth knowing: the C++ blink expression `(nowMs / 400) % 2 == 0`
uses unsigned-long **integer division**; the JS port must use
`Math.floor(nowMs / 400) % 2 === 0` — float `%` would shift the blink phase
(`led_matrix.js`, icon section).

**Verify:** `npm run verify:matrix` (headless) and `npm run docs` → wiring tab →
STANDBY shows ⏸; Start → blinking ▶/◀ with accelerating ring; Stop → blinking ⏸
with decelerating ring; direction change while running → auto-restart sequence;
X2 lock → dark matrix.
