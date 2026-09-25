# Feature Doc: Combo-Button Schleuder-Programs (P1 / P2)

**Status:** DRAFT — open questions at the end require human decisions
**Target:** `basic-control` firmware (env `r4wifi_basic_control`, Arduino Uno R4 WiFi / RA4M1)
**Date:** 2026-09-25

---

## 1. Goal

A combination press of the **Play-Button** together with **Speed-Button 1** or
**Speed-Button 2** starts one of two predefined multistep programs (**P1** / **P2**).

- A program is an ordered sequence of **unique steps** built exclusively from actions
  that already exist and are reachable via the current buttons (direction, speed
  preset, start, stop / direction change), plus **new program-only steps** such as a
  configured **wait time**.
- The programs are defined in a **program config** (new, compile-time).
- While a program runs, the Arduino indicates the active program on the 12x8 LED
  matrix with a **"P1" / "P2" indicator**.
- Every individual step must trigger the **normal existing action flow** (same relay
  sequences, same ramp/state-machine transitions, same serial logging) — no separate
  or parallel motor control path.

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
  per-step wait **does not exist yet** — new capability required.
- **Display:** 12x8 `ArduinoLEDMatrix`, frame drawn in
  `updateLedAnimationFrame()` (`led_animation.cpp:88-190`): outer ring animation,
  icon glyphs (pause bars `ICON_PAUSE`, play triangles `ICON_PLAY_CW/CCW`), profile
  dots. **No character font exists** — "P1"/"P2" glyphs are new (a 3x5 mini-font,
  2 chars ≈ 7-8 cols, fits the 12 cols).
- **Config pattern:** `constexpr` struct + `static constexpr` instance
  (`config.h:39-114`) — the program config should follow this pattern.
- **Input handling:** `InputSnapshot` carries raw levels, no edge detection
  (`hardware_io.h:16-23`); debounce is blocking `delay()` inside the handlers
  (`debounceActionMs` 200 ms / `debounceDirectionMs` 150 ms, `config.h:103-104`).
  A combo press therefore needs explicit edge/window logic (see Q1).
- **Constraints:** RA4M1 single-threaded, 32 KB SRAM / 256 KB flash
  (`ARCHITECTURE.md`); no FreeRTOS patterns; USB Serial (115200) is the debug
  channel; logs are German with `F()` strings and `[TAG]` prefixes.
- **No leftover program code:** EEPROM "program steps at offset 32" in README.md is
  documentation from the removed advanced-control chain — not present in
  `basic-control/`.

## 4. Requirements

### R1 — Combo detection
- `START + PRESET_1` (both within the combo window) in `STANDBY` → start **P1**.
- `START + PRESET_2` → start **P2**.
- The combo must **suppress** the single-button actions of both involved buttons
  (no preset selection to `GELB 1`/`GELB 2`, no plain start).
- Detection must work despite coarse loop sampling (blocking `delay()` calls up to
  200 ms) → needs stored previous input snapshot (edges) + a time window
  (recommended 400–600 ms, see Q1).
- Combo is evaluated **before** all other input handling in `handleStandby`.

### R2 — Program config (new `program_config.h`)
- New header `basic-control/program_config.h`, same style as `config.h`:
  - `enum class ProgramStepAction` — step types (see R3).
  - `struct ProgramStep { ProgramStepAction action; <params>; }` where params cover
    direction, dataset, and durations.
  - `struct SchleuderProgram { const __FlashStringHelper* name; const ProgramStep*
    steps; uint8_t stepCount; }` (or `PROGMEM` array).
  - `static constexpr` definitions of the two programs, e.g.
    `SCHLEUDER_PROGRAMS[2] = { P1, P2 }`.
- Programs live in flash (const), not SRAM.
- Content: the actual step lists for P1/P2 are **domain input from the human
  developer** (see Q10/Q11).

### R3 — Step types: reuse of the normal action flow
Each step maps 1:1 onto the existing transition APIs — no new motor control path:
1. `SET_DIRECTION` (CW/CCW) — `setDirectionRelay()`, only while stopped.
2. `SET_SPEED` (dataset dAtA 0/2/4/6) — `applySpeedDataset()`.
3. `START` — start relay + `beginAcceleration()`.
4. `STOP` — start relay off + `beginDeceleration(RestartIntent::NONE)`.
5. `DIR_CHANGE` — the existing `requestDirectionChange()` pattern
   (brake → safety pause → auto-restart opposite direction).
6. `WAIT <ms>` — **new**: configurable wait step (see R4/Q4).
7. *(Optional, see Q11)* `RUN_FOR <ms>` — sugar for START → WAIT → STOP, if the
   programs need timed run phases.

Step completion for motor steps is **state-based, not time-based**: the sequencer
waits for the expected state outcome (e.g. `RUNNING_CW/CCW` after `START`,
`STANDBY` after `STOP` + safety pause). Time-based completion applies only to
`WAIT`/`RUN_FOR` steps.

### R4 — Program runner
- New `ProgramContext` (active program id, step index, step timer, abort flag)
  added to the controller state model (or a dedicated runner struct passed to
  `tickController`, see Q8).
- A step sequencer in `controller_logic.cpp` advances one step at a time:
  trigger step → wait for completion (state outcome or timer) → next step.
- A configurable **wait** is a first-class step executed without blocking the
  loop (millis()-based timer).
- While a program is active, the runner owns input interpretation (R1/R6/R9).
- Program end reaches a defined terminal state (see Q5).

### R5 — "P1"/"P2" display indicator
- While a program runs (from program start to terminal settle), the LED matrix
  shows **"P1"** or **"P2"**.
- New 3x5 mini-font glyphs in `led_animation.cpp` (P, 1, 2; 2 chars fit the
  12-column matrix).
- The program indicator replaces the normal icon during program run; the ring
  animation policy during program run is a design decision (see Q6).
- The indicator also shows during `WAIT` steps (optionally blinking, see Q7).

### R6 — Abort
- `ROT (STOP)` at any time during a program aborts it: the normal stop flow runs
  (deceleration ramp → safety pause → `STANDBY`), remaining steps are discarded,
  program context is cleared, normal display resumes. (Semantics to confirm: Q9.)

### R7 — Safety
- Any direction reversal inside a program must pass through
  brake → wait → auto-restart (existing pattern); never flip the direction relay
  while the start relay is on.
- Programs can only start from standstill (`STANDBY`, start relay off).
- After abort or completion the system is in a defined safe state (decelerated,
  start relay off).
- Single-threaded: no timers/interrupts beyond the existing `millis()` style;
  blocking `delay()` is acceptable for relay-settle/debounce moments per existing
  style, but program step durations must use millis()-based checks so inputs stay
  responsive.

### R8 — Serial diagnostics
- Program lifecycle is logged with dedicated tags, e.g. `[P1]` / `[P2]`:
  start, every step begin/complete, WAIT countdown (optional), abort, finish.
- Keep the existing German log style and `F()` strings.

### R9 — Config & input surface
- `InputSnapshot` stays as-is (raw levels); combo detection lives in the logic
  layer (needs a stored previous snapshot for edges).
- No new pins, no wiring changes, no changes to `hardware_io.cpp` (unless edge
  tracking is decided to live there).

### R10 — Documentation / mirror maintenance (project rule)
Per `AGENTS.md`, after firmware changes also update:
- `basic-control/docs/honey_config.js` (mirror: program definitions)
- `basic-control/docs/honey_state_machine.js` (mirror: combo detection + runner)
- `basic-control/docs/js/lib/simulationScenarios.js` (+ BMP snapshots via
  `npm run snapshot`)
- `basic-control/docs/InteractiveDocumentation.html` (state machine / control
  panel if needed)
- `ARCHITECTURE.md` (folder map, domain index)
- `README.md` only if commands/workflows change.

### R11 — Memory
- Programs constant in flash; runner context a few bytes in RAM. No dynamic
  allocation on the RA4M1.

## 5. Integration File Checklist

| File | Change |
|---|---|
| `basic-control/program_config.h` | **new** — step types, P1/P2 definitions |
| `basic-control/controller_state.h/.cpp` | `ProgramContext` fields (+ optional new state / wait duration field) |
| `basic-control/controller_logic.h/.cpp` | combo detection, step sequencer, WAIT handling, abort |
| `basic-control/led_animation.h/.cpp` | P1/P2 mini-font glyphs + program-active render branch |
| `basic-control/main.cpp` | pass program context through tick/led update; boot banner note (optional) |
| `basic-control/hardware_io.*` | unchanged (unless edge tracking is placed here) |
| `basic-control/docs/honey_config.js` | mirror programs |
| `basic-control/docs/honey_state_machine.js` | mirror combo + runner |
| `basic-control/docs/js/lib/simulationScenarios.js` | new scenarios |
| `ARCHITECTURE.md` | folder map / domain index |

## 6. Rough Design Sketch (proposal, not fixed)

```
Combo detection (in handleStandby, before all other checks):
  prevInputs (stored snapshot) + combo window timer
  edge(START) && (level(PRESET_1) within window || edge(PRESET_1) within window)
      -> startProgram(P1), skip preset & start handling this tick
  edge(START) && (level(PRESET_2) within window || edge(PRESET_2) within window)
      -> startProgram(P2)

Program runner (sequencer):
  ControllerState gains:
      uint8_t programId;        // 0 = none, 1 = P1, 2 = P2
      uint8_t programStepIndex; // or a pointer into flash
      unsigned long programStepStartMs;
      bool programAborted;

  Each tick, when programId != 0:
      1. STOP pressed            -> abort: normal stop flow, clear context
      2. current step done?      -> advance to next step / finish
      3. else                    -> do nothing (normal state machine continues
                                    executing the step's motor transitions)

  Step dispatch examples:
      SET_DIRECTION -> setDirectionRelay(); done immediately (if stopped)
      SET_SPEED     -> applySpeedDataset(); done immediately (if stopped)
      START         -> normal start flow; done when state becomes RUNNING_*
      RUN_FOR/WAIT  -> timer; done when elapsed
      STOP          -> normal stop flow; done when STANDBY reached
      DIR_CHANGE    -> requestDirectionChange(); done when RUNNING_* (opposite)
```

Open structural choice: sequencer overlay inside the existing states (smaller
change) vs. dedicated `PROGRAM_RUNNING` state(s) (cleaner separation, larger
change) — see Q8.

## 7. Todos

- [ ] **Human decisions:** answer Questions & Variations (Q1–Q12) below
- [ ] **Define P1/P2 step lists** (real domain programs with directions, speeds,
      run/wait durations, repetitions) → input for `program_config.h`
- [ ] `program_config.h`: step types + two program definitions (flash)
- [ ] `ControllerState`: program context fields (+ chosen runner structure)
- [ ] Combo detection with edge tracking + window (in logic layer)
- [ ] Step sequencer in `controller_logic.cpp` (dispatch + completion detection)
- [ ] Configurable `WAIT` step (new wait mechanism)
- [ ] Abort handling (STOP) in all program phases
- [ ] `led_animation`: "P1"/"P2" glyphs + display priority rules
- [ ] Serial logs: `[P1]`/`[P2]` lifecycle messages
- [ ] Build check: `npm run build` (env `r4wifi_basic_control`)
- [ ] Flash + manual hardware verification (combo timing, step flow, abort,
      indicator)
- [ ] Safety review of every program step sequence (brake-before-reverse,
      terminal state)
- [ ] Update mirrors: `honey_config.js`, `honey_state_machine.js`,
      `simulationScenarios.js`
- [ ] Regenerate BMP snapshots (`npm run snapshot`) + verify scenarios
- [ ] Update `InteractiveDocumentation.html`, `ARCHITECTURE.md`
      (and `README.md` if needed)

## 8. Questions & Variations (Human Developer to decide)

**Q1 — Combo timing & detection.** How is "combination press" defined?
- (a) First press opens a window (recommended 400–600 ms); the second press
  within the window triggers the program.
- (b) Both buttons must be held simultaneously for ≥ N ms (sustained overlap).
- (c) Exact-same-tick coincidence only (unreliable given the 200 ms blocking
  debounce delays — not recommended).
Also: which button opens the window — START only, or any of the two?

- [ANSWER] while in "STANDBY"-Mode the Motor is still, keeping the a SPEED-Button button pressed is safe in this state (confirm this Assumption), then pressing the "PLAY" Button, while one "SPEED"-Button is pressed, will trigger selection of the Programm. The Option of pressing the Play-Button first is to be added as a later Option.

**Q2 — Where is the combo valid?** Recommended: `STANDBY` only.
Variations: also allow combo while running (abort current run and start program?),
or in `WAITING`? Behavior of a combo press in non-STANDBY states: ignore silently
vs. abort current run vs. log warning?
 
  - [ANSWER] Allow Programm selection only in "STANDBY" 

**Q3 — Program storage.** Recommended: compile-time `constexpr` in flash
(simple, immutable, fits the existing `config.h` pattern).
Variations: EEPROM-persisted programs (README.md mentions "program steps at
offset 32" — leftover from the removed advanced-control chain; would need
revival + `params save` style commands), or JSON via ArduinoJson (lib already in
`platformio.ini`). Decide: hardcoded vs. runtime-editable?

  - [ANSWER] Compile time only in flash

**Q4 — WAIT step implementation.** Recommended: millis()-based program timer
executed in the existing `WAITING` state (extended with a configurable duration),
or a new `PROGRAM_WAIT` state. Alternative: sequencer-local timer in `STANDBY`
with relays untouched. Consider: should the normal 150 ms safety pause still
apply around program steps, and may a WAIT be interrupted by button presses
(other than STOP)?

  - [ANSWER] the Wait step is a Programm Step which is not to be confused with "WARTEN" State - its solely an defined IDLE-Time in the Programm Step Execution - after the previous Action is completed it starts and after the defined time is over the next Programstep (if any) is to be executed
  - [Observation] While evaluating this requirement, i fould that if in RUNNING-State, and in SPEED Mode 1 - and the SPEED-MODE 2 is selected, the ANLAUFEN-STATE is not activated, but "RUNNING"-State still remains active- this seems like a BUG, the ANLAUFEN-STATE should be active for the TIME of acceleration or decelleration (SPEED-Mode switching)

**Q5 — Program end behavior.** Options: (a) final step is `STOP` → program
completes in `STANDBY` (recommended, safest); (b) program ends while motor keeps
running at last state until manual STOP; (c) loop the program indefinitely
until STOP. Also: should the P1/P2 indicator stay lit briefly after completion
("done" state) or vanish immediately?

  - [ANSWER] a) 

**Q6 — Display policy during program.** Options:
- (a) "P1"/"P2" replaces the icon entirely while the program is active
  (recommended per feature description).
- (b) Alternate between "P1"/"P2" and the current step icon (~1 s cadence).
- (c) "P1"/"P2" on the icon area + keep the outer ring animation as-is.
- (d) Ring animation off during program.
Decide also: solid vs. blinking P1/P2, and whether WAIT steps show a distinct
indication (e.g. blink, Q7).

  - [ANSWER] 

**Q7 — Step-level feedback.** Should the display (or serial log) show *which*
step is running (e.g. step number "1."–"9.", or sub-glyphs), or is the coarse
"P1/P2 running" indicator enough?

**Q8 — Runner architecture.** Options:
- (a) Sequencer overlay in the existing states / `STANDBY` (smaller change,
  reuses all handlers; completion detection via state observation).
- (b) Dedicated `PROGRAM_RUNNING` state(s) with own handler (cleaner separation
  of manual vs. program operation, larger refactor, affects the JS mirror more).
Which fits the project's "small, safe changes" rule better?

**Q9 — Abort semantics.** ROT during program: (a) hard abort → normal stop flow
→ `STANDBY`, discard program (recommended); (b) pause/resume via Play (needs a
paused state + resume bookkeeping); (c) abort only during WAIT steps, ignore
during motor phases? Also: do other buttons (LINKS/RECHTS, GELB 1/2) during a
program abort, get ignored, or fall through to their normal actions?

**Q10 — Single-button behavior during program.** START re-press currently falls
back to preset 1 while running (`controller_logic.cpp:261-268`) — should this
legacy quirk also apply during program runs, or are all non-STOP presses ignored
while a program is active (recommended)?

**Q11 — Program step vocabulary.** Which steps do the real programs need?
Supply the actual P1/P2 step lists (direction, dataset, run duration, wait
duration, repetitions). Do the configs need loop/repeat support (e.g.
"run CCW 2 min → wait 1 min → run CW 2 min" × N cycles), or is a flat step list
enough? Is a `RUN_FOR` convenience step (START → wait → STOP) desired, or should
programs spell out START/WAIT/STOP explicitly?

**Q12 — Naming & log language.** Keep "P1"/"P2" as indicator text and `[P1]`/`[P2]`
as serial tags? German logs for program events consistent with the existing
logs? File/type names: `program_config.h`, `SchleuderProgram`, `ProgramStep` —
or something else (e.g. `PROG1`, "Schleuderprog")? Doc filename keeps
"schleuder" (matches Honigschleuder)?

**Q13 — Simulation coverage.** Add combo + program scenarios to the 41-scenario
BMP set (combo start, step transitions, WAIT, abort mid-run, completion)?
Any of these worth hardware fault-injection scenarios?
