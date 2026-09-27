/**
 * honey_state_machine.js — Pure JS state machine
 * ==============================================
 * Mirrors basic-control/controller_state.cpp + controller_logic.cpp.
 *
 * No DOM access, no side effects. Exports a constructor that takes a
 * HoneyConfig object and returns a state machine with:
 *
 *   sm.getState(nowMs)  → read-only state snapshot (incl. ramp progress)
 *   sm.tick(inputs, nowMs) → process input + advance state if timers expired
 *   sm.reset()          → return to initial STANDBY
 *   sm.setCurrentTick(n) → set tick counter (for hardware fault injector timing)
 *
 * The state machine uses the same 7 states as the C++ controller:
 *   STANDBY → ACCELERATING → RUNNING_CW/CCW → DECELERATING → WAITING → …
 *   PROGRAM_SELECTION — Schleuder-Programm-Auswahl (Combo GELB x + START)
 *
 * Inputs shape (mirrors InputSnapshot in hardware_io.h):
 *   { dirLeftPressed, dirRightPressed, stopPressed, preset1Pressed, preset2Pressed, startPressed }
 *
 * All timing values are scaled by cfg.simSpeed so the same config can drive
 * real-time verification (simSpeed=1.0) and fast interactive demos (simSpeed=0.2).
 *
 * ── Hardware Fault Injection ────────────────────────────────────────────
 * Accepts an optional HardwareFaultInjector via constructor. When present,
 * software-commanded relay states pass through the fault injector before
 * affecting the motor. This models real-world hardware failures (stuck
 * relays, glitches, crosstalk, drift, delay) independently of the software
 * state machine — the software is blind to faults, just like real firmware.
 */

// ── Constants ─────────────────────────────────────────────────────────
const STATE = {
    STANDBY:       'STANDBY',
    ACCELERATING:  'ACCELERATING',
    RUNNING_CW:    'RUNNING_CW',
    RUNNING_CCW:   'RUNNING_CCW',
    DECELERATING:  'DECELERATING',
    WAITING:       'WAITING',
    PROGRAM_SELECTION: 'PROGRAM_SELECTION'
};

const DIR = { CW: 'CW', CCW: 'CCW' };
const INTENT = { NONE: 'NONE', AUTO_RESTART: 'AUTO_RESTART' };

// ── Relay-bit → dataset lookup (mirrors speed_dataset.cpp:56-61) ──────

function datasetFromRelayBits(m1, m2) {
    if (!m1 && !m2) { return 'DATASET_0'; }
    if ( m1 && !m2) { return 'DATASET_2'; }
    if (!m1 &&  m2) { return 'DATASET_4'; }
    return 'DATASET_6';
}

// ── Constructor ───────────────────────────────────────────────────────

/**
 * @param {object} cfg - HoneyConfig object (from honey_config.js)
 * @param {object} [faultInjector] - optional HardwareFaultInjector instance
 */
function HoneyStateMachine(cfg, faultInjector) {
    this._cfg = cfg;
    this._faultInjector = faultInjector || null;
    this._state = null;
    this._startRelayOn = false;
    this._dirRelayCCW = false;

    // Two-layer dataset tracking for hardware fault injection.
    // _commandedDataset = what software intends (used for state transitions).
    // _actualDataset    = what relays actually output (used for RPM computation).
    // Without a fault injector, these are always identical.
    this._commandedDataset = cfg.presets.standby;
    this._actualDataset    = cfg.presets.standby;

    // Tick counter for fault injector timing (set via setCurrentTick).
    this._currentTick = 0;

    // Per-tick fault activity (populated by _applyDatasetCommand).
    this._faultsActive = [];

    this._lastTickMs = 0;
    this.reset();
}

// ── Public API ────────────────────────────────────────────────────────

HoneyStateMachine.prototype.reset = function() {
    this._state = {
        id:                STATE.STANDBY,
        targetDirection:   DIR.CW,
        runningDirection:  DIR.CW,
        selectedRunDataset: this._cfg.presets.preset1,
        decelFromDataset:   this._cfg.presets.preset1,
        restartIntent:      INTENT.NONE,
        stateTimerStartMs:  0,
        rampStartProgress:  0.0,
        // Schleuder-Programm (mirrors controller_state.h ProgramContext)
        programId:            null,
        programStepIndex:     0,
        programStepDispatched: false,
        programStepStartMs:   0,
        // R12: Rampe beim Profilwechsel im Lauf
        rampOverrideDurationMs: 0,
        rampIsSlowdown:         false
    };
    this._startRelayOn = false;
    this._dirRelayCCW = false;
    this._commandedDataset = this._cfg.presets.standby;
    this._actualDataset    = this._cfg.presets.standby;
    this._faultsActive = [];
    this._lastTickMs = 0;
};

/**
 * Set the simulation tick counter. Called by the BMP batch simulator before
 * each tick() so the fault injector can use tick-based timing windows.
 *
 * @param {number} tick — current simulation tick (0, 1, 2, …)
 */
HoneyStateMachine.prototype.setCurrentTick = function(tick) {
    this._currentTick = tick;
};

/**
 * Process inputs and advance the state machine.
 * Call this on button presses AND periodically (setInterval) to check
 * for timer-based transitions (ramp completions).
 *
 * @param {object} inputs - { dirLeftPressed, dirRightPressed, stopPressed,
 *                           preset1Pressed, preset2Pressed, startPressed }
 * @param {number} nowMs  - current wall-clock time (Date.now())
 */
HoneyStateMachine.prototype.tick = function(inputs, nowMs) {
    // Debounce only empty polling ticks (no user input).
    // User-initiated clicks must always be processed immediately.
    // Polling ticks are already rate-limited by setInterval (100 ms);
    // this additional guard prevents the polling tick from stepping on
    // a user click that arrived within the same ~40 ms window.
    var hasUserInput = inputs.dirLeftPressed || inputs.dirRightPressed ||
                       inputs.stopPressed || inputs.startPressed ||
                       inputs.preset1Pressed || inputs.preset2Pressed;
    if (!hasUserInput && (nowMs - this._lastTickMs < 40)) { return; }
    this._lastTickMs = nowMs;

    // ── Programm-Runner Overlay (mirrors controller_logic.cpp tickController) ──
    // Jede Taste beendet den Programm-Modus (R6/Q9); die Taste faellt danach
    // an den normalen Handler des aktuellen Zustands durch.
    if (this._state.programId !== null && this._state.id !== STATE.PROGRAM_SELECTION) {
        if (hasUserInput) {
            this._clearProgramContext();
        } else {
            this._runProgramSequencer(nowMs);
        }
    }

    // Check for timer-based state transitions BEFORE processing inputs.
    // This matches the C++ pattern where tickController is called in a
    // tight loop and timer expiry is checked at the top of each handler.

    switch (this._state.id) {
        case STATE.STANDBY:
            this._handleStandby(inputs, nowMs);
            break;
        case STATE.ACCELERATING:
            this._handleAccelerating(inputs, nowMs);
            break;
        case STATE.RUNNING_CW:
            this._handleRunning(inputs, nowMs, DIR.CW);
            break;
        case STATE.RUNNING_CCW:
            this._handleRunning(inputs, nowMs, DIR.CCW);
            break;
        case STATE.DECELERATING:
            this._handleDecelerating(inputs, nowMs);
            break;
        case STATE.WAITING:
            this._handleWaiting(inputs, nowMs);
            break;
        case STATE.PROGRAM_SELECTION:
            this._handleProgramSelection(inputs, nowMs);
            break;
    }
};

/**
 * Return a read-only snapshot of the current state.
 * Safe to call from requestAnimationFrame for smooth progress-bar updates.
 *
 * When a fault injector is active, `activeDataset` reflects the ACTUAL relay
 * state (post-fault), while `commandedDataset` shows what the software intended.
 * The `faultsActive` array lists any faults currently affecting the output.
 *
 * @param {number} nowMs - current wall-clock time
 * @returns {object} { id, targetDirection, runningDirection,
 *                     selectedRunDataset, activeDataset, commandedDataset,
 *                     progress, startRelayOn, dirRelayCCW, restartIntent,
 *                     faultsActive }
 */
HoneyStateMachine.prototype.getState = function(nowMs) {
    return {
        id:                 this._state.id,
        targetDirection:    this._state.targetDirection,
        runningDirection:   this._state.runningDirection,
        selectedRunDataset: this._state.selectedRunDataset,
        activeDataset:      this._actualDataset,       // what the motor actually sees
        commandedDataset:   this._commandedDataset,    // what software commanded
        progress:           this._computeProgress(nowMs),
        startRelayOn:       this._startRelayOn,
        dirRelayCCW:        this._dirRelayCCW,
        restartIntent:      this._state.restartIntent,
        programId:          this._state.programId,
        rampIsSlowdown:     this._state.rampIsSlowdown,
        faultsActive:       this._faultsActive.slice() // per-tick snapshot
    };
};

// ── Timing helpers ────────────────────────────────────────────────────

/** Scale a real millisecond value by simSpeed for demo/verify modes. */
HoneyStateMachine.prototype._s = function(realMs) {
    return realMs * this._cfg.simSpeed;
};

/**
 * scaleTimeByDelta — mirrors speed_dataset.cpp:63-88.
 * Scales a full-range ramp time proportionally by rpm delta.
 */
HoneyStateMachine.prototype._scaleTimeByDelta = function(fullTimeMs, fullRangeRpm, deltaRpm) {
    if (deltaRpm === 0) { return 0; }
    if (fullRangeRpm === 0) { return fullTimeMs; }
    var scaled = Math.floor((fullTimeMs * deltaRpm) / fullRangeRpm);
    return (scaled === 0) ? 1 : scaled;
};

/**
 * Mirrors speed_dataset.cpp:104-107.
 * computeAccelerationDurationFromStopMs
 */
HoneyStateMachine.prototype._accelFromStopMs = function(datasetKey) {
    var ds = this._cfg.datasets[datasetKey];
    return this._scaleTimeByDelta(ds.accelerationMs, this._cfg.rampReferenceMaxRpm, ds.targetRpm);
};

/**
 * Mirrors speed_dataset.cpp:123-126.
 * computeDecelerationDurationToStopMs
 */
HoneyStateMachine.prototype._decelToStopMs = function(datasetKey) {
    var ds = this._cfg.datasets[datasetKey];
    return this._scaleTimeByDelta(ds.decelerationMs, this._cfg.rampReferenceMaxRpm, ds.targetRpm);
};

// ── Ramp progress (mirrors controller_state.cpp:33-66) ─────────────────

HoneyStateMachine.prototype._computeProgress = function(nowMs) {
    var st = this._state;
    var elapsed = nowMs - st.stateTimerStartMs;
    var effDur, accelFromStop, decelToStop;

    switch (st.id) {
        case STATE.ACCELERATING:
            // R12: Profilwechsel-Rampe hat eine eigene Dauer (Override).
            if (st.rampOverrideDurationMs) {
                effDur = Math.max(100, st.rampOverrideDurationMs);
            } else {
                accelFromStop = this._s(this._accelFromStopMs(st.selectedRunDataset));
                effDur = Math.max(100, (1.0 - st.rampStartProgress) * accelFromStop);
            }
            return st.rampStartProgress + Math.min(1.0, elapsed / effDur) * (1.0 - st.rampStartProgress);

        case STATE.RUNNING_CW:
        case STATE.RUNNING_CCW:
            return 1.0;

        case STATE.DECELERATING:
            decelToStop = this._s(this._decelToStopMs(st.decelFromDataset));
            effDur = Math.max(100, st.rampStartProgress * decelToStop);
            return st.rampStartProgress * (1.0 - Math.min(1.0, elapsed / effDur));

        default:
            return 0.0;
    }
};

// ── Effective durations (mirrors controller_state.cpp:68-90) ───────────

HoneyStateMachine.prototype._effectiveAccelDurMs = function() {
    // R12: Profilwechsel-Rampe hat eine eigene Dauer (Override).
    if (this._state.rampOverrideDurationMs) {
        return this._state.rampOverrideDurationMs;
    }
    var accelFromStop = this._s(this._accelFromStopMs(this._state.selectedRunDataset));
    return Math.max(100, (1.0 - this._state.rampStartProgress) * accelFromStop);
};

HoneyStateMachine.prototype._effectiveDecelDurMs = function() {
    var decelToStop = this._s(this._decelToStopMs(this._state.decelFromDataset));
    return Math.max(100, this._state.rampStartProgress * decelToStop);
};

// ── State transition helpers (mirrors controller_state.cpp:92-131) ────

HoneyStateMachine.prototype._beginAcceleration = function(nowMs, fromProgress) {
    this._state.rampStartProgress = fromProgress;
    this._state.stateTimerStartMs = nowMs;
    this._state.restartIntent = INTENT.NONE;
    this._state.id = STATE.ACCELERATING;
};

HoneyStateMachine.prototype._completeAcceleration = function() {
    this._state.id = (this._state.targetDirection === DIR.CCW)
        ? STATE.RUNNING_CCW
        : STATE.RUNNING_CW;
    this._state.rampOverrideDurationMs = 0;
    this._state.rampIsSlowdown = false;
};

HoneyStateMachine.prototype._beginDeceleration = function(nowMs, fromProgress,
                                                           decelDataset, runningDir, intent) {
    this._state.rampStartProgress = fromProgress;
    this._state.decelFromDataset = decelDataset;
    this._state.runningDirection = runningDir;
    this._state.stateTimerStartMs = nowMs;
    this._state.restartIntent = intent;
    // Jede Bremsung beendet eine laufende Wechsel-Rampe (R12): ein spaeterer
    // Auto-Neustart/RE-START rechnet wieder mit der normalen Rampenformel.
    this._state.rampOverrideDurationMs = 0;
    this._state.rampIsSlowdown = false;
    this._state.id = STATE.DECELERATING;
};

/**
 * R12 — mirrors controller_state.cpp beginSpeedSwitchRamp.
 * Profilwechsel im Lauf: ANLAUFEN-Zustand mit computeSwitchDurationMs.
 */
HoneyStateMachine.prototype._beginSpeedSwitchRamp = function(nowMs, fromDataset, toDataset) {
    var from = this._cfg.datasets[fromDataset];
    var to = this._cfg.datasets[toDataset];
    var deltaRpm = (to.targetRpm > from.targetRpm)
        ? (to.targetRpm - from.targetRpm)
        : (from.targetRpm - to.targetRpm);
    var switchMs = (to.targetRpm > from.targetRpm)
        ? this._scaleTimeByDelta(to.accelerationMs, this._cfg.rampReferenceMaxRpm, deltaRpm)
        : this._scaleTimeByDelta(from.decelerationMs, this._cfg.rampReferenceMaxRpm, deltaRpm);
    this._state.rampOverrideDurationMs = this._s(switchMs);
    this._state.rampIsSlowdown = (to.targetRpm < from.targetRpm);
    this._beginAcceleration(nowMs, 0.0);
};

HoneyStateMachine.prototype._beginWaiting = function(nowMs) {
    this._state.stateTimerStartMs = nowMs;
    this._state.id = STATE.WAITING;
};

HoneyStateMachine.prototype._completeWaitingPeriod = function(nowMs) {
    var self = this;
    if (self._state.restartIntent === INTENT.AUTO_RESTART) {
        // Set direction relay → apply dataset → enable start relay → begin acceleration
        self._dirRelayCCW = (self._state.targetDirection === DIR.CCW);
        self._applyDatasetCommand(self._state.selectedRunDataset);
        // relaySettleMs delay is a hardware concern; skip in simulation
        self._startRelayOn = true;
        self._beginAcceleration(nowMs, 0.0);
        self._state.restartIntent = INTENT.NONE;
    } else {
        self._state.id = STATE.STANDBY;
        self._applyDatasetCommand(self._cfg.presets.standby);
    }
};

// ── Direction helpers ─────────────────────────────────────────────────

HoneyStateMachine.prototype._isCCW = function(dir) {
    return dir === DIR.CCW;
};

HoneyStateMachine.prototype._flipTargetDirection = function() {
    this._state.targetDirection = this._isCCW(this._state.targetDirection)
        ? DIR.CW : DIR.CCW;
};

// ── Hardware fault injection bridge ───────────────────────────────────

/**
 * Apply a dataset command through the fault injector (if present).
 *
 * Commands the relay bits for `datasetKey`, runs them through the fault
 * injector, and records both the commanded dataset and the actual (post-fault)
 * dataset. If no fault injector is active, _actualDataset === _commandedDataset.
 *
 * @param {string} datasetKey — e.g. 'DATASET_0', 'DATASET_4'
 */
HoneyStateMachine.prototype._applyDatasetCommand = function(datasetKey) {
    this._commandedDataset = datasetKey;
    this._faultsActive = [];

    if (!this._faultInjector) {
        this._actualDataset = datasetKey;
        return;
    }

    var ds = this._cfg.datasets[datasetKey];
    if (!ds) {
        this._actualDataset = datasetKey;
        return;
    }

    var result = this._faultInjector.apply(ds.m1, ds.m2, this._currentTick);
    this._actualDataset = datasetFromRelayBits(result.actualM1, result.actualM2);
    this._faultsActive = result.faultsActive;
};

// ── State handlers (mirrors controller_logic.cpp handle* functions) ───

/**
 * STANDBY handler — mirrors controller_logic.cpp:101-149
 */
HoneyStateMachine.prototype._handleStandby = function(inputs, nowMs) {
    var st = this._state;

    // R1: Kombination GELB x + START -> Programm-Auswahl (nur im STANDBY).
    // Muss VOR allen Einzeltasten-Aktionen laufen (Preset/Start unterdrueckt).
    if (inputs.startPressed && (inputs.preset1Pressed || inputs.preset2Pressed)) {
        this._beginProgramSelection(
            inputs.preset1Pressed ? 'PROG_1' : 'PROG_2');
        return;
    }

    // Preset selection
    if (inputs.preset1Pressed) {
        st.selectedRunDataset = this._cfg.presets.preset1;
        // In C++: applySpeedDataset only if startRelayOn.
        // In standby, start relay is off → actualDataset stays at standby.
    }
    else if (inputs.preset2Pressed) {
        st.selectedRunDataset = this._cfg.presets.preset2;
    }

    // Direction selection
    if (inputs.dirLeftPressed) {
        st.targetDirection = DIR.CCW;
        this._dirRelayCCW = true;
    }
    else if (inputs.dirRightPressed) {
        st.targetDirection = DIR.CW;
        this._dirRelayCCW = false;
    }

    // Start
    if (inputs.startPressed) {
        this._applyDatasetCommand(st.selectedRunDataset);
        this._startRelayOn = true;
        this._beginAcceleration(nowMs, 0.0);
    }
};

/**
 * ACCELERATING handler — mirrors controller_logic.cpp:151-218
 */
HoneyStateMachine.prototype._handleAccelerating = function(inputs, nowMs) {
    var st = this._state;
    var self = this;

    // Preset changes during acceleration
    if (inputs.preset1Pressed) {
        // Waehrend einer (Wechsel-)Rampe: Override verwerfen (R12).
        st.rampOverrideDurationMs = 0;
        st.rampIsSlowdown = false;
        st.selectedRunDataset = this._cfg.presets.preset1;
        this._applyDatasetCommand(st.selectedRunDataset);
    }
    else if (inputs.preset2Pressed) {
        st.rampOverrideDurationMs = 0;
        st.rampIsSlowdown = false;
        st.selectedRunDataset = this._cfg.presets.preset2;
        this._applyDatasetCommand(st.selectedRunDataset);
    }

    // Direction change: pressing the OPPOSITE direction triggers proportional brake + auto-restart
    var dirChange = (!this._isCCW(st.targetDirection) && inputs.dirLeftPressed) ||
                    (this._isCCW(st.targetDirection) && inputs.dirRightPressed);

    if (inputs.stopPressed || dirChange) {
        var currentProgress = this._computeProgress(nowMs);
        this._startRelayOn = false;
        if (dirChange) {
            var runningDirection = st.targetDirection;
            this._flipTargetDirection();
            this._beginDeceleration(nowMs, currentProgress, this._actualDataset,
                                    runningDirection, INTENT.AUTO_RESTART);
        } else {
            this._beginDeceleration(nowMs, currentProgress, this._actualDataset,
                                    st.targetDirection, INTENT.NONE);
        }
        return;
    }

    // Ramp completion check
    var effAccelDur = this._effectiveAccelDurMs();
    if (nowMs - st.stateTimerStartMs >= effAccelDur) {
        this._completeAcceleration();
    }
};

/**
 * RUNNING handler — mirrors controller_logic.cpp:220-289
 */
HoneyStateMachine.prototype._handleRunning = function(inputs, nowMs, runningDir) {
    var st = this._state;

    // Preset changes while running — R12: Wechsel-Rampe statt Sofort-Schaltung
    if (inputs.preset1Pressed) {
        var prev1 = this._actualDataset;
        st.selectedRunDataset = this._cfg.presets.preset1;
        this._applyDatasetCommand(st.selectedRunDataset);
        if (prev1 !== this._cfg.presets.preset1) {
            this._beginSpeedSwitchRamp(nowMs, prev1, this._cfg.presets.preset1);
        }
        return;
    }
    else if (inputs.preset2Pressed) {
        var prev2 = this._actualDataset;
        st.selectedRunDataset = this._cfg.presets.preset2;
        this._applyDatasetCommand(st.selectedRunDataset);
        if (prev2 !== this._cfg.presets.preset2) {
            this._beginSpeedSwitchRamp(nowMs, prev2, this._cfg.presets.preset2);
        }
        return;
    }

    // Stop
    if (inputs.stopPressed) {
        this._startRelayOn = false;
        this._beginDeceleration(nowMs, 1.0, this._actualDataset, runningDir, INTENT.NONE);
        return;
    }

    // Re-pressing START falls back to preset1 (slower) — mirrors C++ line 261-268
    if (inputs.startPressed) {
        st.selectedRunDataset = this._cfg.presets.preset1;
        this._applyDatasetCommand(st.selectedRunDataset);
        return;
    }

    // Direction change: opposite direction → brake + auto-restart in new direction
    var changeToCCW = !this._isCCW(runningDir) && inputs.dirLeftPressed;
    var changeToCW  =  this._isCCW(runningDir) && inputs.dirRightPressed;

    if (changeToCCW || changeToCW) {
        var newDir = changeToCCW ? DIR.CCW : DIR.CW;
        st.targetDirection = newDir;
        this._startRelayOn = false;
        this._beginDeceleration(nowMs, 1.0, this._actualDataset, runningDir, INTENT.AUTO_RESTART);
    }
};

/**
 * DECELERATING handler — mirrors controller_logic.cpp:291-326
 */
HoneyStateMachine.prototype._handleDecelerating = function(inputs, nowMs) {
    var st = this._state;

    // STOP during auto-restart → cancel the auto-restart
    if (inputs.stopPressed && st.restartIntent === INTENT.AUTO_RESTART) {
        st.restartIntent = INTENT.NONE;
    }

    // START during deceleration (without auto-restart) → reverse to acceleration
    if (st.restartIntent === INTENT.NONE && inputs.startPressed) {
        var currentProgress = this._computeProgress(nowMs);
        this._startRelayOn = true;
        this._beginAcceleration(nowMs, currentProgress);
        return;
    }

    // Deceleration ramp completion
    var effDecelDur = this._effectiveDecelDurMs();
    if (nowMs - st.stateTimerStartMs >= effDecelDur) {
        this._beginWaiting(nowMs);
    }
};

// ── Schleuder-Programme (mirrors program_config.h + controller_logic.cpp) ──

HoneyStateMachine.prototype._programById = function(id) {
    var programs = this._cfg.programs || [];
    for (var i = 0; i < programs.length; i++) {
        if (programs[i].id === id) { return programs[i]; }
    }
    return null;
};

HoneyStateMachine.prototype._beginProgramSelection = function(id) {
    this._state.programId = id;
    this._state.programStepIndex = 0;
    this._state.programStepDispatched = false;
    this._state.programStepStartMs = 0;
    this._state.id = STATE.PROGRAM_SELECTION;
};

HoneyStateMachine.prototype._clearProgramContext = function() {
    this._state.programId = null;
    this._state.programStepIndex = 0;
    this._state.programStepDispatched = false;
    this._state.programStepStartMs = 0;
};

/**
 * PROGRAM_SELECTION handler — mirrors controller_logic.cpp handleProgramSelection.
 * Wartet auf das Loslassen aller Tasten; dritte Taste bricht ab.
 */
HoneyStateMachine.prototype._handleProgramSelection = function(inputs, nowMs) {
    var self = this;

    // Solange eine Kombi-Taste gehalten wird: warten (Aktionen unterdruecken).
    if (inputs.preset1Pressed || inputs.preset2Pressed || inputs.startPressed) {
        return;
    }

    // Dritte Taste waehrend der Auswahl: abbrechen (normale Tasten-Aktion
    // greift im naechsten Tick).
    if (inputs.dirLeftPressed || inputs.dirRightPressed || inputs.stopPressed) {
        self._clearProgramContext();
        self._state.id = STATE.STANDBY;
        return;
    }

    // Alle Tasten losgelassen -> Startrichtung anwenden (D1) und Schritt 0.
    var program = self._programById(self._state.programId);
    if (!program) {
        self._clearProgramContext();
        self._state.id = STATE.STANDBY;
        return;
    }
    self._state.targetDirection = program.startDirection;
    self._dirRelayCCW = (program.startDirection === DIR.CCW);
    self._state.id = STATE.STANDBY;
};

HoneyStateMachine.prototype._dispatchProgramStep = function(program, nowMs) {
    var st = this._state;
    var step = program.steps[st.programStepIndex];

    switch (step.action) {
        case 'DIRECTION': {
            var wantCcw = (step.direction === DIR.CCW);
            if (st.id === STATE.STANDBY) {
                st.targetDirection = step.direction;
                this._dirRelayCCW = wantCcw;
            }
            else if ((st.id === STATE.RUNNING_CW && wantCcw) ||
                     (st.id === STATE.RUNNING_CCW && !wantCcw)) {
                // Richtungswechsel im Lauf: Bremsrampe -> Sicherheitspause ->
                // Auto-Neustart (R7).
                var runningDir = (st.id === STATE.RUNNING_CW) ? DIR.CW : DIR.CCW;
                st.targetDirection = step.direction;
                this._startRelayOn = false;
                this._beginDeceleration(nowMs, 1.0, this._actualDataset,
                                        runningDir, INTENT.AUTO_RESTART);
            }
            // Bereits in Zielrichtung: nichts zu tun.
            break;
        }
        case 'SPEED': {
            var prevDataset = this._actualDataset;
            st.selectedRunDataset = step.dataset;
            var running = (st.id === STATE.RUNNING_CW || st.id === STATE.RUNNING_CCW);
            if (running) {
                this._applyDatasetCommand(step.dataset);
                if (prevDataset !== step.dataset) {
                    this._beginSpeedSwitchRamp(nowMs, prevDataset, step.dataset);
                }
            }
            break;
        }
        case 'START': {
            this._applyDatasetCommand(st.selectedRunDataset);
            this._startRelayOn = true;
            this._beginAcceleration(nowMs, 0.0);
            break;
        }
        case 'STOP': {
            if (st.id !== STATE.STANDBY) {
                this._startRelayOn = false;
                var stopRunningDir = (st.id === STATE.RUNNING_CCW) ? DIR.CCW : DIR.CW;
                this._beginDeceleration(nowMs, 1.0, this._actualDataset,
                                        stopRunningDir, INTENT.NONE);
            }
            break;
        }
        case 'WAIT': {
            st.programStepStartMs = nowMs;
            break;
        }
    }
};

HoneyStateMachine.prototype._programStepDone = function(step, nowMs) {
    var st = this._state;

    switch (step.action) {
        case 'DIRECTION':
            if (st.id === STATE.STANDBY) { return true; }
            return (st.id === STATE.RUNNING_CW && step.direction === DIR.CW) ||
                   (st.id === STATE.RUNNING_CCW && step.direction === DIR.CCW);
        case 'SPEED':
            return st.id === STATE.STANDBY ||
                   st.id === STATE.RUNNING_CW ||
                   st.id === STATE.RUNNING_CCW;
        case 'START':
            return st.id === STATE.RUNNING_CW || st.id === STATE.RUNNING_CCW;
        case 'STOP':
            return st.id === STATE.STANDBY;
        case 'WAIT':
            return (nowMs - st.programStepStartMs) >= this._s(step.waitMs);
    }
    return true;
};

HoneyStateMachine.prototype._runProgramSequencer = function(nowMs) {
    var program = this._programById(this._state.programId);
    if (!program) {
        this._clearProgramContext();
        return;
    }

    // Pro Tick hoechstens alle Schritte einmal (sofort erledigte Schritte
    // laufen ohne Zustandswechsel in Serie durch).
    for (var i = 0; i < program.steps.length; i++) {
        if (!this._state.programStepDispatched) {
            this._state.programStepDispatched = true;
            this._dispatchProgramStep(program, nowMs);
        }

        var step = program.steps[this._state.programStepIndex];
        if (!this._programStepDone(step, nowMs)) {
            return;  // Schritt laeuft — normale Zustandsmaschine uebernimmt.
        }

        this._state.programStepIndex++;
        this._state.programStepDispatched = false;
        this._state.programStepStartMs = 0;

        if (this._state.programStepIndex >= program.steps.length) {
            this._clearProgramContext();
            return;
        }
    }
};

/**
 * WAITING handler — mirrors controller_logic.cpp:328-343
 */
HoneyStateMachine.prototype._handleWaiting = function(inputs, nowMs) {
    var st = this._state;

    // STOP during waiting with auto-restart → cancel
    if (inputs.stopPressed && st.restartIntent === INTENT.AUTO_RESTART) {
        st.restartIntent = INTENT.NONE;
    }

    // Safety pause completion
    if (nowMs - st.stateTimerStartMs >= this._s(this._cfg.safetyPauseMs)) {
        this._completeWaitingPeriod(nowMs);
    }
};

export default HoneyStateMachine;
