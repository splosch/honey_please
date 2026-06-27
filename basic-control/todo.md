# Basic-Control Refactoring Todo

## Milestone 1: Configuration Extraction

- [x] Create a dedicated config header for pin assignments, timing constants, relay polarity, and debounce delays.
- [x] Replace global pin and timing constants in `main.cpp` with values from the config structure.
- [x] Generate the boot banner from the shared config data instead of duplicating pin mappings in log strings.
- [x] Verify that the documented wiring output matches the actual pin assignments used by the sketch.

## Milestone 2: Hardware Access Cleanup

- [ ] Introduce small helper functions or a thin HAL for relay writes, relay state reads, and button reads.
- [ ] Centralize active-HIGH versus active-LOW relay behavior behind the hardware abstraction.
- [ ] Normalize button handling so the state machine works with named logical inputs instead of raw `digitalRead()` calls.
- [ ] Keep initialization of pins and safe startup states grouped in one hardware setup path.

## Milestone 3: State Model Separation

- [ ] Move mutable runtime variables into a dedicated state structure.
- [ ] Define explicit types for controller state, requested direction, and pending restart intent.
- [ ] Replace scattered global state mutations with focused transition helpers.
- [ ] Keep ramp progress and timer bookkeeping in the controller state rather than mixed with rendering state.

## Milestone 4: State Machine Extraction

- [ ] Extract the `loop()` switch-case control flow into a controller module or class.
- [ ] Introduce helpers such as `beginAcceleration`, `beginDeceleration`, `requestDirectionChange`, and `completeWaitingPeriod`.
- [ ] Remove duplicated transition code between CW and CCW running branches.
- [ ] Make the controller operate on an input snapshot per tick instead of reading GPIO directly.

## Milestone 5: LED Animation Separation

- [ ] Move LED ring geometry and icon definitions into a dedicated animation module.
- [ ] Separate animation state from motor control state where possible.
- [ ] Make LED rendering consume controller state instead of reading global variables directly.
- [ ] Preserve the current visual behavior for standby, ramping, running, braking, and waiting states.

## Milestone 6: Logging and Messaging Cleanup

- [ ] Centralize repeated Serial output patterns for transitions and relay-state reporting.
- [ ] Standardize log messages for start, stop, direction change, restart, and waiting events.
- [ ] Keep wiring and startup information concise and derived from shared config values.

## Milestone 7: Validation

- [ ] Run `npm run basic-control:build` after each milestone.
- [ ] Flash with `npm run basic-control:flash` after hardware-facing changes.
- [ ] Confirm boot output, button behavior, relay switching, and LED animation still match the wiring-verification intent.
- [ ] Record any behavior differences before moving to the next milestone.