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
 *
 * The state machine uses the same 6 states as the C++ controller:
 *   STANDBY → ACCELERATING → RUNNING_CW/CCW → DECELERATING → WAITING → …
 *
 * Inputs shape (mirrors InputSnapshot in hardware_io.h):
 *   { dirLeftPressed, dirRightPressed, stopPressed, preset1Pressed, preset2Pressed, startPressed }
 *
 * All timing values are scaled by cfg.simSpeed so the same config can drive
 * real-time verification (simSpeed=1.0) and fast interactive demos (simSpeed=0.2).
 */

// ── Constants ─────────────────────────────────────────────────────────
const STATE = {
    STANDBY:       'STANDBY',
    ACCELERATING:  'ACCELERATING',
    RUNNING_CW:    'RUNNING_CW',
    RUNNING_CCW:   'RUNNING_CCW',
    DECELERATING:  'DECELERATING',
    WAITING:       'WAITING'
};

const DIR = { CW: 'CW', CCW: 'CCW' };
const INTENT = { NONE: 'NONE', AUTO_RESTART: 'AUTO_RESTART' };

// ── Constructor ───────────────────────────────────────────────────────

/**
 * @param {object} cfg - HoneyConfig object (from honey_config.js)
 */
function HoneyStateMachine(cfg) {
    this._cfg = cfg;
    this._state = null;
    this._startRelayOn = false;
    this._dirRelayCCW = false;
    this._activeDataset = cfg.presets.standby;   // what relay M1/M2 pins show
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
        rampStartProgress:  0.0
    };
    this._startRelayOn = false;
    this._dirRelayCCW = false;
    this._activeDataset = this._cfg.presets.standby;
    this._lastTickMs = 0;
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
    // Basic debounce: ignore ticks within 40ms of each other.
    // This prevents DOM event cascading from causing double-transitions
    // while being short enough to not affect ramp timer accuracy.
    if (nowMs - this._lastTickMs < 40) { return; }
    this._lastTickMs = nowMs;

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
    }
};

/**
 * Return a read-only snapshot of the current state.
 * Safe to call from requestAnimationFrame for smooth progress-bar updates.
 *
 * @param {number} nowMs - current wall-clock time
 * @returns {object} { id, targetDirection, runningDirection,
 *                     selectedRunDataset, activeDataset, progress,
 *                     startRelayOn, dirRelayCCW, restartIntent }
 */
HoneyStateMachine.prototype.getState = function(nowMs) {
    return {
        id:                 this._state.id,
        targetDirection:    this._state.targetDirection,
        runningDirection:   this._state.runningDirection,
        selectedRunDataset: this._state.selectedRunDataset,
        activeDataset:      this._activeDataset,
        progress:           this._computeProgress(nowMs),
        startRelayOn:       this._startRelayOn,
        dirRelayCCW:        this._dirRelayCCW,
        restartIntent:      this._state.restartIntent
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
            accelFromStop = this._s(this._accelFromStopMs(st.selectedRunDataset));
            effDur = Math.max(100, (1.0 - st.rampStartProgress) * accelFromStop);
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
};

HoneyStateMachine.prototype._beginDeceleration = function(nowMs, fromProgress,
                                                           decelDataset, runningDir, intent) {
    this._state.rampStartProgress = fromProgress;
    this._state.decelFromDataset = decelDataset;
    this._state.runningDirection = runningDir;
    this._state.stateTimerStartMs = nowMs;
    this._state.restartIntent = intent;
    this._state.id = STATE.DECELERATING;
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
        self._activeDataset = self._state.selectedRunDataset;
        // relaySettleMs delay is a hardware concern; skip in simulation
        self._startRelayOn = true;
        self._beginAcceleration(nowMs, 0.0);
        self._state.restartIntent = INTENT.NONE;
    } else {
        self._state.id = STATE.STANDBY;
        self._activeDataset = self._cfg.presets.standby;
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

// ── State handlers (mirrors controller_logic.cpp handle* functions) ───

/**
 * STANDBY handler — mirrors controller_logic.cpp:101-149
 */
HoneyStateMachine.prototype._handleStandby = function(inputs, nowMs) {
    var st = this._state;

    // Preset selection
    if (inputs.preset1Pressed) {
        st.selectedRunDataset = this._cfg.presets.preset1;
        // In C++: applySpeedDataset only if startRelayOn.
        // In standby, start relay is off → activeDataset stays at standby.
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
        this._activeDataset = st.selectedRunDataset;
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
        st.selectedRunDataset = this._cfg.presets.preset1;
        this._activeDataset = st.selectedRunDataset;
    }
    else if (inputs.preset2Pressed) {
        st.selectedRunDataset = this._cfg.presets.preset2;
        this._activeDataset = st.selectedRunDataset;
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
            this._beginDeceleration(nowMs, currentProgress, this._activeDataset,
                                    runningDirection, INTENT.AUTO_RESTART);
        } else {
            this._beginDeceleration(nowMs, currentProgress, this._activeDataset,
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
    var self = this;

    // Preset changes while running
    if (inputs.preset1Pressed) {
        st.selectedRunDataset = this._cfg.presets.preset1;
        this._activeDataset = st.selectedRunDataset;
        return;
    }
    else if (inputs.preset2Pressed) {
        st.selectedRunDataset = this._cfg.presets.preset2;
        this._activeDataset = st.selectedRunDataset;
        return;
    }

    // Stop
    if (inputs.stopPressed) {
        this._startRelayOn = false;
        this._beginDeceleration(nowMs, 1.0, this._activeDataset, runningDir, INTENT.NONE);
        return;
    }

    // Re-pressing START falls back to preset1 (slower) — mirrors C++ line 261-268
    if (inputs.startPressed) {
        st.selectedRunDataset = this._cfg.presets.preset1;
        this._activeDataset = st.selectedRunDataset;
        return;
    }

    // Direction change: opposite direction → brake + auto-restart in new direction
    var changeToCCW = !this._isCCW(runningDir) && inputs.dirLeftPressed;
    var changeToCW  =  this._isCCW(runningDir) && inputs.dirRightPressed;

    if (changeToCCW || changeToCW) {
        var newDir = changeToCCW ? DIR.CCW : DIR.CW;
        st.targetDirection = newDir;
        this._startRelayOn = false;
        this._beginDeceleration(nowMs, 1.0, this._activeDataset, runningDir, INTENT.AUTO_RESTART);
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
