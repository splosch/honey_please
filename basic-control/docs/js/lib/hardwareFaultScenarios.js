/**
 * hardwareFaultScenarios.js — Hardware fault injection scenarios
 * ==============================================================
 * These scenarios inject realistic relay hardware failures into the
 * simulation. Each scenario pre-registers fault specs via the
 * `hardwareFaults` array and can dynamically inject/clear faults via
 * `faultInject` / `faultClear` events.
 *
 * Fault event types:
 *   faultInject — { atTick, type: 'faultInject',
 *     payload: { relay, type: FaultType, value?, durationTicks?, … } }
 *   faultClear  — { atTick, type: 'faultClear',
 *     payload: { faultId } }
 *
 * The mismatch between commanded and actual relay state is rendered
 * as a separate row (HW_FAULT_COLOR) in the BMP output.
 *
 * Imported by simulationScenarios.js and spread into the main SCENARIOS array.
 */

// ══════════════════════════════════════════════════════════════════════
// ── Hardware Fault Scenarios (H1–H8) ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

// ── H1: M2 stuck HIGH — wrong speed on start ─────────────────────────

const hwScenariosH1toH8 = [
    {
        id: 'hw_m2_stuck_high',
        name: 'H1. M2 stuck HIGH — dAtA 4 statt dAtA 0',
        description: 'M2-Relais klemmt auf HIGH. Software kommandiert dAtA 0 (M1=LOW,M2=LOW, 1250 rpm) aber Hardware liefert dAtA 4 (M1=LOW,M2=HIGH, 2500 rpm). Der Motor läuft mit doppelter Drehzahl — Software merkt nichts.',
        totalTicks: 150,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M2', type: 'STUCK_AT', value: true }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 90, type: 'stop' }
        ]
    },

    // ── H2: M2 stuck LOW — Preset 2 silently ignored ─────────────────────

    {
        id: 'hw_m2_stuck_low',
        name: 'H2. M2 stuck LOW — Preset 2 (dAtA 4) nicht erreichbar',
        description: 'M2-Relais klemmt auf LOW. Software schaltet auf Preset 2 (dAtA 4, 2500 rpm), aber M2 bleibt LOW → tatsächlich dAtA 0 (1250 rpm). Silent-Performance-Verlust ohne Fehlersignal.',
        totalTicks: 200,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M2', type: 'STUCK_AT', value: false }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'preset2' },
            { atTick: 130, type: 'stop' }
        ]
    },

    // ── H3: M1 stuck HIGH → dAtA 6 End-Lock ─────────────────────────────

    {
        id: 'hw_m1_stuck_high_endlock',
        name: 'H3. M1 stuck HIGH — dAtA 6 (End-Lock) während Fahrt',
        description: 'KRITISCH: M1 klemmt auf HIGH. Sobald auch M2 HIGH wird (Preset 2), liefern die Relais dAtA 6 (0 rpm, 0.2s dc). Bei M2=LOW ist es dAtA 2 (750 rpm). Motor kann unerwartet blockieren.',
        totalTicks: 200,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M1', type: 'STUCK_AT', value: true }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'preset2' },
            { atTick: 130, type: 'stop' }
        ]
    },

    // ── H4: M1 glitch during preset switch → transient dAtA 2 ────────────

    {
        id: 'hw_m1_glitch_during_switch',
        name: 'H4. M1-Glitch bei Preset-Wechsel — transientes dAtA 2',
        description: 'Preset-Wechsel von dAtA 0→dAtA 4 (nur M2 schaltet). Ein M1-Glitch (3 Ticks) erzeugt kurzzeitig dAtA 2 (750 rpm) statt dAtA 4. Testet, ob der 1-Bit-Preset-Wechsel robust gegen M1-Bounce ist.',
        totalTicks: 200,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M1', type: 'GLITCH', value: true, durationTicks: 3 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'preset2' },
            { atTick: 130, type: 'stop' }
        ]
    },

    // ── H5: M2 glitch during preset switch → transient dAtA 6 ────────────

    {
        id: 'hw_m2_glitch_during_switch',
        name: 'H5. M2-Glitch bei Preset-Wechsel — transientes dAtA 6',
        description: 'Fahrt auf dAtA 0 (M1=LOW,M2=LOW). Ein spontaner M2-Glitch (4 Ticks) erzeugt kurzzeitig dAtA 4. Schlimmer: wenn M1 ebenfalls glitcht, entsteht dAtA 6 (End-Lock!). Testet Kaskadeneffekte.',
        totalTicks: 200,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M2', type: 'GLITCH', value: true, durationTicks: 4 },
            { relay: 'M1', type: 'GLITCH', value: true, durationTicks: 4 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'preset2' },
            { atTick: 120, type: 'stop' }
        ]
    },

    // ── H6: Crosstalk — M2 switch disturbs M1 ────────────────────────────

    {
        id: 'hw_crosstalk_m2_disturbs_m1',
        name: 'H6. Crosstalk: M2-Schaltung stört M1',
        description: 'Elektromagnetische Kopplung: Wenn M2 schaltet (dAtA 0→4), flippt M1 kurz mit (2 Ticks). Statt dAtA 0→dAtA 4 geht es dAtA 0→dAtA 2→dAtA 6→dAtA 4. Alle 4 Datasets werden kurz durchlaufen.',
        totalTicks: 200,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M1', type: 'CROSSTALK', sourceRelay: 'M2', durationTicks: 2 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'preset2' },
            { atTick: 130, type: 'stop' }
        ]
    },

    // ── H7: Drift — M2 sporadisch flippend ───────────────────────────────

    {
        id: 'hw_m2_drift',
        name: 'H7. M2-Drift — sporadisches Flackern zwischen dAtA 0↔4',
        description: 'Alterndes Relais: M2 hat 2% Wahrscheinlichkeit pro Tick, spontan zu flippen. Der Motor springt unkontrolliert zwischen 1250 und 2500 rpm. Die Software sieht nur ihren kommandierten State.',
        totalTicks: 250,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M2', type: 'DRIFT', probabilityPerTick: 0.02 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 180, type: 'stop' }
        ]
    },

    // ── H8: M2 delay — Preset-2 wirkt verzögert ─────────────────────────

    {
        id: 'hw_m2_delay',
        name: 'H8. M2-Delay — Preset 2 schaltet 10 Ticks verzögert',
        description: 'M2-Relais hat mechanische Verzögerung (10 Ticks = 5 s). Preset-2-Befehl wird kommandiert, aber M2 folgt erst 5 Sekunden später. Dazwischen läuft der Motor auf dem alten Dataset.',
        totalTicks: 220,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M2', type: 'DELAY', durationTicks: 10 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 80, type: 'preset2' },
            { atTick: 160, type: 'stop' }
        ]
    }
];

// ══════════════════════════════════════════════════════════════════════
// ── H9–H13: Preset-Zyklus 1→2→1 mit Hardware-Faults                  ─
// ══════════════════════════════════════════════════════════════════════
//
// These scenarios build on scenario 29 (preset cycle 1→2→1) and inject
// hardware faults around the preset-2→1 switch (tick 150).  The critical
// transition is M2 HIGH→LOW (dAtA 4→0).  Faults are time-windowed via
// activateAtTick / deactivateAtTick so they only fire during this
// specific transition, not at the earlier 1→2 switch (tick 70).
//
// Dataset reference (M1, M2):
//   dAtA 0 = LOW, LOW  → Preset 1 (1250 rpm)
//   dAtA 2 = HIGH, LOW → 750 rpm    ← "Slowest-Preset"
//   dAtA 4 = LOW, HIGH → Preset 2 (2500 rpm)
//   dAtA 6 = HIGH, HIGH → End-Lock (0 rpm)  ← "Stop-Preset"

const hwScenariosH9toH13 = [
    // ── H9: M1-Crosstalk → dAtA 2 (Slowest-Preset) ─────────────────────

    {
        id: 'hw_preset_cycle_m1_crosstalk_dAtA2',
        name: 'H9. Preset 1→2→1: M1-Crosstalk → dAtA 2 (Slowest)',
        description: 'Preset-Zyklus wie Szenario 29. Beim Rückschalten von Preset 2→1 (M2 HIGH→LOW) stört der M2-Schaltvorgang M1 per Übersprechen: M1 flippt für 3 Ticks auf HIGH. Da M2 bereits LOW ist, entsteht dAtA 2 (750 rpm) — der Motor fällt kurzzeitig unter das kommandierte Preset 1.',
        totalTicks: 280,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M1', type: 'CROSSTALK', sourceRelay: 'M2', durationTicks: 3,
              activateAtTick: 148, deactivateAtTick: 156 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'preset2' },
            { atTick: 150, type: 'preset1' },
            { atTick: 220, type: 'stop' }
        ]
    },

    // ── H10: M1-Crosstalk + M2-Delay → dAtA 6 (End-Lock / Stop-Preset) ─

    {
        id: 'hw_preset_cycle_crosstalk_delay_dAtA6',
        name: 'H10. Preset 1→2→1: M1-Crosstalk + M2-Delay → dAtA 6 (End-Lock)',
        description: 'KRITISCH: Beim Rückschalten von Preset 2→1 verzögert sich M2 (5 Ticks), während der Schaltimpuls M1 per Übersprechen auf HIGH reißt. Solange M2 noch HIGH ist, ergibt sich dAtA 6 (End-Lock, 0 rpm) — der Motor blockiert schlagartig, bis M2 endlich abfällt und auf dAtA 0 (Preset 1) weiterschaltet.',
        totalTicks: 280,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M1', type: 'CROSSTALK', sourceRelay: 'M2', durationTicks: 4,
              activateAtTick: 148, deactivateAtTick: 158 },
            { relay: 'M2', type: 'DELAY', durationTicks: 5,
              activateAtTick: 148, deactivateAtTick: 158 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'preset2' },
            { atTick: 150, type: 'preset1' },
            { atTick: 220, type: 'stop' }
        ]
    },

    // ── H11: M2-Bounce → dAtA 4 flackert ───────────────────────────────

    {
        id: 'hw_preset_cycle_m2_bounce',
        name: 'H11. Preset 1→2→1: M2-Bounce bei Abfall → dAtA 4 flackert',
        description: 'Beim Rückschalten von Preset 2→1 prellt das M2-Relais: Statt sauber von HIGH→LOW zu gehen, glitcht es für 4 Ticks zurück auf HIGH. Der Motor beschleunigt kurzzeitig wieder Richtung Preset 2 (2500 rpm), bevor M2 endgültig abfällt.',
        totalTicks: 280,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M2', type: 'GLITCH', value: true, durationTicks: 4,
              activateAtTick: 148, deactivateAtTick: 156 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'preset2' },
            { atTick: 150, type: 'preset1' },
            { atTick: 220, type: 'stop' }
        ]
    },

    // ── H12: M2-Delay → dAtA 4 verweilt ────────────────────────────────

    {
        id: 'hw_preset_cycle_m2_delay',
        name: 'H12. Preset 1→2→1: M2-Delay → Preset 1 wirkt verzögert',
        description: 'Beim Rückschalten von Preset 2→1 hat das M2-Relais eine mechanische Abfallverzögerung von 8 Ticks (4 s). Der Motor läuft 4 Sekunden länger auf Preset 2 (2500 rpm) weiter, obwohl die Software bereits Preset 1 kommandiert hat.',
        totalTicks: 280,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M2', type: 'DELAY', durationTicks: 8,
              activateAtTick: 148, deactivateAtTick: 160 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'preset2' },
            { atTick: 150, type: 'preset1' },
            { atTick: 220, type: 'stop' }
        ]
    },

    // ── H13: M1-Crosstalk + M2-Glitch → dAtA 6 → dAtA 2 Kaskade ───────

    {
        id: 'hw_preset_cycle_crosstalk_glitch_combo',
        name: 'H13. Preset 1→2→1: M1-Crosstalk + M2-Glitch → dAtA 6→2 Kaskade',
        description: 'KRITISCH: Kombinierter Fehler beim Rückschalten — M2 prellt (Glitch HIGH für 4 Ticks) und stört gleichzeitig M1 per Übersprechen (flippt HIGH für 3 Ticks). Der Dataset-Pfad: dAtA 4 → dAtA 6 (End-Lock, 0 rpm) → dAtA 2 (750 rpm) → dAtA 0 (Preset 1). Der Motor durchläuft alle vier Datasets innerhalb weniger Ticks — blockiert kurz, kriecht dann, bevor er endlich Preset 1 erreicht.',
        totalTicks: 280,
        tickDurationMs: 500,
        hardwareFaults: [
            { relay: 'M1', type: 'CROSSTALK', sourceRelay: 'M2', durationTicks: 3,
              activateAtTick: 148, deactivateAtTick: 158 },
            { relay: 'M2', type: 'GLITCH', value: true, durationTicks: 4,
              activateAtTick: 148, deactivateAtTick: 156 }
        ],
        events: [
            { atTick: 5, type: 'dirRight' },
            { atTick: 10, type: 'start' },
            { atTick: 70, type: 'preset2' },
            { atTick: 150, type: 'preset1' },
            { atTick: 220, type: 'stop' }
        ]
    }
];

/** All hardware fault scenarios (H1–H13), spread into the main SCENARIOS array. */
export const HW_FAULT_SCENARIOS = [...hwScenariosH1toH8, ...hwScenariosH9toH13];
