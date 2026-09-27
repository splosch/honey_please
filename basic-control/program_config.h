/**
 * @file basic-control/program_config.h
 * @brief Schleuder-Programme PROG_1 / PROG_2 — compile-time, im Flash.
 *
 * Auswahl (Feature-Doc docs/btn_press_schleuder_programm.md):
 *   GELB 1 + START -> PROG_1,  GELB 2 + START -> PROG_2 (nur im STANDBY).
 *   Ausfuehrung startet erst, wenn alle Tasten losgelassen sind.
 *
 * Richtungen sind ABSOLUT (kein Umschalten/Toggle, Entscheidung D1):
 *   Die Startrichtung kommt aus `startDirectionCcw`, die Schritte geben
 *   CW/CCW absolut vor. Kein Schritt haengt von der vorherigen Richtung ab.
 *
 * Regeln fuer gueltige Schrittlisten (vom Sequencer vorausgesetzt):
 *   - DIRECTION nur im Stillstand (STANDBY) oder im Lauf (RUNNING_*)
 *     (im Lauf in Gegenrichtung -> bestehendes Bremsrampe-Muster mit
 *     Auto-Neustart; im Lauf in gleicher Richtung -> no-op).
 *   - START nur aus dem Stillstand.
 *   - STOP beendet das Programm (letzter Schritt, Endzustand STANDBY).
 *   - WAIT laesst den Motor/Zustand unveraendert weiterlaufen.
 *
 * TODO-1 (Feature-Doc): Schrittlisten und WAIT-Zeiten sind Platzhalter bis
 * zur Bestaetigung durch den Entwickler.
 */

#pragma once

#include <Arduino.h>
#include "speed_dataset.h"

enum class SchleuderProgramId {
    NONE,
    PROG_1,
    PROG_2
};

enum class ProgramStepAction {
    DIRECTION,   // paramDirectionCcw: absolute Zielrichtung
    SPEED,       // paramDataset: Ziel-Profil (dAtA 0/2/4/6)
    START,
    STOP,
    WAIT         // paramWaitMs: sequencer-lokale Wartezeit (ms)
};

struct ProgramStep {
    ProgramStepAction action;
    bool paramDirectionCcw;
    BinarySpeedDataset paramDataset;
    unsigned long paramWaitMs;
};

struct SchleuderProgram {
    SchleuderProgramId id;
    bool startDirectionCcw;   // absolute Startrichtung (D1, Feature-Doc)
    const ProgramStep* steps;
    uint8_t stepCount;
};

// PROG_1 (Q13-Szenario, Feature-Doc §7): dAtA 0 -> CW laufen -> CCW -> CW ->
// schneller (dAtA 4) -> CCW -> Stopp.
static constexpr ProgramStep PROG_1_STEPS[] = {
    {ProgramStepAction::SPEED,     false, BinarySpeedDataset::DATASET_0, 0UL},
    {ProgramStepAction::START,     false, BinarySpeedDataset::DATASET_0, 0UL},
    {ProgramStepAction::WAIT,      false, BinarySpeedDataset::DATASET_0, 2000UL}, // TODO-1 Platzhalter
    {ProgramStepAction::DIRECTION, true,  BinarySpeedDataset::DATASET_0, 0UL},
    {ProgramStepAction::WAIT,      false, BinarySpeedDataset::DATASET_0, 2000UL}, // TODO-1 Platzhalter
    {ProgramStepAction::DIRECTION, false, BinarySpeedDataset::DATASET_0, 0UL},
    {ProgramStepAction::SPEED,     false, BinarySpeedDataset::DATASET_4, 0UL},
    {ProgramStepAction::DIRECTION, true,  BinarySpeedDataset::DATASET_0, 0UL},
    {ProgramStepAction::STOP,      false, BinarySpeedDataset::DATASET_0, 0UL},
};

// PROG_2 (Vorschlag, TODO-1): gespiegelt — CCW-Start, dAtA 4, andere Wartezeiten.
static constexpr ProgramStep PROG_2_STEPS[] = {
    {ProgramStepAction::SPEED,     false, BinarySpeedDataset::DATASET_4, 0UL},
    {ProgramStepAction::START,     false, BinarySpeedDataset::DATASET_4, 0UL},
    {ProgramStepAction::WAIT,      false, BinarySpeedDataset::DATASET_4, 3000UL}, // TODO-1 Platzhalter
    {ProgramStepAction::DIRECTION, false, BinarySpeedDataset::DATASET_4, 0UL},
    {ProgramStepAction::WAIT,      false, BinarySpeedDataset::DATASET_4, 3000UL}, // TODO-1 Platzhalter
    {ProgramStepAction::DIRECTION, true,  BinarySpeedDataset::DATASET_4, 0UL},
    {ProgramStepAction::SPEED,     false, BinarySpeedDataset::DATASET_0, 0UL},
    {ProgramStepAction::DIRECTION, false, BinarySpeedDataset::DATASET_4, 0UL},
    {ProgramStepAction::STOP,      false, BinarySpeedDataset::DATASET_4, 0UL},
};

static constexpr SchleuderProgram SCHLEUDER_PROGRAMS[] = {
    {
        SchleuderProgramId::PROG_1,
        false,  // startDirectionCcw: RECHTS (CW)
        PROG_1_STEPS,
        sizeof(PROG_1_STEPS) / sizeof(PROG_1_STEPS[0]),
    },
    {
        SchleuderProgramId::PROG_2,
        true,   // startDirectionCcw: LINKS (CCW)
        PROG_2_STEPS,
        sizeof(PROG_2_STEPS) / sizeof(PROG_2_STEPS[0]),
    },
};

static constexpr size_t SCHLEUDER_PROGRAM_COUNT =
    sizeof(SCHLEUDER_PROGRAMS) / sizeof(SCHLEUDER_PROGRAMS[0]);

// nullptr bei NONE/unbekannter Id.
const SchleuderProgram* programById(SchleuderProgramId id);
