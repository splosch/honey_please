# Feature Doc: Combo-Button Schleuder-Programs (PROG_1 / PROG_2)

**Status:** READY FOR IMPLEMENTATION — Q1–Q13 answered, decisions folded into the
requirements (§8 Decisions Log). Open human input: concrete step lists/durations
for PROG_1 & PROG_2 (TODO 1).
**Target:** `basic-control` firmware (env `r4wifi_basic_control`, Arduino Uno R4 WiFi / RA4M1)
**Date:** 2026-09-25

---

## 1. Goal

A combination press of the **Play-Button** together with **Speed-Button 1** or
**Speed-Button 2** selects one of two predefined multistep programs
(**PROG_1** / **PROG_2**). Program execution starts only after all pressed
buttons are released.

- A program is an ordered sequence of **unique steps** built exclusively from
  actions that already exist and are reachable via the current buttons
  (direction, speed preset, start, stop / direction change), plus **new
  program-only steps** such as a configured **wait time**.
- The programs are defined in a **program config** (new, compile-time).
- While a program runs, the Arduino indicates the active program on the 12x8
  LED matrix with a **"P1" / "P2" indicator** (short form of PROG_1 / PROG_2).
- Every individual step must trigger the **normal existing action flow** (same
  relay sequences, same ramp/state-machine transitions, same serial logging) —
  no separate or parallel motor control path.

## 2. Terminology — Button Mapping

The feature wording maps onto the existing firmware buttons as follows:

| Feature term      | Firmware button      | Pin | `ButtonId`            | `InputSnapshot` field |
|-------------------|----------------------|-----|-----------------------|------------------------|
| Play-Button       | GRUEN (Start)        | D11 | `START`               | `startPressed`         |
| Speed-Button 1    | GELB 1 (Preset 1)    | D9  | `PRESET_1`            | `preset1Pressed`       |
| Speed-Button 2    | GELB 2 (Preset 2)    | D10 | `PRESET_2`            | `preset2Pressed`       |

All keypad inputs are `INPUT_PULLUP`, active LOW (`hardware_io.cpp:16-18,36-45`).
Speed buttons currently select the run dataset (`DATASET_0` = Speed Slow 1250 rpm /
`DATASET_4` = Speed Fast 2500 rpm via `config.h:109-110`); the combo must **not**
trigger that normal single-press behavior.

Naming (decided, Q12): programs are **PROG_1 / PROG_2** in code, serial tags and
docs. The LED indicator keeps the 2-char short form **"P1" / "P2"** (a 3x5
mini-font, 2 chars fit the 12 matrix columns; "PROG_1" would not).

## 3. Current-State Analysis (what the integration can reuse)

- **State machine:** 6 states — `STANDBY, ACCELERATING, RUNNING_CW, RUNNING_CCW,
  DECELERATING, WAITING` (`controller_state.h:7-14`), dispatched per tick from
  `tickController()` (`controller_logic.cpp:345-370`).
- **Available actions (reusable as program steps, all already implemented):**
  - Set direction: `setDirectionRelay()` (`hardware_io.h:30`) — used in `handleStandby`
    (`controller_logic.cpp:123-136`).
  - Select speed: `applySpeedDataset()` (`hardware_io.h:31`, relay M1/M2 bits →
    `DATASET_0/2/4/6`).
  - Start: `applySpeedDataset()` + `setStartRelayEnabled(true)` +
    `beginAcceleration()` (`controller_logic.cpp:138-148`).
  - Stop: `setStartRelayEnabled(false)` + `beginDeceleration(..., RestartIntent::NONE)`
    (`controller_logic.cpp:245-258`).
  - Direction change while running (brake → safety pause → auto-restart in new
    direction): `requestDirectionChange()` (`controller_logic.cpp:50-71`) —
    **mandatory pattern** for any mid-program direction reversal.
- **Wait capability:** today only the fixed `sicherheitsPauseMs` (150 ms) in the
  `WAITING` state (`config.h:101`, `controller_logic.cpp:328-343`). A configurable
  per-step wait **does not exist yet** — new capability required (decided Q4: it is
  a program step with a sequencer-local timer, NOT an extension of `WAITING`).
- **Display:** 12x8 `ArduinoLEDMatrix`, frame drawn in
  `updateLedAnimationFrame()` (`led_animation.cpp:88-190`): outer ring animation,
  icon glyphs (pause bars `ICON_PAUSE`, play triangles `ICON_PLAY_CW/CCW`), profile
  dots. **No character font exists** — "P1"/"P2" glyphs are new.
- **Config pattern:** `constexpr` struct + `static constexpr` instance
  (`config.h:39-114`) — the program config should follow this pattern.
- **Input handling:** `InputSnapshot` carries raw levels, no edge detection
  (`hardware_io.h:16-23`); debounce is blocking `delay()` inside the handlers
  (`debounceActionMs` 200 ms / `debounceDirectionMs` 150 ms, `config.h:103-104`).
  The decided combo model (hold SPEED, press PLAY) is **level-based** and therefore
  robust against the coarse sampling — no edge/window bookkeeping needed (see R1).
- **Verified safe precondition (Q1 assumption):** a preset press in `STANDBY`
  only updates `selectedRunDataset`; the dataset is applied to the relays only
  when the start relay is on (`controller_logic.cpp:27-30`). Holding a SPEED
  button while the motor is still is safe.
- **Confirmed bug (Q4 observation, → R12):** pressing GELB 1/2 in
  `RUNNING_CW/CCW` applies the new dataset instantly and stays in `RUNNING`
  (`controller_logic.cpp:226-243`) — no ramp transition. Speed-mode switching
  must run through the acceleration/deceleration ramp instead.
- **Constraints:** RA4M1 single-threaded, 32 KB SRAM / 256 KB flash
  (`ARCHITECTURE.md`); no FreeRTOS patterns; USB Serial (115200) is the debug
  channel; logs are German with `F()` strings and `[TAG]` prefixes.
- **No leftover program code:** EEPROM "program steps at offset 32" in README.md is
  documentation from the removed advanced-control chain — not present in
  `basic-control/`.

## 4. Requirements

### R1 — Combo detection & program selection (decided: Q1/Q2)
- Valid only in `STANDBY` (motor still, start relay off).
- **Combo = SPEED button held + PLAY pressed** (level-based, both LOW; no time
  window required because held buttons keep their level across many loop
  iterations). Combo check runs **before all other input handling** in
  `handleStandby`, so the preset/start single-press actions are suppressed on
  the combo tick.
- GELB 1 + PLAY → **PROG_1**, GELB 2 + PLAY → **PROG_2**.
- The combo enters a new **`PROGRAM_SELECTION` state** which stores the target
  program id and shows the "P1"/"P2" indicator.
- In `PROGRAM_SELECTION` the controller **waits until all pressed buttons are
  released**; only then does program execution start (step 0).
- A press of any *other* button during `PROGRAM_SELECTION` cancels the
  selection (back to `STANDBY`, normal action of that button executes — same
  philosophy as R6).
- PLAY-first combo detection is explicitly **deferred** (future extension, Q1).

### R2 — Program config (new `program_config.h`, decided: Q3)
- New header `basic-control/program_config.h`, same style as `config.h`:
  - `enum class SchleuderProgramId { NONE, PROG_1, PROG_2 }` (naming per Q12).
  - `enum class ProgramStepAction` — step types (see R3).
  - `struct ProgramStep { ProgramStepAction action; <params>; }` where params
    cover direction, dataset, and wait duration.
  - `struct SchleuderProgram { SchleuderProgramId id; SpinDirection
    startDirection; const ProgramStep* steps; uint8_t stepCount; }`
    (or `PROGMEM` array). `startDirection` is the program's declared,
    **absolute** initial direction (CW/CCW) — per program, compile-time.
    There are **no relative/toggle direction semantics** anywhere in the
    feature.
  - `static constexpr` definitions of the two programs, e.g.
    `SCHLEUDER_PROGRAMS[2] = { PROG_1, PROG_2 }`.
- Programs live in flash (const), not SRAM — compile-time only, no EEPROM, no
  runtime editing.

### R3 — Step types: reuse of the normal action flow (decided: Q11)
Flat step vocabulary, **no repetition**, steps spelled out (no `RUN_FOR` sugar):
1. `DIRECTION <CW|CCW>` — stopped: `setDirectionRelay()`; running in opposite
   direction: existing `requestDirectionChange()` pattern (brake → safety pause
   → auto-restart); already running in that direction: done immediately.
2. `SPEED <dataset 0/2/4/6>` — `applySpeedDataset()`; completion semantics
   depend on the R12 fix: stopped → done immediately; running → done when back
   in `RUNNING_*` after the ramp.
3. `START` — start relay + `beginAcceleration()`; done when state becomes
   `RUNNING_*`.
4. `STOP` — start relay off + `beginDeceleration(RestartIntent::NONE)`; done
   when `STANDBY` reached (incl. safety pause).
5. `WAIT <ms>` — **new**: sequencer-local idle timer (millis()-based,
   non-blocking). The motor/state machine continues unchanged during a WAIT
   (normally the motor keeps running — WAIT is the program's timed run/idle
   phase). Explicitly NOT the `WAITING` safety-pause state.

All direction values are **absolute** (CW/CCW) — there are no relative/toggle
direction steps. The motor's initial direction at program start comes from the
program config (`startDirection`, R2/R4), never from leftover manual
LINKS/RECHTS state.

Step completion for motor steps is **state-based, not time-based**: the
sequencer waits for the expected state outcome. Time-based completion applies
only to `WAIT` steps.

### R4 — Program runner (decided: Q8a — sequencer overlay)
- New state `PROGRAM_SELECTION` (selection arm phase, R1). Execution itself is
  a **sequencer overlay on the existing states** — no separate or parallel
  motor control path; every step maps 1:1 onto the existing transition APIs.
- `ControllerState` gains the program context:
  ```
  SchleuderProgramId programId;        // NONE / PROG_1 / PROG_2
  uint8_t programStepIndex;            // or pointer into the flash step array
  unsigned long programStepStartMs;    // WAIT step timer
  ```
- Program execution start (combo buttons released) is **deterministic**: the
  runner first applies the program's `startDirection`
  (`setTargetDirection()` + `setDirectionRelay()` — safe, start relay is off
  in `STANDBY`), overwriting any leftover manual direction state, then
  dispatches step 0. The direction is thus fixed by key input: the combo key
  selects the program, the program declares its absolute direction.
- Each tick, when a program is executing:
  1. Any button press → exit program mode, then execute that button's normal
     action in the current state (R6).
  2. Current step complete? → advance to next step / finish (finish: log,
     clear context; last step is `STOP` per Q5a → terminal `STANDBY`).
  3. Else → the normal state machine keeps executing the step's transitions.
- While a program is active, the runner owns input interpretation (R6).

### R5 — "P1"/"P2" display indicator (decided: Q6/Q7)
- While a program is selected or running, the 12x8 matrix shows **"P1"** or
  **"P2"** (3x5 mini-font glyphs P, 1, 2 — 2 chars fit the 12 columns).
- The indicator replaces the normal icon; the outer ring keeps its normal
  per-state behavior.
- Solid (no blinking), no step-level feedback — the optional variations from
  Q6/Q7 are NOT implemented; the base requirement stands.
- Indicator vanishes after program finish/abort (normal display resumes).

### R6 — Exit / abort (decided: Q9/Q10)
- **Any** button press while a program runs exits the program mode: remaining
  steps are discarded, program context is cleared, and the press **falls
  through to the normal handler** of the current state — the triggered action
  executes with its normal semantics:
  - ROT (STOP) → normal stop flow (deceleration ramp → safety pause →
    `STANDBY`).
  - GELB 1/2, LINKS/RECHTS, START → their normal per-state actions (including
    the legacy START re-press → preset 1 quirk in `RUNNING`,
    `controller_logic.cpp:261-268`).
  - Buttons whose normal action is a no-op in the current state simply leave
    the motor in its last defined state.
- There is **no separate abort flow** — safety comes from the normal flows.

### R7 — Safety
- Any direction reversal inside a program must pass through
  brake → wait → auto-restart (existing pattern); never flip the direction relay
  while the start relay is on.
- Programs can only start from standstill (`STANDBY`, start relay off).
- After exit (R6) or completion the system is in a defined safe state
  (decelerated, start relay off).
- Single-threaded: no timers/interrupts beyond the existing `millis()` style;
  blocking `delay()` is acceptable for relay-settle/debounce moments per existing
  style, but program step durations must use millis()-based checks so inputs stay
  responsive.

### R8 — Serial diagnostics (naming per Q12)
- Program lifecycle is logged with dedicated tags **`[PROG_1]` / `[PROG_2]`**:
  selection, start of execution, every step begin/complete, WAIT countdown
  (optional), exit via button press, finish.
- Keep the existing German log style and `F()` strings.

### R9 — Config & input surface
- `InputSnapshot` stays as-is (raw levels); combo detection lives in the logic
  layer (level-based, no stored snapshot/edges needed).
- No new pins, no wiring changes, no changes to `hardware_io.cpp`.

### R10 — Documentation / mirror maintenance (project rule)
Per `AGENTS.md`, after firmware changes also update:
- `basic-control/docs/honey_config.js` (mirror: program definitions)
- `basic-control/docs/honey_state_machine.js` (mirror: `PROGRAM_SELECTION`
  state + runner overlay)
- `basic-control/docs/js/lib/simulationScenarios.js` (+ BMP snapshots via
  `npm run snapshot`) — scenarios decided in Q13:
  1. Full program run: simple dataset → CW → start → wait → CCW → wait → CW →
     speed change → CCW → stop.
  2. Variation: after "CCW, wait" the STOP button is pressed (exit program
     mode → normal stop flow).
- `basic-control/docs/InteractiveDocumentation.html` (state machine / control
  panel if needed)
- `ARCHITECTURE.md` (folder map, domain index)
- `README.md` only if commands/workflows change.

### R11 — Memory
- Programs constant in flash; runner context a few bytes in RAM. No dynamic
  allocation on the RA4M1.

### R12 — Ramp on speed-mode switch while running (bug from Q4 observation)
Confirmed in code: pressing GELB 1/2 in `RUNNING_CW/CCW` applies the new
dataset instantly and stays in `RUNNING` (`controller_logic.cpp:226-243`) — no
`ACCELERATING` ramp. Expected behavior: speed-mode switching must run through
the acceleration/deceleration ramp like a start/stop transition.

This is an existing-behavior fix, tracked as part of this feature because the
`SPEED` step's completion detection depends on it (R3.2). Implementation:
preset press in `RUNNING_*` starts a ramp (accelerate to new dataset /
decelerate if switching down) and returns to `RUNNING_*` at ramp end.

## 5. Integration File Checklist

| File | Change |
|---|---|
| `basic-control/program_config.h` | **new** — step types, PROG_1/PROG_2 definitions (flash) |
| `basic-control/controller_state.h/.cpp` | `PROGRAM_SELECTION` state id + `ProgramContext` fields (programId, stepIndex, stepStartMs) |
| `basic-control/controller_logic.h/.cpp` | combo detection in `handleStandby`, `PROGRAM_SELECTION` handler, step sequencer overlay, WAIT timer, exit-on-press, R12 ramp fix |
| `basic-control/led_animation.h/.cpp` | P1/P2 mini-font glyphs + program-active render branch |
| `basic-control/main.cpp` | pass program context through tick/led update; boot banner note (optional) |
| `basic-control/hardware_io.*` | unchanged |
| `basic-control/docs/honey_config.js` | mirror programs |
| `basic-control/docs/honey_state_machine.js` | mirror `PROGRAM_SELECTION` + runner |
| `basic-control/docs/js/lib/simulationScenarios.js` | 2 new scenarios (Q13) |
| `ARCHITECTURE.md` | folder map / domain index |

## 6. Design Sketch (decided)

```
Selection (new state PROGRAM_SELECTION):
  handleStandby: combo check runs BEFORE all other input handling:
      (preset1Pressed || preset2Pressed) && startPressed
          -> programId = PROG_1/PROG_2, id = PROGRAM_SELECTION, log [PROG_x]
  handleProgramSelection:
      level(any SPEED or START)          -> keep waiting (suppress all actions)
      other button pressed               -> cancel: id = STANDBY, normal handling
      all combo buttons released         -> apply startDirection (dir relay, safe
                                            in STANDBY), programStepIndex = 0,
                                            execution starts

Runner (overlay; programId != NONE && id != PROGRAM_SELECTION):
  tickController:
      1. any button pressed?  -> clear program context, fall through to the
                                 normal handler of the current state (R6)
      2. current step done?   -> advance to next step / finish ([PROG_x] logs)
      3. else                 -> normal state machine executes the step's
                                 motor transitions

Step completion:
  DIRECTION -> stopped/already-in-direction: done immediately;
               running opposite: done when RUNNING_* (new direction)
  SPEED     -> stopped: done immediately; running: done when RUNNING_* again (R12)
  START     -> done when RUNNING_*
  STOP      -> done when STANDBY (safety pause included)
  WAIT      -> done when millis() - programStepStartMs >= step.waitMs
```

## 7. Todos

- [ ] **Human input:** confirm PROG_1/PROG_2 step lists + WAIT durations
      (PROG_1 skeleton from Q13, see below; PROG_2 still open)
- [ ] **R12 fix:** speed-mode switch while `RUNNING` must ramp
      (accelerate/decelerate) instead of instant dataset apply
- [ ] `program_config.h`: step types + two program definitions (flash)
- [ ] `ControllerState`: `PROGRAM_SELECTION` state + program context fields
- [ ] Combo detection + `PROGRAM_SELECTION` handler (suppression, release-to-run)
- [ ] Step sequencer overlay in `controller_logic.cpp` (dispatch, state-based
      completion, WAIT timer, finish path)
- [ ] Program exit on any button press (fall-through to normal handlers)
- [ ] `led_animation`: "P1"/"P2" glyphs + display branch
- [ ] Serial logs: `[PROG_1]`/`[PROG_2]` lifecycle messages
- [ ] Build check: `npm run build` (env `r4wifi_basic_control`)
- [ ] Update mirrors: `honey_config.js`, `honey_state_machine.js`,
      `simulationScenarios.js` (2 scenarios per Q13)
- [ ] Regenerate BMP snapshots (`npm run snapshot`) + verify scenarios
- [ ] Update `InteractiveDocumentation.html`, `ARCHITECTURE.md`
      (and `README.md` if needed)
- [ ] Flash + manual hardware verification (combo timing, release-to-run, step
      flow, WAIT, exit on any button, abort mid-run, indicator)
- [ ] Safety review of every program step sequence (brake-before-reverse,
      terminal state)

**PROG_1 skeleton (from Q13 scenario, initial direction per config):**
`startDirection = CW`, then `SPEED dAtA 0 → START → WAIT <t1> → DIRECTION CCW →
WAIT <t2> → DIRECTION CW → SPEED dAtA 4 → DIRECTION CCW → STOP`
(durations `<t1>/<t2>` TBD; the mid-run `DIRECTION` steps use the existing
brake → safety pause → auto-restart pattern — absolute values, no toggles).

## 8. Decisions Log (Q1–Q13)

| Q | Decision | Effect |
|---|---|---|
| Q1 | SPEED button held + PLAY pressed (PLAY-first deferred) | R1: level-based combo, no window |
| Q2 | Selection only in `STANDBY` | R1 |
| Q3 | Compile-time only, flash | R2 |
| Q4 | WAIT = program step with sequencer-local timer, distinct from `WAITING` state; plus ramp bug observation | R3.5, R12 |
| Q5 | (a) final step `STOP` → completes in `STANDBY` | R4 |
| Q6 | Optional display variations NOT implemented; base indicator requirement stands | R5 |
| Q7 | No step-level feedback | R5 |
| Q8 | (a) sequencer overlay on existing states; valid program with steps enters "PROGRAMM" mode | R4 |
| Q9 | Any button press exits program mode, then executes that button's normal action | R6 |
| Q10 | See Q9 (incl. START re-press quirk after exit) | R6 |
| Q11 | Steps: direction, speed, start, stop, wait — no repetition, no `RUN_FOR` | R3 |
| Q12 | Naming: PROG_1 / PROG_2 (LED keeps "P1"/"P2" short form) | §2, R8 |
| Q13 | Yes: full-run scenario + STOP-after-CCW-wait variation | R10, §7 |
| D1 | Initial direction is absolute & per program: `startDirection` in the program config (key-selected program ⇒ deterministic direction). No relative/toggle direction steps; leftover manual direction is overwritten at program start | R2, R3, R4 |
