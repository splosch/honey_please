/**
 * honey_config.js — JS mirror of C++ configuration
 * =================================================
 * Mirrors basic-control/config.h + basic-control/speed_dataset.cpp.
 * Every value cites its C++ origin. Change C++ first, then mirror here.
 *
 * The C++ config.h + speed_dataset.cpp are the MASTER source of truth.
 * This file is a documented copy for the interactive HTML demo/verifier.
 *
 * Usage: load before honey_state_machine.js in the HTML.
 *        HoneyStateMachine reads timing values from this object.
 */

var HoneyConfig = (function() {
    'use strict';

    // ── Speed dataset profiles (speed_dataset.cpp:18-23) ──────────────────
    // All Ac/dc values are relative to kRampReferenceMaxRpm = 3000 (speed_dataset.h:26).
    // Real ramp time for a given dataset = (Ac|dc)Ms × targetRpm / 3000.
    var DATASETS = {
        DATASET_0: { targetRpm: 1250, accelerationMs: 15000, decelerationMs: 15000, m1: false, m2: false },
        DATASET_2: { targetRpm:  750, accelerationMs: 15000, decelerationMs: 15000, m1: true,  m2: false },
        DATASET_4: { targetRpm: 2500, accelerationMs: 15000, decelerationMs: 15000, m1: false, m2: true  },
        DATASET_6: { targetRpm:    0, accelerationMs: 15000, decelerationMs: 15000, m1: true,  m2: true  }
    };

    // ── Public config object ──────────────────────────────────────────────
    var CFG = {
        // -- Pin mapping (config.h:88-97) ----------------------------------
        // Mirrors BASIC_CONTROL_CONFIG struct in config.h.
        // Referenz-Verdrahtungsplan shown in the HTML SVG + wiring table.
        pins: {
            relayStart:   2,   // D2 → Relay 1 IN → Driver X1 (START/STOP)
            relayDir:     3,   // D3 → Relay 2 IN → Driver X3 (CW/CCW)
            relayUnused3: 4,   // D4 → M1 speed-select relay bit
            relayUnused4: 5,   // D5 → M2 speed-select relay bit
            keyLinks:     6,   // D6 ← Membrane LEFT (CCW), INPUT_PULLUP, active LOW
            keyRechts:    7,   // D7 ← Membrane RIGHT (CW)
            keyStop:      8,   // D8 ← Membrane RED (Stop)
            keyYel1:      9,   // D9 ← Membrane YELLOW 1 (Preset 1)
            keyYel2:     10,   // D10 ← Membrane YELLOW 2 (Preset 2)
            keyStart:    11    // D11 ← Membrane GREEN (Start)
        },

        // -- Timing constants (config.h:83-85,99-101,103-105) ---------------
        // All values in real milliseconds (same unit as C++).
        //
        // kAccelerationSeconds / kDecelerationSeconds (config.h:83-84) are
        // legacy compat-only defaults. Actual ramp times come from dataset
        // profiles above and are scaled by targetRpm / 3000.
        safetyPauseMs:       150,   // config.h:85  kSafetyPauseMilliseconds
        debounceDirectionMs: 150,   // config.h:103 debounceDirectionMs
        debounceActionMs:    200,   // config.h:104 debounceActionMs
        relaySettleMs:       100,   // config.h:105 relaySettleMs

        // -- Relay polarity (config.h:112-113) -----------------------------
        relayActiveHigh:      true,  // HIGH = relay energized
        dirRelayHighMeansCCW: true,  // HIGH on direction relay = CCW

        // -- Reference RPM (speed_dataset.h:26) ----------------------------
        rampReferenceMaxRpm: 3000,

        // -- Preset dataset assignments (config.h:109-110) -----------------
        presets: {
            preset1: 'DATASET_0',   // Gelb-1 → dAtA 0 (1250 rpm, M1=0,M2=0)
            preset2: 'DATASET_4',   // Gelb-2 → dAtA 4 (2500 rpm, M1=0,M2=1)
            standby: 'DATASET_0'    // controller_logic.cpp:3  kStandbyDataset
        },

        // -- Dataset lookup ------------------------------------------------
        datasets: DATASETS,

        /**
         * Simulation speed multiplier.
         *
         *  1.0 = real-time: 15 s ramps match hardware exactly → verification mode
         *  0.2 = fast demo: 15 s → 3 s → snappy interactive exploration
         *
         * Applied to ALL timing values (ramp times, safety pause, debounce,
         * relay settle). Set to 1.0 when using the HTML to verify state
         * transition timing against the real Arduino.
         */
        simSpeed: 0.2
    };

    return CFG;
})();
