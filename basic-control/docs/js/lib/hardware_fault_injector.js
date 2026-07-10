/**
 * hardware_fault_injector.js — Hardware fault injection for relay simulation
 * ==========================================================================
 * Models realistic hardware failure modes that can cause the actual relay
 * state to diverge from the software-commanded state. Used by
 * HoneyStateMachine (via constructor injection) and by useBmpSimulation.js
 * to generate hardware-fault BMP diagnostic scenarios.
 *
 * Design principles:
 *   - Pure transform: (commandedM1, commandedM2, currentTick) → (actualM1, actualM2)
 *   - Zero knowledge of state machine internals — only sees relay bits.
 *   - Stateless from the caller's perspective (all internal state is private).
 *   - Same fault model can later drive C++ hardware test procedures.
 *
 * Fault priority (higher = applied later = stronger override):
 *   DELAY < CROSSTALK < GLITCH < INVERTED < DRIFT < STUCK_AT
 *
 * @module hardware_fault_injector
 */

// ── Fault type enumeration ──────────────────────────────────────────────

/** @enum {string} */
export const FaultType = {
    /** Relay permanently frozen at a fixed value regardless of command. */
    STUCK_AT:   'STUCK_AT',

    /** Command value is flipped (ON→OFF, OFF→ON). */
    INVERTED:   'INVERTED',

    /**
     * Transient wrong state for N ticks after this relay's own transition.
     * On the transition tick, snaps to `value`. Remains at `value` for
     * `durationTicks`, then returns to following the command.
     */
    GLITCH:     'GLITCH',

    /**
     * When the OTHER relay transitions, this relay is disturbed and flips
     * its value for `durationTicks`. Models electromagnetic coupling or
     * shared return-path bounce between adjacent relay channels.
     */
    CROSSTALK:  'CROSSTALK',

    /**
     * Each tick, there is a `probabilityPerTick` chance of spontaneous
     * flip. Models intermittent contact, thermal drift, or aging relays.
     */
    DRIFT:      'DRIFT',

    /**
     * State changes on this relay are delayed by `durationTicks`.
     * While a delayed transition is pending, the relay holds its previous
     * actual value.
     */
    DELAY:      'DELAY',
};

// ── Fault application priority (higher = applied later = wins) ──────────

const FAULT_PRIORITY = {
    DELAY:      1,
    CROSSTALK:  2,
    GLITCH:     3,
    INVERTED:   4,
    DRIFT:      5,
    STUCK_AT:   6,
};

// ── Constructor ─────────────────────────────────────────────────────────

/**
 * @param {Array<object>} [faultSpecs=[]] — pre-registered fault specifications.
 *   Each spec: {
 *     id: string (optional, auto-generated),
 *     relay: 'M1' | 'M2',
 *     type: FaultType key,
 *     value?: boolean,              // for STUCK_AT, GLITCH
 *     durationTicks?: number,       // for GLITCH, CROSSTALK, DELAY (default 1)
 *     sourceRelay?: 'M1' | 'M2',    // for CROSSTALK: which relay triggers the disturbance
 *     probabilityPerTick?: number,  // for DRIFT (0..1, default 0)
 *     activateAtTick?: number,      // time-window start (inclusive)
 *     deactivateAtTick?: number,    // time-window end (exclusive)
 *   }
 */
function HardwareFaultInjector(faultSpecs) {
    this._faults = (faultSpecs || []).map(function(s) { return normalizeSpec(s); });

    // Per-relay state for stateful fault types (GLITCH, DELAY, CROSSTALK).
    // These track ongoing transient effects that span multiple ticks.
    this._lastCommanded   = { M1: false, M2: false };
    this._lastActual      = { M1: false, M2: false };

    // Tick when the relay last experienced a commanded transition.
    // Initialized far in the past so early transitions aren't suppressed.
    this._transitionTick  = { M1: -99999, M2: -99999 };

    // Pending delayed transitions: { targetValue, startTick, durationTicks } | null
    this._pendingDelay    = { M1: null, M2: null };

    // Active glitch state: { value, startTick, durationTicks } | null
    this._activeGlitch    = { M1: null, M2: null };

    // Active crosstalk disturbance: { startTick, durationTicks } | null
    this._activeCrosstalk = { M1: null, M2: null };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Apply all active faults to the commanded relay states and return the
 * actual (potentially faulted) relay outputs.
 *
 * @param {boolean} commandedM1 — software-commanded M1 value
 * @param {boolean} commandedM2 — software-commanded M2 value
 * @param {number}  currentTick — simulation tick counter (for timing windows & transient expiry)
 * @returns {{ actualM1: boolean, actualM2: boolean, faultsActive: Array }}
 */
HardwareFaultInjector.prototype.apply = function(commandedM1, commandedM2, currentTick) {
    var self = this;

    // Detect commanded transitions (before faults are applied).
    var m1CmdTransitioned = (commandedM1 !== self._lastCommanded.M1);
    var m2CmdTransitioned = (commandedM2 !== self._lastCommanded.M2);

    if (m1CmdTransitioned) { self._transitionTick.M1 = currentTick; }
    if (m2CmdTransitioned) { self._transitionTick.M2 = currentTick; }

    self._lastCommanded.M1 = commandedM1;
    self._lastCommanded.M2 = commandedM2;

    // Expire transient fault effects that have outlived their duration.
    expireTransients(self, currentTick);

    // Resolve each relay through the fault pipeline.
    var faultsActive = [];
    var actualM1 = resolveRelay(self, 'M1', commandedM1, currentTick, m1CmdTransitioned, m2CmdTransitioned, faultsActive);
    var actualM2 = resolveRelay(self, 'M2', commandedM2, currentTick, m2CmdTransitioned, m1CmdTransitioned, faultsActive);

    self._lastActual.M1 = actualM1;
    self._lastActual.M2 = actualM2;

    return { actualM1: actualM1, actualM2: actualM2, faultsActive: faultsActive };
};

/**
 * Dynamically inject a fault during simulation (triggered by scenario event).
 *
 * @param {object} spec — fault specification (same shape as constructor array entries)
 * @returns {string} fault id
 */
HardwareFaultInjector.prototype.injectFault = function(spec) {
    var fault = normalizeSpec(spec);
    this._faults.push(fault);
    return fault.id;
};

/**
 * Remove a fault by id. Safe to call with a non-existent id.
 *
 * @param {string} id
 */
HardwareFaultInjector.prototype.clearFault = function(id) {
    var idx = -1;
    for (var i = 0; i < this._faults.length; i++) {
        if (this._faults[i].id === id) {
            idx = i;
            break;
        }
    }
    if (idx >= 0) {
        this._faults.splice(idx, 1);
    }
    // Also clear any transient state associated with this fault.
    clearTransientForFault(this, id);
};

/**
 * Remove all faults and reset transient state.
 */
HardwareFaultInjector.prototype.clearAllFaults = function() {
    this._faults.length = 0;
    this._pendingDelay.M1 = null;
    this._pendingDelay.M2 = null;
    this._activeGlitch.M1 = null;
    this._activeGlitch.M2 = null;
    this._activeCrosstalk.M1 = null;
    this._activeCrosstalk.M2 = null;
};

/**
 * Return the list of currently registered fault specs (including inactive ones).
 * @returns {Array<object>}
 */
HardwareFaultInjector.prototype.getFaultSpecs = function() {
    return this._faults.slice();
};

// ── Fault spec normalization ────────────────────────────────────────────

var _faultIdCounter = 0;

function normalizeSpec(spec) {
    _faultIdCounter++;
    return {
        id:                spec.id || ('hwfault_' + _faultIdCounter),
        relay:             spec.relay,               // 'M1' | 'M2'
        type:              spec.type,                // FaultType key
        value:             'value' in spec ? spec.value : false,
        durationTicks:     spec.durationTicks || 1,
        sourceRelay:       spec.sourceRelay || null,  // for CROSSTALK
        probabilityPerTick: spec.probabilityPerTick || 0,
        activateAtTick:    spec.activateAtTick !== undefined ? spec.activateAtTick : -Infinity,
        deactivateAtTick:  spec.deactivateAtTick !== undefined ? spec.deactivateAtTick : Infinity,
    };
}

// ── Time-window gating ──────────────────────────────────────────────────

function isFaultActive(fault, currentTick) {
    if (currentTick < fault.activateAtTick) { return false; }
    if (currentTick >= fault.deactivateAtTick) { return false; }
    return true;
}

// ── Transient expiry ────────────────────────────────────────────────────

function expireTransients(self, currentTick) {
    ['M1', 'M2'].forEach(function(relay) {
        // Expire pending delay
        var pd = self._pendingDelay[relay];
        if (pd && (currentTick - pd.startTick) >= pd.durationTicks) {
            self._pendingDelay[relay] = null;
        }

        // Expire active glitch
        var gl = self._activeGlitch[relay];
        if (gl && (currentTick - gl.startTick) >= gl.durationTicks) {
            self._activeGlitch[relay] = null;
        }

        // Expire active crosstalk
        var ct = self._activeCrosstalk[relay];
        if (ct && (currentTick - ct.startTick) >= ct.durationTicks) {
            self._activeCrosstalk[relay] = null;
        }
    });
}

function clearTransientForFault(self, faultId) {
    // Clear any transient state associated with this fault id.
    // We store the fault id in the transient record so we can match.
    ['M1', 'M2'].forEach(function(relay) {
        if (self._pendingDelay[relay] && self._pendingDelay[relay].faultId === faultId) {
            self._pendingDelay[relay] = null;
        }
        if (self._activeGlitch[relay] && self._activeGlitch[relay].faultId === faultId) {
            self._activeGlitch[relay] = null;
        }
        if (self._activeCrosstalk[relay] && self._activeCrosstalk[relay].faultId === faultId) {
            self._activeCrosstalk[relay] = null;
        }
    });
}

// ── Per-relay fault resolution ──────────────────────────────────────────

/**
 * Run one relay's commanded value through the fault pipeline.
 *
 * Order:
 *   1. Start with commanded value
 *   2. DELAY — if a delayed transition is pending, hold the old actual value
 *      and record a new pending delay when a transition arrives.
 *   3. CROSSTALK — if the other relay transitioned and a crosstalk fault is
 *      active, flip this relay's value for durationTicks.
 *   4. GLITCH — if this relay transitioned and a glitch fault is active,
 *      override with the glitch value for durationTicks.
 *   5. INVERTED — flip the current value.
 *   6. DRIFT — probabilistic spontaneous flip.
 *   7. STUCK_AT — override with fixed value (strongest, wins over everything).
 */
function resolveRelay(self, relay, commanded, currentTick, selfTransitioned, otherTransitioned, faultsActive) {
    // Collect active faults for this relay, time-window gated, sorted by priority.
    var activeFaults = [];
    for (var i = 0; i < self._faults.length; i++) {
        var f = self._faults[i];
        if (f.relay === relay && isFaultActive(f, currentTick)) {
            activeFaults.push(f);
        }
    }
    activeFaults.sort(function(a, b) {
        return (FAULT_PRIORITY[a.type] || 0) - (FAULT_PRIORITY[b.type] || 0);
    });

    // If no faults at all, early-exit with commanded value.
    if (activeFaults.length === 0 &&
        !self._pendingDelay[relay] &&
        !self._activeGlitch[relay] &&
        !self._activeCrosstalk[relay]) {
        return commanded;
    }

    // Separate faults by type for ordered application.
    var delayFaults    = [];
    var crosstalkFaults = [];
    var glitchFaults   = [];
    var invertFaults   = [];
    var driftFaults    = [];
    var stuckFaults    = [];

    for (var j = 0; j < activeFaults.length; j++) {
        var af = activeFaults[j];
        switch (af.type) {
            case FaultType.DELAY:     delayFaults.push(af);    break;
            case FaultType.CROSSTALK: crosstalkFaults.push(af); break;
            case FaultType.GLITCH:    glitchFaults.push(af);   break;
            case FaultType.INVERTED:  invertFaults.push(af);   break;
            case FaultType.DRIFT:     driftFaults.push(af);    break;
            case FaultType.STUCK_AT:  stuckFaults.push(af);    break;
        }
    }

    var value = commanded;

    // ── Step 1: DELAY ──────────────────────────────────────────────────
    // If a commanded transition just occurred and a DELAY fault is active,
    // capture it as a pending delay. While a delay is pending, hold the
    // old actual value.
    if (selfTransitioned && delayFaults.length > 0) {
        // Use the longest delay among active delay faults
        var maxDelayTicks = 0;
        var maxDelayFaultId = null;
        for (var d = 0; d < delayFaults.length; d++) {
            if (delayFaults[d].durationTicks > maxDelayTicks) {
                maxDelayTicks = delayFaults[d].durationTicks;
                maxDelayFaultId = delayFaults[d].id;
            }
        }
        self._pendingDelay[relay] = {
            targetValue: commanded,
            startTick: currentTick,
            durationTicks: maxDelayTicks,
            faultId: maxDelayFaultId,
        };
    }

    if (self._pendingDelay[relay]) {
        value = self._lastActual[relay];
        faultsActive.push({
            id: self._pendingDelay[relay].faultId,
            relay: relay,
            type: FaultType.DELAY,
            effect: 'held at ' + value + ' (pending transition to ' + commanded + ')',
        });
    }

    // ── Step 2: CROSSTALK ──────────────────────────────────────────────
    // If the OTHER relay transitioned and a crosstalk fault is active,
    // start a disturbance that flips this relay for durationTicks.
    if (otherTransitioned && crosstalkFaults.length > 0) {
        var maxCTDuration = 0;
        var maxCTFaultId = null;
        for (var ct = 0; ct < crosstalkFaults.length; ct++) {
            if (crosstalkFaults[ct].durationTicks > maxCTDuration) {
                maxCTDuration = crosstalkFaults[ct].durationTicks;
                maxCTFaultId = crosstalkFaults[ct].id;
            }
        }
        self._activeCrosstalk[relay] = {
            startTick: currentTick,
            durationTicks: maxCTDuration,
            faultId: maxCTFaultId,
        };
    }

    if (self._activeCrosstalk[relay]) {
        value = !value;
        faultsActive.push({
            id: self._activeCrosstalk[relay].faultId,
            relay: relay,
            type: FaultType.CROSSTALK,
            effect: 'flipped to ' + value + ' by crosstalk from other relay',
        });
    }

    // ── Step 3: GLITCH ─────────────────────────────────────────────────
    // If this relay transitioned and a glitch fault is active, override
    // with the glitch value for durationTicks.
    if (selfTransitioned && glitchFaults.length > 0) {
        // Use the most "aggressive" glitch (longest duration)
        var maxGlDuration = 0;
        var maxGlFaultId = null;
        var maxGlValue = false;
        for (var gl = 0; gl < glitchFaults.length; gl++) {
            if (glitchFaults[gl].durationTicks > maxGlDuration) {
                maxGlDuration = glitchFaults[gl].durationTicks;
                maxGlFaultId = glitchFaults[gl].id;
                maxGlValue = glitchFaults[gl].value;
            }
        }
        self._activeGlitch[relay] = {
            value: maxGlValue,
            startTick: currentTick,
            durationTicks: maxGlDuration,
            faultId: maxGlFaultId,
        };
    }

    if (self._activeGlitch[relay]) {
        value = self._activeGlitch[relay].value;
        faultsActive.push({
            id: self._activeGlitch[relay].faultId,
            relay: relay,
            type: FaultType.GLITCH,
            effect: 'glitched to ' + value,
        });
    }

    // ── Step 4: INVERTED ───────────────────────────────────────────────
    if (invertFaults.length > 0) {
        value = !value;
        faultsActive.push({
            id: invertFaults[0].id,
            relay: relay,
            type: FaultType.INVERTED,
            effect: 'inverted to ' + value,
        });
    }

    // ── Step 5: DRIFT ──────────────────────────────────────────────────
    if (driftFaults.length > 0) {
        // Combine probabilities: P(flip) = 1 - ∏(1 - p_i)
        var combinedProb = 0;
        for (var dr = 0; dr < driftFaults.length; dr++) {
            combinedProb = combinedProb + driftFaults[dr].probabilityPerTick * (1 - combinedProb);
        }
        if (Math.random() < combinedProb) {
            value = !value;
            faultsActive.push({
                id: 'drift_' + relay,
                relay: relay,
                type: FaultType.DRIFT,
                effect: 'drifted to ' + value,
            });
        }
    }

    // ── Step 6: STUCK_AT ───────────────────────────────────────────────
    // Strongest fault — overrides everything above.
    if (stuckFaults.length > 0) {
        // If multiple STUCK_AT faults, the last one (highest priority) wins.
        // They should all agree on value, but if not, last-registered wins.
        var stuck = stuckFaults[stuckFaults.length - 1];
        value = stuck.value;
        faultsActive.push({
            id: stuck.id,
            relay: relay,
            type: FaultType.STUCK_AT,
            effect: 'stuck at ' + value,
        });
    }

    return value;
}

export default HardwareFaultInjector;
