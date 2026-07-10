/**
 * useBmpSimulation.js — Headless batch simulator for BMP export
 * ==============================================================
 * Runs the REAL HoneyStateMachine (not a mock) in a tight virtual-clock loop
 * and records the per-tick state into a 2D color matrix suitable for BMP
 * rendering via bmpWriter.js.
 *
 * Design:
 *   - Instantiates HoneyStateMachine with simSpeed forced to 1.0 (real timing
 *     relationships preserved). The virtual clock advances by tickDurationMs
 *     each step — control resolution via the scenario, not by distorting time.
 *   - At each tick: feed events → sm.tick(inputs, virtualNow) → sm.getState()
 *     → derive RPM → map to Y coordinate → write color into matrix.
 *   - No Vue reactivity overhead — the matrix is a plain 2D array built in a
 *     tight synchronous loop. This runs 1000× faster than real-time.
 *   - Swappable backend: to visualize real hardware data, replace the
 *     HoneyStateMachine call with a data source that provides {id, progress,
 *     direction, activeDataset} per tick.
 *
 * Hardware fault injection:
 *   - Accepts scenario.hardwareFaults (array of fault specs).
 *   - Creates a HardwareFaultInjector and passes it to HoneyStateMachine.
 *   - Processes faultInject / faultClear scenario events for dynamic faults.
 *   - Adds a mismatch row (top of BMP) that flags ticks where the actual
 *     relay state diverged from the software-commanded state.
 *
 * Configuration sources (no hardcoded physics values):
 *   - rampReferenceMaxRpm, datasets, safetyPauseMs → HoneyConfig
 *   - yResolution (visualization) → default constant, overridable per call
 *
 * @module useBmpSimulation
 */

import HoneyStateMachine from '../../honey_state_machine.js';
import HoneyConfig from '../../honey_config.js';
import HardwareFaultInjector from '../lib/hardware_fault_injector.js';
import { STATE_COLORS, EVENT_COLOR, HW_FAULT_COLOR, BG_COLOR } from '../lib/simulationScenarios.js';

// ── Visualization defaults (not hardware parameters) ──────────────────

/** Number of discrete Y-axis rows for RPM mapping. Must be odd so the zero
 *  line lands exactly on a pixel row. 41 rows → 20 above + zero + 20 below. */
const DEFAULT_Y_RESOLUTION = 41;

// ── RPM computation ────────────────────────────────────────────────────

/**
 * Derive signed RPM from a state machine snapshot.
 *
 * The HoneyStateMachine tracks progress (0..1) and direction, not absolute
 * RPM. We compute RPM = progress × datasetTargetRpm × directionSign.
 *
 * Uses state.activeDataset (post-fault actual relay state) so RPM reflects
 * what the motor physically does, not what the software commanded.
 *
 * @param {object} state  — sm.getState() return value
 * @param {object} config — HoneyConfig (for dataset targetRpm lookup)
 * @returns {number} signed RPM (-maxRpm .. +maxRpm)
 */
function computeRpm(state, config) {
    // Zero-RPM states
    if (state.id === 'STANDBY' || state.id === 'WAITING') {
        return 0;
    }

    var ds = config.datasets[state.activeDataset];
    var targetRpm = ds ? ds.targetRpm : 0;

    // Constant-speed states — target RPM reached, progress = 1.0
    if (state.id === 'RUNNING_CW')  return targetRpm;
    if (state.id === 'RUNNING_CCW') return -targetRpm;

    // Ramping states — interpolate via progress
    var direction;
    if (state.id === 'DECELERATING') {
        // During braking we still move in the original running direction
        direction = state.runningDirection;
    } else {
        // ACCELERATING — heading toward targetDirection
        direction = state.targetDirection;
    }
    var sign = (direction === 'CCW') ? -1 : 1;

    return state.progress * targetRpm * sign;
}

// ── Y-axis mapping ─────────────────────────────────────────────────────

/**
 * Map a signed RPM value to a Y pixel row.
 *
 * Row 0 is reserved for event markers.
 * Row 1..yResolution carry RPM data.
 * The zero-line sits at row zeroLine = (yResolution + 1) / 2.
 *
 * When a mismatch row is present (yOffset=1), RPM rows shift up by 1:
 * Row 0 = event markers, Row 1 = mismatch, Rows 2..yResolution+1 = RPM.
 *
 * @param {number} rpm        — signed RPM
 * @param {number} maxRpm     — absolute max RPM for scaling (from HoneyConfig)
 * @param {number} yResolution — number of RPM rows
 * @param {number} [yOffset=0] — rows reserved below RPM data (event + optional mismatch)
 * @returns {number} row index
 */
function mapRpmToY(rpm, maxRpm, yResolution, yOffset) {
    yOffset = yOffset || 0;
    var halfRows = (yResolution - 1) / 2;       // e.g. 20 for yResolution=41
    var zeroLine = yOffset + (yResolution + 1) / 2;  // zero-line in absolute matrix coords
    var normalized = rpm / maxRpm;               // -1.0 .. 1.0
    var yPos = Math.round(normalized * halfRows) + zeroLine;
    // Clamp to valid RPM range
    var minRow = yOffset + 1;
    var maxRow = yOffset + yResolution;
    return Math.max(minRow, Math.min(maxRow, yPos));
}

// ── Main simulation entry point ────────────────────────────────────────

/**
 * Run a headless batch simulation and return the result matrix.
 *
 * @param {object} scenario — from simulationScenarios.js
 *   @property {number} totalTicks
 *   @property {number} [tickDurationMs=50]
 *   @property {Array<{atTick:number, type:string}>} events
 *   @property {Array<object>} [hardwareFaults] — pre-registered fault specs
 * @param {object} [opts]   — optional overrides
 *   @property {number} [yResolution=41]
 *   @property {number} [simSpeed=1.0]
 * @returns {{ matrix: Array<Array<{r,g,b}>>, width: number, height: number }}
 */
export function runHeadlessSimulation(scenario, opts) {
    opts = opts || {};
    var yResolution = opts.yResolution || DEFAULT_Y_RESOLUTION;
    var simSpeed = (opts.simSpeed != null) ? opts.simSpeed : 1.0;

    // Build a config copy with BMP-appropriate simSpeed (real timing).
    // Shallow-copy the config so we don't mutate the shared HoneyConfig.
    var cfg = Object.assign({}, HoneyConfig);
    cfg.simSpeed = simSpeed;

    // ── Hardware fault injection ──────────────────────────────────────
    var hasHwFaults = !!(scenario.hardwareFaults && scenario.hardwareFaults.length > 0);
    var faultInjector = hasHwFaults
        ? new HardwareFaultInjector(scenario.hardwareFaults)
        : null;

    var sm = new HoneyStateMachine(cfg, faultInjector);
    var maxRpm = cfg.rampReferenceMaxRpm;
    var tickDurationMs = scenario.tickDurationMs || 50;

    // Layout: row 0 = event markers, [row 1 = fault mismatch if hardware faults],
    // rows (1+yOffset)..(yResolution+yOffset) = RPM data.
    var yOffset = hasHwFaults ? 1 : 0;
    var width = scenario.totalTicks;
    var height = yResolution + 1 + yOffset;   // +1 for event row, +yOffset for optional mismatch
    var zeroLine = yOffset + (yResolution + 1) / 2;  // absolute row index of RPM zero line
    var mismatchRow = hasHwFaults ? 1 : -1;   // row index for fault mismatch markers

    // Pre-allocate matrix filled with background color
    var matrix = new Array(height);
    for (var row = 0; row < height; row++) {
        matrix[row] = new Array(width);
        for (var col = 0; col < width; col++) {
            matrix[row][col] = BG_COLOR;
        }
    }

    // Pre-index events by tick for O(1) lookup
    var eventsByTick = new Array(width);
    for (var i = 0; i < width; i++) {
        eventsByTick[i] = [];
    }
    for (var e = 0; e < scenario.events.length; e++) {
        var ev = scenario.events[e];
        if (ev.atTick < width) {
            eventsByTick[ev.atTick].push(ev);
        }
    }

    // ── Simulation loop ──────────────────────────────────────────────
    // Virtual clock: start at a large enough value to avoid zero-timestamp
    // edge cases in the state machine's debounce guard (_lastTickMs init = 0).
    var virtualNow = 1000;

    for (var tick = 0; tick < width; tick++) {
        // 1. Build input snapshot for this tick
        var tickEvents = eventsByTick[tick];
        var inputs = {
            dirLeftPressed:  false,
            dirRightPressed: false,
            stopPressed:     false,
            startPressed:    false,
            preset1Pressed:  false,
            preset2Pressed:  false
        };

        var hasFaultEvents = false;

        for (var j = 0; j < tickEvents.length; j++) {
            var type = tickEvents[j].type;
            if (type === 'dirLeft')              inputs.dirLeftPressed = true;
            else if (type === 'dirRight')        inputs.dirRightPressed = true;
            else if (type === 'start')           inputs.startPressed = true;
            else if (type === 'stop')            inputs.stopPressed = true;
            else if (type === 'preset1')         inputs.preset1Pressed = true;
            else if (type === 'preset2')         inputs.preset2Pressed = true;
            else if (type === 'faultInject')     hasFaultEvents = true;
            else if (type === 'faultClear')      hasFaultEvents = true;
        }

        // 2. Process hardware fault events (before tick so faults are active during the tick)
        if (hasFaultEvents && faultInjector) {
            for (var fe = 0; fe < tickEvents.length; fe++) {
                var fev = tickEvents[fe];
                if (fev.type === 'faultInject' && fev.payload) {
                    faultInjector.injectFault(fev.payload);
                } else if (fev.type === 'faultClear' && fev.payload) {
                    faultInjector.clearFault(fev.payload.faultId);
                }
            }
        }

        // 3. Set tick counter for fault injector timing windows
        sm.setCurrentTick(tick);

        // 4. Advance state machine
        sm.tick(inputs, virtualNow);

        // 5. Read current state
        var state = sm.getState(virtualNow);

        // 6. Compute RPM and map to Y
        var rpm = computeRpm(state, cfg);
        var yPos = mapRpmToY(rpm, maxRpm, yResolution, yOffset);

        // 7. Write into matrix
        var color = STATE_COLORS[state.id] || STATE_COLORS.STANDBY;

        // Zero-line reference (always drawn in standby color for orientation)
        matrix[zeroLine][tick] = STATE_COLORS.STANDBY;

        // Data point
        matrix[yPos][tick] = color;

        // Fill area between data point and zero line (solid area chart)
        if (yPos > zeroLine) {
            for (var r = zeroLine; r <= yPos; r++) {
                matrix[r][tick] = color;
            }
        } else if (yPos < zeroLine) {
            for (var rr = yPos; rr <= zeroLine; rr++) {
                matrix[rr][tick] = color;
            }
        }

        // Event marker in bottom row
        if (tickEvents.length > 0) {
            matrix[0][tick] = EVENT_COLOR;
        }

        // Fault mismatch marker: flag ticks where actual ≠ commanded
        if (hasHwFaults && state.commandedDataset !== state.activeDataset) {
            matrix[mismatchRow][tick] = HW_FAULT_COLOR;
        }

        // 8. Advance virtual clock
        virtualNow += tickDurationMs;
    }

    return { matrix: matrix, width: width, height: height };
}
