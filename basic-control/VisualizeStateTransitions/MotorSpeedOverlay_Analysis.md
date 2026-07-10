# Motor Speed Overlay Line — Analysis & Approach Comparison

**Date:** 2026-07-10  
**Context:** BMP snapshot generation currently visualizes state machine states as colored filled-area charts. The user wants to add a **line overlaying the colored states** that shows the **actual simulated motor RPM**, accounting for VFD acc/dec ramp physics that are currently only partially modeled.

---

## 1. Problem Statement

### 1.1 Current behavior

The BMP generator (`useBmpSimulation.js`) runs the `HoneyStateMachine` tick-by-tick and renders each tick as a column of pixels:

- **Row 0:** Event trigger markers (red)
- **Row 1 (optional):** Hardware fault mismatch markers
- **Rows 2..42:** RPM data — a filled area between the zero-line and the computed RPM value, colored by the current state machine state

The RPM value is computed by `computeRpm()`:

```js
function computeRpm(state, config) {
    if (state.id === 'STANDBY' || state.id === 'WAITING') return 0;
    var ds = config.datasets[state.activeDataset];
    var targetRpm = ds ? ds.targetRpm : 0;
    if (state.id === 'RUNNING_CW')  return targetRpm;       // ← instant!
    if (state.id === 'RUNNING_CCW') return -targetRpm;      // ← instant!
    // ACCELERATING / DECELERATING: interpolate via progress
    var sign = (direction === 'CCW') ? -1 : 1;
    return state.progress * targetRpm * sign;
}
```

### 1.2 The gap — where state machine RPM ≠ actual motor RPM

The state machine's `progress` (0..1) correctly models ramp behavior **within** ACCELERATING and DECELERATING states. However, there are scenarios where the state machine state does **not** capture the VFD's physical ramp:

| Scenario | State machine behavior | Actual VFD behavior | Visualization artifact |
|---|---|---|---|
| **Preset change during RUNNING** | State stays `RUNNING_CW`, `progress = 1.0`. `targetRpm` changes instantly. | VFD ramps from old RPM to new RPM using its internal acc/dec curve. | RPM line jumps **instantly** (e.g., 1250 → 2500 rpm in one tick) |
| **Preset change during ACCELERATING** | State stays `ACCELERATING`. `progress` continues from current value, but `targetRpm` changes → RPM = `progress × newTargetRpm` jumps instantly. | VFD continues from current actual RPM toward new target. | RPM line jumps discontinuously (e.g., at 50% progress toward 1250 = 625 rpm, switch to 2500 target → RPM jumps to 1250) |
| **START during DECELERATING (re-accel)** | State transitions to `ACCELERATING` at `currentProgress`. RPM = `progress × targetRpm`. | VFD reverses direction of speed change from current actual RPM. | Handled correctly by current code (progress is preserved) |

**The fundamental issue:** `computeRpm()` derives RPM as `progress × targetRpm`, coupling the state machine's abstract progress to RPM via the **current** target RPM. When the target changes (preset switch), the RPM jumps because progress is dimensionless and doesn't encode absolute speed.

### 1.3 What the user wants

A **distinct line** (e.g., white or yellow, 1–2 px wide) overlaid on the state-colored filled areas that traces the **actual physical motor RPM** — accounting for VFD ramp physics independently of state machine state coloring. The state-colored areas would remain as context (showing what the state machine is doing), while the line would show what the motor is physically doing.

---

## 2. Key Physical Parameters

All datasets share the same acc/dec timing constants (from `speed_dataset.cpp` / `honey_config.js`):

| Parameter | Value | Note |
|---|---|---|
| `rampReferenceMaxRpm` | 3000 RPM | Reference for time scaling |
| `accelerationMs` (all datasets) | 15000 ms | Time from 0 → 3000 RPM at full range |
| `decelerationMs` (all datasets) | 15000 ms | Time from 3000 → 0 RPM at full range |
| **Actual acc/dec rate** | **0.2 RPM/ms (200 RPM/s)** | `3000 / 15000` — **constant across all datasets!** |

Because `scaleTimeByDelta` scales ramp time proportionally to `targetRpm / 3000`, the **rate** is always `3000 / 15000 = 0.2 RPM/ms`. The dataset only changes the **total ramp duration** (longer for higher target speeds), not the slope.

This constant rate greatly simplifies both approaches.

---

## 3. Approach 1: Post-Processing Interpolation

### 3.1 Concept

Run the state machine simulation **unchanged** to produce the full state timeline (state ID, commanded dataset, direction, progress per tick). Then, in a **separate second pass**, simulate the motor's physical RPM by tracking an `actualRpm` variable that evolves according to acc/dec physics, using the state timeline only to determine the **commanded target** at each tick.

```
State machine run (unchanged)
        │
        ▼
  stateTimeline[tick] = { stateId, commandedDataset, direction, ... }
        │
        ▼
  Post-processing pass:
    actualRpm = 0
    FOR each tick:
      targetRpm = stateTimeline[tick].commandedTargetRpm × directionSign
      actualRpm = moveToward(actualRpm, targetRpm, rate, dt)
      yPos = mapRpmToY(actualRpm)
      drawOverlayLine(tick, yPos)
```

### 3.2 Physics Model

```js
// Constant rate: 3000 rpm / 15000 ms = 0.2 rpm/ms
const RATE_RPM_PER_MS = rampReferenceMaxRpm / accelerationMs;  // 0.2

function moveToward(currentRpm, targetRpm, ratePerMs, dtMs) {
    const maxStep = ratePerMs * dtMs;
    if (currentRpm < targetRpm) {
        return Math.min(currentRpm + maxStep, targetRpm);
    } else if (currentRpm > targetRpm) {
        return Math.max(currentRpm - maxStep, targetRpm);
    }
    return currentRpm;
}
```

For the default `tickDurationMs = 500`: max step per tick = 0.2 × 500 = **100 RPM**.

For a preset change from 1250 → 2500 RPM: 1250 RPM delta / 100 RPM per tick = **12.5 ticks** to reach new speed.
For a preset change from 2500 → 1250 RPM: same 12.5 ticks (symmetric rate).

### 3.3 Target Determination

The post-processing pass must determine the **commanded target RPM** at each tick from the state timeline. The commanded target depends on:

| State | Commanded Target RPM |
|---|---|
| `STANDBY` | 0 |
| `WAITING` | 0 |
| `ACCELERATING` | `targetRpm × directionSign` (direction = `targetDirection`) |
| `RUNNING_CW` | `+targetRpm` (from `activeDataset`) |
| `RUNNING_CCW` | `-targetRpm` (from `activeDataset`) |
| `DECELERATING` | 0 |

The `activeDataset` at each tick determines `targetRpm`. This already accounts for preset changes (since `_applyDatasetCommand` updates `_actualDataset`).

### 3.4 Overlay Rendering

The overlay line is drawn as a separate pixel in each column, using a distinct color:

```js
const OVERLAY_COLOR = { r: 255, g: 255, b: 255 };  // White line

// In the post-processing pass, after filling the state-colored area:
var overlayY = mapRpmToY(actualRpm, maxRpm, yResolution, yOffset);
matrix[overlayY][tick] = OVERLAY_COLOR;  // Overwrites the state color at that pixel
```

To make the line more visible (2 px thick):
```js
matrix[overlayY][tick] = OVERLAY_COLOR;
if (overlayY > yOffset + 1) matrix[overlayY - 1][tick] = OVERLAY_COLOR;
```

### 3.5 Advantages

1. **Clean separation of concerns.** The state machine remains a pure logic model; motor physics is a separate concern. This mirrors the real hardware, where the RA4M1 runs the state machine and the VFD handles its own ramp internally.

2. **Minimal code changes.** The state machine (`honey_state_machine.js`), simulation loop (`useBmpSimulation.js`), and BMP writer (`bmpWriter.js`) all remain unchanged. Only `useBmpSimulation.js` gets a ~30-line post-processing pass added after the main simulation loop.

3. **Independent testing.** The motor physics model can be unit-tested in isolation with synthetic state timelines. Edge cases (preset changes at partial RPM, rapid toggles) can be verified without running the full state machine.

4. **Swapable motor models.** Future enhancements (asymmetric acc/dec rates, non-linear VFD curves, different VFD brands) only touch the post-processing pass, not the state machine.

5. **Backward compatible.** Existing BMPs remain valid. The overlay is additive — disable it and you get the current output.

6. **The state-colored fill area stays as-is.** The post-processing line is drawn on top, so the state coloring remains fully visible as context. The line adds information without removing any.

### 3.6 Disadvantages

1. **Two passes over the data.** For 2000-tick scenarios, this means iterating over 2000 ticks twice. Negligible for JS (microseconds), but conceptually less elegant than a single pass.

2. **The state timeline must carry enough information.** Currently the state snapshot has all needed fields (`activeDataset`, `stateId`, `targetDirection`, `runningDirection`). This is already sufficient.

3. **Drift between state progress and actual RPM.** In edge cases (e.g., preset change mid-acceleration), the post-processing RPM may diverge from the state machine's `progress × targetRpm` value. This is **intentional** — it's the whole point — but could be confusing if someone expects them to match. Mitigation: document clearly that the line = physical motor RPM, fill color = state machine state.

4. **The state-colored fill area uses the state machine's RPM, not the post-processed RPM.** This means the fill area boundary and the overlay line would be at different Y positions during preset-change ramps. This is actually a **feature** (it visually shows where the state machine model diverges from physical reality), but it needs to be clearly documented.

### 3.7 Implementation Outline

```js
// In runHeadlessSimulation(), after the main simulation loop:

// ── Post-processing: physical motor RPM overlay ─────────────────
const RATE_RPM_PER_MS = cfg.rampReferenceMaxRpm / 15000;  // 0.2 RPM/ms
const OVERLAY_COLOR = { r: 255, g: 255, b: 255 };

// Replay the state timeline to compute actual motor RPM
var actualRpm = 0;
var tickDurationMs = scenario.tickDurationMs || 50;

for (var tick = 0; tick < width; tick++) {
    // Determine commanded target RPM from the state at this tick
    // (stateTimeline was recorded during the main loop)
    var cmd = stateTimeline[tick];
    var targetRpm = computeCommandedTargetRpm(cmd, cfg);
    
    // Move actual RPM toward target at the constant rate
    var maxStep = RATE_RPM_PER_MS * tickDurationMs;
    if (actualRpm < targetRpm) {
        actualRpm = Math.min(actualRpm + maxStep, targetRpm);
    } else if (actualRpm > targetRpm) {
        actualRpm = Math.max(actualRpm - maxStep, targetRpm);
    }
    
    // Draw overlay line
    var lineY = mapRpmToY(actualRpm, maxRpm, yResolution, yOffset);
    matrix[lineY][tick] = OVERLAY_COLOR;
    // Optional: 2-px thickness
    if (lineY > yOffset + 1) matrix[lineY - 1][tick] = OVERLAY_COLOR;
}
```

### 3.8 Required Changes Summary

| File | Change |
|---|---|
| `useBmpSimulation.js` | Record `stateTimeline[]` during main loop. Add post-processing pass. |
| `simulationScenarios.js` | Add `OVERLAY_COLOR` constant. |
| No other files changed | — |

---

## 4. Approach 2: State Machine Calculates Current Speed

### 4.1 Concept

Enhance the `HoneyStateMachine` (JS) / `ControllerState` (C++) to maintain `currentRpm` as a first-class field, updated on every tick based on the current mode and timing. The state machine becomes responsible for tracking both logical state AND physical motor speed.

```
tick(inputs, nowMs):
    1. Process state transitions (unchanged)
    2. Update currentRpm based on state mode:
       - STANDBY/WAITING:     ramp toward 0
       - ACCELERATING:        ramp toward targetRpm
       - RUNNING_CW/CCW:      ramp toward targetRpm (for preset changes)
       - DECELERATING:        ramp toward 0
    3. currentRpm is part of getState() snapshot
```

### 4.2 Physics Model

The same constant rate (0.2 RPM/ms) applies, but now integrated into each state handler. The key change: when preset changes in RUNNING or ACCELERATING, `currentRpm` does NOT jump — it continues from its current value toward the new target.

**Example: Preset change during RUNNING_CW at 1250 rpm → 2500 rpm**

Current code:
```
tick N:   state=RUNNING_CW, dataset=DATASET_0, progress=1.0, computeRpm() → 1250
tick N+1: preset2 pressed → dataset=DATASET_4, progress=1.0, computeRpm() → 2500  ← JUMP!
```

With Approach 2:
```
tick N:   state=RUNNING_CW, dataset=DATASET_0, currentRpm=1250.0
tick N+1: preset2 pressed → dataset=DATASET_4, target=2500, currentRpm=1250.0 + (0.2 × 500) = 1350.0
tick N+2: currentRpm = 1450.0
...
tick N+13: currentRpm = 2500.0 (reached target)
```

### 4.3 State Machine Changes Required

#### 4.3.1 New state field

```js
// In HoneyStateMachine.reset() and state initialization:
this._state.currentRpm = 0.0;

// In getState():
currentRpm: this._state.currentRpm
```

#### 4.3.2 RPM update logic per state handler

Each handler must update `currentRpm` before returning. A shared helper:

```js
HoneyStateMachine.prototype._updateRpm = function(nowMs) {
    var dt = nowMs - this._lastRpmUpdateMs;
    if (dt <= 0) return;
    this._lastRpmUpdateMs = nowMs;
    
    var rate = this._cfg.rampReferenceMaxRpm / this._cfg.datasets.DATASET_0.accelerationMs;
    var maxStep = rate * dt;
    var target = this._getTargetRpm();  // depends on state + dataset + direction
    
    if (this._state.currentRpm < target) {
        this._state.currentRpm = Math.min(this._state.currentRpm + maxStep, target);
    } else if (this._state.currentRpm > target) {
        this._state.currentRpm = Math.max(this._state.currentRpm - maxStep, target);
    }
};
```

#### 4.3.3 Target RPM determination

```js
HoneyStateMachine.prototype._getTargetRpm = function() {
    switch (this._state.id) {
        case STATE.STANDBY:
        case STATE.WAITING:
            return 0;
        case STATE.RUNNING_CW:
            return this._getDatasetTargetRpm();
        case STATE.RUNNING_CCW:
            return -this._getDatasetTargetRpm();
        case STATE.ACCELERATING: {
            var sign = (this._state.targetDirection === DIR.CCW) ? -1 : 1;
            return sign * this._getDatasetTargetRpm();
        }
        case STATE.DECELERATING:
            return 0;  // Target is always 0 during braking
    }
};
```

#### 4.3.4 Interaction with existing `progress` model

The state machine's `_computeProgress()` and `progress` field serve a different purpose: they track **ramp completion** for state transitions (e.g., when to move from ACCELERATING → RUNNING). This must be preserved.

The `currentRpm` field is **independent** of `progress`:
- `progress` controls **when** state transitions happen (timer-based)
- `currentRpm` tracks **what the motor is physically doing** (continuous)

Both can coexist. `currentRpm` is purely observational and does not affect state transitions.

#### 4.3.5 C++ mirroring

If the JS state machine is enhanced, the C++ `ControllerState` struct and `getRampProgress()` should ideally mirror the changes for consistency. This means:
- Adding `float currentRpm` to `ControllerState`
- Updating it in each `handle*()` function or in `tickController()`

This is a **significant firmware change** that would need testing on real hardware.

### 4.4 Overlay Rendering

Same as Approach 1 — draw a white line at the Y position corresponding to `currentRpm`:

```js
// In the simulation loop, after sm.tick():
var state = sm.getState(virtualNow);
var rpm = state.currentRpm;  // ← from state machine, already physically accurate
var yPos = mapRpmToY(rpm, maxRpm, yResolution, yOffset);
matrix[yPos][tick] = OVERLAY_COLOR;
```

The existing `computeRpm()` function becomes unnecessary for the overlay (though it could remain for the filled area).

### 4.5 Advantages

1. **Single source of truth.** The state machine IS the motor model. No separate physics pass to keep in sync. RPM is available wherever the state machine runs — BMP generation, interactive UI, future WebSerial streaming.

2. **C++ parity.** Enhancing the C++ state machine to track `currentRpm` would make the firmware self-aware of physical motor state, which has diagnostic value beyond BMP visualization (e.g., serial telemetry, fault detection based on RPM deviation).

3. **No second pass.** RPM is computed during the simulation loop, not after. Slightly more efficient (though the difference is negligible for JS).

4. **The filled area and overlay line are always consistent.** Both use the same `currentRpm` value. No divergence between "state machine RPM" and "physical RPM" — the state machine IS the physical model.

5. **Interactive use benefits.** The Vue UI (`SequenzeVisualizer.html`) uses the same state machine instance. With `currentRpm` in the state, the interactive speed gauge would show physically accurate RPM during preset changes, not instantaneous jumps.

### 4.6 Disadvantages

1. **Invasive change.** Touches the core state machine (`honey_state_machine.js`, ~520 lines), the C++ mirror (`controller_state.h/cpp`, `controller_logic.cpp`), and the simulation loop. Higher risk of introducing bugs.

2. **C++ sync burden.** The JS state machine is a verified mirror of the C++ code. Adding `currentRpm` tracking creates a new surface area that must be kept in sync between JS and C++. This increases maintenance cost for every future state machine change.

3. **State machine responsibility creep.** The state machine's job is to manage logical states and transitions. Adding continuous physics simulation mixes concerns. The real hardware delegates ramp physics to the VFD — the state machine doesn't (and can't) know the VFD's exact internal state. Modeling it in the state machine is a fiction that may diverge from real VFD behavior.

4. **Testing complexity.** Every existing state machine test would need updating. New test cases for RPM tracking (preset changes at partial speeds, direction reversals mid-ramp, edge cases with simSpeed ≠ 1.0) would be needed.

5. **`simSpeed` interaction.** The state machine already scales all timing by `simSpeed`. The RPM rate must also be scaled, or `currentRpm` will drift. This adds a subtle coupling:
   - `effectiveRate = (rampReferenceMaxRpm / accelerationMs) / simSpeed` (faster sim → faster rate)
   - OR: `effectiveRate = rampReferenceMaxRpm / (accelerationMs × simSpeed)` (consistent physics)
   - This needs careful thought and testing.

6. **Over-engineering for BMP-only use.** If the only consumer of `currentRpm` is the BMP overlay line, the post-processing approach achieves the same result with far less code and risk.

### 4.7 Required Changes Summary

| File | Change |
|---|---|
| `honey_state_machine.js` | Add `currentRpm` field to state. Add `_updateRpm()` helper. Call it in every handler. Add `_getTargetRpm()`. Update `reset()`, `getState()`. |
| `controller_state.h` | Add `float currentRpm` to `ControllerState` struct. |
| `controller_state.cpp` | Update `makeInitialControllerState()`. Add/update RPM tracking in ramp functions. |
| `controller_logic.cpp` | Call RPM update in each handler or in `tickController()`. |
| `useBmpSimulation.js` | Use `state.currentRpm` instead of `computeRpm()`. Add overlay line rendering. |
| `honey_config.js` | No changes (rate is derived from existing constants). |
| `simulationScenarios.js` | Add `OVERLAY_COLOR` constant. |
| Tests | Update all state machine tests. Add RPM tracking test cases. |

---

## 5. Comparative Summary

| Dimension | Approach 1: Post-Processing | Approach 2: State Machine Calc |
|---|---|---|
| **Files changed** | 2 (`useBmpSimulation.js`, `simulationScenarios.js`) | 7+ (JS state machine, C++ state machine, C++ logic, simulation, tests) |
| **Lines of new code** | ~40 | ~150+ |
| **C++ changes** | None | Struct field, ramp function updates, handler updates |
| **Risk of regression** | Near zero (additive change) | Moderate (core state machine modified) |
| **JS↔C++ sync burden** | None | New field + behavior to maintain |
| **Test surface** | Small (isolated physics function) | Large (every state handler, simSpeed interaction) |
| **Separation of concerns** | Clean — physics is separate from logic | Mixed — state machine does logic + physics |
| **Fidelity to real hardware** | Good — models VFD as external actor (realistic) | Fictional — state machine can't know VFD internals |
| **Reuse in interactive UI** | No (post-processing is BMP-only) | Yes (`currentRpm` available in Vue UI) |
| **Backward compatibility** | Full (overlay is additive) | Requires migration of state shape |
| **Edge case handling** | Explicit in physics model, easy to tune | Distributed across handlers, harder to verify |
| **Implementation effort** | ~1 hour | ~1 day + testing |

---

## 6. Recommendation

### Recommended: Approach 1 (Post-Processing Interpolation)

**Rationale:**

1. **The physics is simple and separable.** The VFD ramps at a constant 0.2 RPM/ms regardless of dataset. This is a one-line formula. It doesn't need the full complexity of the state machine to model — a 30-line post-processing pass is sufficient and more maintainable.

2. **Matches the real hardware architecture.** On the actual Arduino, the RA4M1 runs the state machine and sets relay bits. The VFD (external to the MCU) handles its own ramp physics. The state machine never knows the actual instantaneous RPM — it only knows the commanded speed. Post-processing mirrors this separation faithfully.

3. **Zero risk to the verified state machine.** The JS state machine (`honey_state_machine.js`) is a line-by-line verified mirror of the C++ code. Modifying it for a visualization-only feature introduces risk with no firmware benefit. Post-processing leaves the verified core untouched.

4. **The overlay line diverging from the fill area is a feature, not a bug.** During preset changes, the state-colored fill area (showing state machine `progress × targetRpm`) will be at a different Y position than the overlay line (showing physical RPM). This **visually highlights** exactly where the current model is inaccurate — it's diagnostic information, not a rendering defect.

5. **Faster to implement and iterate.** The post-processing pass can be tuned independently. If the VFD model needs refinement (e.g., asymmetric acc/dec, S-curves), only the physics function changes.

### When to consider Approach 2

Approach 2 becomes the right choice if:

- **The interactive UI needs physically accurate RPM display** (not just BMPs). Currently the Vue UI's speed gauge would also show instant jumps on preset changes. If this needs fixing, `currentRpm` in the state machine benefits all consumers.
- **The C++ firmware will be enhanced to estimate actual RPM** for telemetry or fault detection. In that case, JS should mirror C++.
- **A future WebSerial bridge** will stream real RPM data from the hardware. The state machine would then need an `actualRpm` field to receive external data.

### Suggested implementation path

1. **Short term (this change):** Implement Approach 1 — post-processing overlay line in `useBmpSimulation.js`.
2. **Medium term (evaluate):** If the interactive UI would benefit from smooth RPM display, refactor the post-processing physics into a shared `motorPhysics.js` module that both `useBmpSimulation.js` and `useSimulation.js` can consume. This keeps the state machine pure while making the physics reusable.
3. **Long term (if hardware evolves):** If the C++ firmware gains RPM estimation/measurement, add `currentRpm` to the state machine in both JS and C++ simultaneously, replacing the external physics model.

---

## 7. Appendix: Shared Motor Physics Module (Future)

If the physics model needs to be shared between BMP generation and interactive UI, extract it into a standalone module:

```
basic-control/docs/js/lib/motorPhysics.js
```

```js
/**
 * motorPhysics.js — VFD motor speed model
 * ========================================
 * Pure functions for computing actual motor RPM based on commanded targets
 * and VFD acc/dec ramp physics. Independent of the state machine — consumes
 * state snapshots, produces RPM values.
 *
 * Rate: 0.2 RPM/ms (3000 rpm reference / 15000 ms ramp time)
 * This is constant across all speed datasets.
 */

/**
 * @param {number} currentRpm  — current actual RPM
 * @param {number} targetRpm   — commanded target RPM (signed)
 * @param {number} dtMs        — time delta in milliseconds
 * @param {number} rampRefMaxRpm — e.g. 3000
 * @param {number} rampRefMs   — e.g. 15000
 * @returns {number} new actual RPM
 */
export function stepMotorRpm(currentRpm, targetRpm, dtMs, rampRefMaxRpm, rampRefMs) {
    const rate = rampRefMaxRpm / rampRefMs;  // RPM per ms
    const maxStep = rate * dtMs;
    if (currentRpm < targetRpm) {
        return Math.min(currentRpm + maxStep, targetRpm);
    } else if (currentRpm > targetRpm) {
        return Math.max(currentRpm - maxStep, targetRpm);
    }
    return currentRpm;
}

/**
 * Determine commanded target RPM from a state machine snapshot.
 * @param {object} state — sm.getState() return value
 * @param {object} cfg   — HoneyConfig
 * @returns {number} signed target RPM
 */
export function getCommandedTargetRpm(state, cfg) {
    if (state.id === 'STANDBY' || state.id === 'WAITING') return 0;
    var ds = cfg.datasets[state.activeDataset];
    var targetRpm = ds ? ds.targetRpm : 0;
    if (state.id === 'RUNNING_CW') return targetRpm;
    if (state.id === 'RUNNING_CCW') return -targetRpm;
    if (state.id === 'DECELERATING') return 0;
    // ACCELERATING
    var sign = (state.targetDirection === 'CCW') ? -1 : 1;
    return sign * targetRpm;
}
```

This module would be consumed by both `useBmpSimulation.js` (for overlay line) and `useSimulation.js` (for smooth speed gauge in the interactive UI), without requiring changes to `honey_state_machine.js`.

---

## 8. Appendix: Visual Examples

### Current BMP output (simplified ASCII representation)

```
RPM ▲
    │
+max│████████████████░░░░░░░░░░░░░░░░░░░░  ← blue (RUNNING_CW) filled to targetRpm
    │████████████████░░░░░░░░░░░░░░░░░░░░
    │████████████████░░░░░░░░░░░░░░░░░░░░
    │░░░░██████████████░░░░░░░░░░░░░░░░░░
  0 │───────green──────────orange──┤─────  ← zero line (gray)
    │░░░░░░░░████░░░░░░░░░░██████░░░░░░░░
    │░░░░░░░░████░░░░░░░░░░██████░░░░░░░░
-max│░░░░░░░░████░░░░░░░░░░██████░░░░░░░░
    │
    └────────────────────────────────────▶ ticks
         accel →  running →  decel →
```

**Problem:** The blue area jumps instantly when preset changes (not shown in this simple example).

### Desired output with overlay line

```
RPM ▲
    │
+max│████████████████░░░░░░░░░░░░░░░░░░░░  ← state-colored fill (unchanged)
    │████████████████░░░░░░░░░░░░░░░░░░░░
    │───────white line───────────────────  ← OVERLAY: actual physical RPM
    │░░░░██████████████░░░░░░░░░░░░░░░░░░
  0 │───────green──────────orange──┤─────  ← zero line
    │░░░░░░░░████░░░░░░░░░░██████░░░░░░░░
    │░░░░░░░░████░░░░░░░░░░██████░░░░░░░░
-max│░░░░░░░░████░░░░░░░░░░██████░░░░░░░░
    │
    └────────────────────────────────────▶ ticks
```

The white line traces the physically accurate RPM, which may differ from the top edge of the state-colored fill during preset changes and other transitions where the state machine's abstract progress doesn't match VFD ramp physics.
