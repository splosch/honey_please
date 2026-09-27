/**
 * simulationScenarios.js — BMP visualization scenario definitions
 * ===============================================================
 * Each scenario is a timed sequence of events that drive the state machine
 * through a specific behavioral path. Used by useBmpSimulation.js to run
 * headless batch simulations for BMP export.
 *
 * Also contains the BMP color palette — RGB values mapped to state machine
 * states. These are purpose-specific for pixel-level BMP rendering and are
 * distinct from the UI color scheme used in StatusDisplay.js / Legend.
 *
 * All RPM/timing values are derived from HoneyConfig — no hardcoded physics.
 */

// ── BMP pixel color palette (per state machine state) ──────────────────
// Distinct, visually separable colors for quick diagnosis of state
// transitions and edge cases in the BMP output.
export const STATE_COLORS = {
    STANDBY:      { r: 30,  g: 30,  b: 30  },  // Dark gray (idle / zero line)
    ACCELERATING: { r: 0,   g: 255, b: 128 },  // Green (ramp-up)
    RUNNING_CW:   { r: 0,   g: 128, b: 255 },  // Blue (constant CW)
    RUNNING_CCW:  { r: 0,   g: 200, b: 255 },  // Light blue (constant CCW — distinguishable)
    DECELERATING: { r: 255, g: 128, b: 0   },  // Orange (ramp-down / braking)
    WAITING:      { r: 128, g: 0,   b: 128 },  // Purple (safety hold before direction reversal)
    PROGRAM_SELECTION: { r: 255, g: 255, b: 0 }, // Yellow (Schleuder-Programm-Auswahl, Combo gehalten)
};

/** Color for event trigger markers (bottom row of BMP). */
export const EVENT_COLOR = { r: 255, g: 0, b: 0 };

/**
 * Color for hardware fault mismatch markers (mismatch row of BMP).
 * Marks ticks where the actual relay state diverged from the
 * software-commanded state due to injected hardware faults.
 */
export const HW_FAULT_COLOR = { r: 255, g: 60, b: 60 };

/**
 * Color for motor speed overlay line (pink).
 * Drawn with 70% transparency (30% opacity blend) over the state-colored
 * fill area to trace the physically accurate VFD motor RPM, which may
 * diverge from the state machine's abstract progress during preset changes
 * and other transitions where the VFD's internal ramp is not instant.
 */
export const OVERLAY_COLOR = { r: 255, g: 105, b: 180 };

/** Background / empty cell color. */
export const BG_COLOR = { r: 15, g: 15, b: 15 };

// ── Scenario definitions ───────────────────────────────────────────────
// Each scenario defines:
//   id, name, description  — metadata
//   totalTicks              — BMP width in pixels (one column per simulation step)
//   tickDurationMs          — virtual-clock advance per tick (default: 50 ms)
//   events[]                — { atTick, type } triggers
//
// Event types mirror the physical membrane keypad:
//   dirRight, dirLeft  — direction selection (CW / CCW)
//   start, stop        — motor start / stop
//   preset1, preset2   — speed preset selection (DATASET_0 / DATASET_4)
//
// Optional event field `holdTicks` (default 1) keeps the button pressed for
// N consecutive ticks. Needed for the program combo (SPEED held + START):
// level-based detection in honey_state_machine.js (R1) only fires while both
// buttons are LOW across the same tick(s).
//
// Tick numbers encode WHEN events fire, not absolute time. Multiply by
// tickDurationMs to get virtual time in milliseconds.

// ── Hardware fault scenarios ──────────────────────────────────────────
// Re-exported from hardwareFaultScenarios.js. Spread into SCENARIOS below.

import { HW_FAULT_SCENARIOS } from './hardwareFaultScenarios.js';

/**
 * timingPresets.js — Timing preset definitions for BMP simulation
 * ================================================================
 * Users can override a scenario's totalTicks / tickDurationMs by selecting
 * a timing preset in the UI. The first entry ("scenario_default") always
 * uses the values baked into each scenario definition.
 *
 * Imported by simulationScenarios.js and re-exported for consumers.
 */

export const TIMING_PRESETS = [
    {
        id: 'scenario_default',
        name: 'Scenario Default',
        description: 'Use each scenario\'s own totalTicks and tickDurationMs'
    },
    {
        id: 'high_res_2000',
        name: 'High Resolution — 2000 Ticks @ 100 ms',
        description: '2000 ticks at 100 ms each (200 s virtual time, finer granularity)',
        totalTicks: 2000,
        tickDurationMs: 100
    }
];

export const SCENARIOS = [
    // ── Bestehende Szenarien (1–7) ──────────────────────────────────────

    {
        id: 'normal_cw',
        name: '1. Normalfahrt CW',
        description: 'Standard-Ablauf: Start in Uhrzeigersinn, Konstantfahrt, regulärer Stop.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 100, type: 'stop' }
        ]
    },
    {
        id: 'direction_reversal',
        name: '2. Richtungswechsel bei Konstantfahrt',
        description: 'Fahrt im Uhrzeigersinn → Richtungswechsel-Trigger während der Fahrt → kontrolliertes Abbremsen → Hold-Sicherheitszeit → automatischer Gegenlauf (CCW).',
        totalTicks: 250,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'dirLeft' }
        ]
    },
    {
        id: 'early_abort',
        name: '3. Frühzeitiger Abbruch bei Beschleunigung',
        description: 'Start → Stop-Event mitten in der Beschleunigungsrampe. Testet, ob die Bremszeit proportional verkürzt wird und sanft bei Null landet.',
        totalTicks: 120,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 25, type: 'stop' }
        ]
    },
    {
        id: 'dir_change_during_accel',
        name: '4. Richtungswechsel während Beschleunigung',
        description: 'Motor beschleunigt noch → Richtungswechsel-Trigger erfolgt vor Erreichen der Nenndrehzahl. Testet asymmetrische Bremsrampen aus Teil-Geschwindigkeiten.',
        totalTicks: 240,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 25, type: 'dirLeft' }
        ]
    },
    {
        id: 'interrupt_deceleration',
        name: '5. DIAGNOSE: Start-Trigger in Bremsphase',
        description: 'KRITISCH: Während der Motor nach einem Stop-Event herunterbremst, erfolgt ein erneutes Start-Signal vor Erreichen des Stillstands. Fängt sich die Rampe stabil ab?',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'stop' },
            { atTick: 80, type: 'start' }
        ]
    },
    {
        id: 'interrupt_hold_phase',
        name: '6. DIAGNOSE: Stop-Trigger in WAITING-Sicherheitsphase',
        description: 'KRITISCH: Während der Motor in der Hold-Sicherheitszeit (WAITING) stillsteht, um die Richtung zu wechseln, erfolgt ein Stop-Befehl. Verhindert die State-Machine den automatischen Gegenlauf?',
        totalTicks: 220,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'dirLeft' },
            { atTick: 90, type: 'stop' }
        ]
    },
    {
        id: 'rapid_signal_bouncing',
        name: '7. DIAGNOSE: Signal-Prellen (Rapid Toggles)',
        description: 'EXTREMTEST: Schnelle Abfolge gegensätzlicher Befehle innerhalb weniger Ticks (Start/Stop-Prellen). Deckt unvollständige State-Übergänge und Deadlocks auf.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 12, type: 'stop' },
            { atTick: 14, type: 'start' },
            { atTick: 15, type: 'stop' },
            { atTick: 22, type: 'start' }
        ]
    },

    // ── Richtungssymmetrie (8, 11, 15) ──────────────────────────────────

    {
        id: 'normal_ccw',
        name: '8. Normalfahrt CCW',
        description: 'Standard-Ablauf gegen Uhrzeigersinn: Start in CCW, Konstantfahrt, regulärer Stop. Stellt sicher, dass der native CCW-Pfad (nicht via Richtungswechsel) funktioniert.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirLeft' },
            { atTick: 10, type: 'start' },
            { atTick: 100, type: 'stop' }
        ]
    },
    {
        id: 'direction_reversal_ccw_to_cw',
        name: '11. Richtungswechsel CCW → CW bei Konstantfahrt',
        description: 'Fahrt gegen Uhrzeigersinn → Richtungswechsel-Trigger → Abbremsen → Hold → automatischer Rechtslauf. Spiegel zu Szenario 2.',
        totalTicks: 250,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirLeft' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'dirRight' }
        ]
    },
    {
        id: 'dir_change_during_accel_ccw_to_cw',
        name: '15. Richtungswechsel CCW→CW während Beschleunigung',
        description: 'Motor beschleunigt gegen Uhrzeigersinn → Richtungswechsel zu CW vor Erreichen der Nenndrehzahl. Spiegel zu Szenario 4.',
        totalTicks: 240,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirLeft' },
            { atTick: 10, type: 'start' },
            { atTick: 25, type: 'dirRight' }
        ]
    },

    // ── Preset-Wechsel (9, 16, 21, 22, 26, 27, 28) ─────────────────────

    {
        id: 'preset_change_during_run',
        name: '9. Preset-Wechsel 1→2 bei Konstantfahrt',
        description: 'Start mit Preset 1 (1250 rpm) → während der Fahrt auf Preset 2 (2500 rpm) wechseln. Testet, ob activeDataset sofort umschaltet.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'preset2' },
            { atTick: 120, type: 'stop' }
        ]
    },
    {
        id: 'preset_change_during_accel',
        name: '16. Preset-Wechsel 1→2 während Beschleunigung',
        description: 'Start mit Preset 1 → während der Beschleunigungsrampe auf Preset 2 wechseln. Testet, ob die Rampe korrekt auf das neue, höhere Ziel adaptiert.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 20, type: 'preset2' },
            { atTick: 120, type: 'stop' }
        ]
    },
    {
        id: 'preset_change_2_to_1_during_run',
        name: '21. Preset-Wechsel 2→1 bei Konstantfahrt',
        description: 'Start mit Preset 2 (2500 rpm) → während der Fahrt auf Preset 1 (1250 rpm) zurückschalten. Testet, ob die Drehzahl sofort auf den niedrigeren Wert fällt.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'preset2' },
            { atTick: 15, type: 'start' },
            { atTick: 80, type: 'preset1' },
            { atTick: 120, type: 'stop' }
        ]
    },
    {
        id: 'preset_change_2_to_1_during_accel',
        name: '22. Preset-Wechsel 2→1 während Beschleunigung',
        description: 'Start mit Preset 2 → während der Beschleunigungsrampe auf Preset 1 zurückschalten. Testet, ob die Rampe korrekt auf das neue, niedrigere Ziel adaptiert.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'preset2' },
            { atTick: 15, type: 'start' },
            { atTick: 25, type: 'preset1' },
            { atTick: 120, type: 'stop' }
        ]
    },
    {
        id: 'preset_switch_then_stop',
        name: '26. Preset-Wechsel 1→2 gefolgt von sofortigem Stop',
        description: 'Fahrt auf Preset 1 → Wechsel auf Preset 2 → unmittelbar danach Stop. Testet, ob der Stop-Befehl nach einem Preset-Wechsel korrekt verarbeitet wird.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'preset2' },
            { atTick: 82, type: 'stop' }
        ]
    },
    {
        id: 'preset_switch_then_start_override',
        name: '27. Preset-Wechsel 2→1 gefolgt von START (Override)',
        description: 'Fahrt auf Preset 2 → Wechsel auf Preset 1 → START-Taste. Der START-Handler setzt ohnehin auf Preset 1 zurück — hier kollidieren Preset-Wechsel und START-Logik.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'preset2' },
            { atTick: 15, type: 'start' },
            { atTick: 70, type: 'preset1' },
            { atTick: 72, type: 'start' },
            { atTick: 130, type: 'stop' }
        ]
    },
    {
        id: 'preset_change_during_deceleration',
        name: '28. Preset-Wechsel während Bremsrampe',
        description: 'Stop eingeleitet → während der Bremsrampe Preset wechseln. Der DECELERATING-Handler hat keine explizite Preset-Logik — stellt sicher, dass die Eingabe harmlos ignoriert wird.',
        totalTicks: 180,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'stop' },
            { atTick: 75, type: 'preset2' }
        ]
    },

    // ── Start-during-RUNNING / Fallback (10) ────────────────────────────

    {
        id: 'start_fallback_to_preset1',
        name: '10. Start-Taste bei laufendem Motor (Preset-1-Fallback)',
        description: 'Motor läuft auf Preset 2 → START-Taste gedrückt → fällt auf Preset 1 (1250 rpm) zurück. Testet C++ Logik controller_logic.cpp:261-268.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'preset2' },
            { atTick: 15, type: 'start' },
            { atTick: 80, type: 'start' },
            { atTick: 130, type: 'stop' }
        ]
    },

    // ── AUTO_RESTART Edge-Cases (12, 13, 14) ────────────────────────────

    {
        id: 'stop_during_auto_deceleration',
        name: '12. Stop während automatischer Bremsrampe',
        description: 'Richtungswechsel löst AUTO_RESTART-Bremsung aus → STOP während der Bremsung → Auto-Restart wird abgebrochen → WAITING → STANDBY.',
        totalTicks: 250,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'dirLeft' },
            { atTick: 75, type: 'stop' }
        ]
    },
    {
        id: 'start_during_auto_deceleration_ignored',
        name: '13. DIAGNOSE: Start während AUTO_RESTART-Bremsung (ignoriert)',
        description: 'KRITISCH: Richtungswechsel löst AUTO_RESTART-Bremsung aus → START gedrückt → MUSS ignoriert werden (keine Rückbeschleunigung während sicherheitskritischer Richtungsumkehr).',
        totalTicks: 250,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'dirLeft' },
            { atTick: 75, type: 'start' }
        ]
    },
    {
        id: 'double_direction_reversal',
        name: '14. Doppelter Richtungswechsel (CW → CCW → CW)',
        description: 'Zwei vollständige Richtungswechsel hintereinander. Testet, ob restartIntent und State sauber über mehrere Zyklen hinweg arbeiten.',
        totalTicks: 380,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 60, type: 'dirLeft' },
            { atTick: 140, type: 'dirRight' }
        ]
    },

    // ── Standby-Only (17, 18) ───────────────────────────────────────────

    {
        id: 'standby_preset_and_dir_toggle',
        name: '17. Standby: Preset- und Richtungswechsel ohne Start',
        description: 'Im STANDBY Presets und Richtungen mehrfach umschalten ohne zu starten. Validiert, dass keine versehentlichen Zustandsänderungen passieren.',
        totalTicks: 60,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'preset2' },
            { atTick: 10, type: 'dirLeft' },
            { atTick: 15, type: 'preset1' },
            { atTick: 20, type: 'dirRight' },
            { atTick: 25, type: 'dirLeft' }
        ]
    },
    {
        id: 'start_without_direction',
        name: '18. Start ohne Richtungswahl (Default CW)',
        description: 'START ohne vorherigen Richtungsbefehl. Der Default targetDirection=CW muss greifen.',
        totalTicks: 120,
        tickDurationMs: 500,
        events: [
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'stop' }
        ]
    },

    // ── Preset 2 als Start-Preset (19, 20) ──────────────────────────────

    {
        id: 'normal_cw_preset2',
        name: '19. Normalfahrt CW mit Preset 2',
        description: 'Preset 2 (2500 rpm) direkt aus STANDBY ausgewählt → Start → Konstantfahrt → Stop. Testet, ob Preset-Selektion vor dem Start korrekt übernommen wird.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 8, type: 'preset2' },
            { atTick: 10, type: 'start' },
            { atTick: 100, type: 'stop' }
        ]
    },
    {
        id: 'normal_ccw_preset2',
        name: '20. Normalfahrt CCW mit Preset 2',
        description: 'Preset 2 (2500 rpm) + CCW aus STANDBY → Start → Konstantfahrt → Stop. Kombination aus nativem CCW-Pfad und alternativem Preset.',
        totalTicks: 200,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirLeft' },
            { atTick: 8, type: 'preset2' },
            { atTick: 10, type: 'start' },
            { atTick: 100, type: 'stop' }
        ]
    },

    // ── Richtungswechsel auf Preset 2 (23, 24, 25) ──────────────────────

    {
        id: 'direction_reversal_preset2',
        name: '23. Richtungswechsel CW→CCW bei Konstantfahrt (Preset 2)',
        description: 'Fahrt auf Preset 2 (2500 rpm) → Richtungswechsel zu CCW. Testet die Brems- und Beschleunigungsrampen bei höherer Drehzahl (längere Rampenzeiten).',
        totalTicks: 300,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 8, type: 'preset2' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'dirLeft' }
        ]
    },
    {
        id: 'direction_reversal_ccw_to_cw_preset2',
        name: '24. Richtungswechsel CCW→CW bei Konstantfahrt (Preset 2)',
        description: 'Fahrt CCW auf Preset 2 (2500 rpm) → Richtungswechsel zu CW. Spiegel zu Szenario 23.',
        totalTicks: 300,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirLeft' },
            { atTick: 8, type: 'preset2' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'dirRight' }
        ]
    },
    {
        id: 'dir_change_during_accel_preset2',
        name: '25. Richtungswechsel CW→CCW während Beschleunigung (Preset 2)',
        description: 'Beschleunigung Richtung Preset 2 (2500 rpm) → Richtungswechsel vor Erreichen der Nenndrehzahl. Testet asymmetrische Bremsrampe bei höherem Drehzahl-Ziel.',
        totalTicks: 280,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 8, type: 'preset2' },
            { atTick: 10, type: 'start' },
            { atTick: 25, type: 'dirLeft' }
        ]
    },

    // ── Schleuder-Programme (29, 30) ────────────────────────────────────
    // Feature btn_press_schleuder_programm.md Q13. Combo = GELB x gehalten
    // + GRÜN (START) gedrückt (holdTicks!), Ausführung erst nach dem
    // Loslassen aller Tasten (Release-to-run, R1).

    {
        id: 'program_full_run',
        name: '29. Schleuder-Programm PROG_1 (Komplettlauf)',
        description: 'Combo GELB 1 + GRÜN → PROG_1: dAtA 0 → Start CW → Wartezeit → Richtungswechsel CCW → Wartezeit → Richtungswechsel CW → Geschwindigkeitswechsel dAtA 4 → Richtungswechsel CCW → Stopp. Programm startet erst nach Loslassen aller Tasten.',
        totalTicks: 220,
        tickDurationMs: 500,
        events: [
            { atTick: 5, type: 'preset1', holdTicks: 6 },  // GELB 1 halten (Ticks 5–10)
            { atTick: 7, type: 'start',   holdTicks: 4 }   // GRÜN dazu (Ticks 7–10) → Combo
        ]
    },
    {
        id: 'program_exit_stop_during_wait',
        name: '30. Programm-Abbruch: ROT während CCW-Wartephase',
        description: 'PROG_1 läuft → während der Wartezeit nach dem Richtungswechsel auf CCW wird ROT (Stop) gedrückt → Programm-Modus wird verlassen (R6), der normale Stop-Ablauf übernimmt bis STANDBY.',
        totalTicks: 220,
        tickDurationMs: 500,
        events: [
            { atTick: 5,  type: 'preset1', holdTicks: 6 },  // Combo wie Szenario 29
            { atTick: 7,  type: 'start',   holdTicks: 4 },
            { atTick: 60, type: 'stop' }                    // ROT in der CCW-Wartephase
        ]
    },

    // ── Hardware Fault Scenarios (H1–H13) ────────────────────────────────
    // Injected from hardwareFaultScenarios.js — see that file for full
    // per-scenario documentation and fault event type descriptions.

    ...HW_FAULT_SCENARIOS
];
