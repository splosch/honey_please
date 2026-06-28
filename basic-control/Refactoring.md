# Basic-Control Refactoring Todo

## Milestone 1: Configuration Extraction

- [x] Create a dedicated config header for pin assignments, timing constants, relay polarity, and debounce delays.
- [x] Replace global pin and timing constants in `main.cpp` with values from the config structure.
- [x] Generate the boot banner from the shared config data instead of duplicating pin mappings in log strings.
- [x] Verify that the documented wiring output matches the actual pin assignments used by the sketch.

## Milestone 2: Hardware Access Cleanup

- [x] Introduce small helper functions or a thin HAL for relay writes, relay state reads, and button reads.
- [x] Centralize active-HIGH versus active-LOW relay behavior behind the hardware abstraction.
- [x] Normalize button handling so the state machine works with named logical inputs instead of raw `digitalRead()` calls.
- [x] Keep initialization of pins and safe startup states grouped in one hardware setup path.
- [x] Extract hardware/input helpers from `main.cpp` into dedicated files (`hardware_io.h/.cpp`) to keep control flow and IO concerns separated.

## Milestone 3: State Model Separation

- [x] Move mutable runtime variables into a dedicated state structure.
- [x] Define explicit types for controller state, requested direction, and pending restart intent.
- [x] Replace scattered global state mutations with focused transition helpers.
- [x] Keep ramp progress and timer bookkeeping in the controller state rather than mixed with rendering state.

## Milestone 4: State Machine Extraction
- [x] Extract the `loop()` switch-case control flow into a controller module or class.
- [x] Introduce helpers such as `beginAcceleration`, `beginDeceleration`, `requestDirectionChange`, and `completeWaitingPeriod`.
- [x] Remove duplicated transition code between CW and CCW running branches.
- [x] Make the controller operate on an input snapshot per tick instead of reading GPIO directly.

## Milestone 4A: Multi Speed
- use /basic-control/docs/MultiSpeedSaftyBreak.md
- [x] Keep binary speed dataset mapping (`dAtA 0/2/4/6`) centralized so normal run stages and safety stages use the same relay-profile source of truth.

## Milestone 4B: SafetySwitch
- use /basic-control/docs/MultiSpeedSaftyBreak.md
 [ ] Add explicit states for `SAFETY_STAGE_1`, `SAFETY_STAGE_2`, and `SAFE_WAIT` (including safe return to `IDLE` only when lid is closed).
- [ ] Implement immediate safety transition on lid-open from running states (`SPIN_LOW`, `SPIN_HIGH`, optional `DYN_BRAKE`) into `SAFETY_STAGE_1`.
- [ ] Implement stage-1 safety braking profile (`dAtA 0`: `M1=LOW`, `M2=LOW`, `START/STOP=HIGH`) with non-blocking timer window of 1250 ms.
- [ ] Implement stage-2 safety braking profile (`dAtA 6`: `M1=HIGH`, `M2=HIGH`, `START/STOP=HIGH`) with non-blocking timer window of 150 ms.
- [ ] Enforce `SAFE_WAIT` lockout behavior (`START/STOP=LOW`, `M1=LOW`, `M2=LOW`) that blocks restart while lid input remains open.


## Milestone 5: LED Animation Separation

- [x] Move LED ring geometry and icon definitions into a dedicated animation module.
- [x] Separate animation state from motor control state where possible.
- [x] Make LED rendering consume controller state instead of reading global variables directly.
- [x] Preserve the current visual behavior for standby, ramping, running, braking, and waiting states.

## Milestone 6: Logging and Messaging Cleanup

- [ ] Centralize repeated Serial output patterns for transitions and relay-state reporting.
- [ ] Standardize log messages for start, stop, direction change, restart, and waiting events.
- [ ] Keep wiring and startup information concise and derived from shared config values.

## Milestone 7: Validation

- [x] Run `npm run basic-control:build` after each milestone.
- [ ] Flash with `npm run basic-control:flash` after hardware-facing changes.
- [ ] Confirm boot output, button behavior, relay switching, and LED animation still match the wiring-verification intent.
- [ ] Record any behavior differences before moving to the next milestone.