#pragma once

#include <Arduino.h>
#include "config.h"
#include "program_config.h"
#include "speed_dataset.h"

enum class ControllerStateId {
    STANDBY,
    ACCELERATING,
    RUNNING_CW,
    RUNNING_CCW,
    DECELERATING,
    WAITING,
    PROGRAM_SELECTION
};

enum class SpinDirection {
    CW,
    CCW
};

enum class RestartIntent {
    NONE,
    AUTO_RESTART
};

struct ControllerState {
    ControllerStateId id;
    SpinDirection targetDirection;
    SpinDirection runningDirection;
    BinarySpeedDataset selectedRunDataset;
    BinarySpeedDataset decelFromDataset;
    RestartIntent restartIntent;
    unsigned long stateTimerStartMs;
    float rampStartProgress;

    // Schleuder-Programm (Feature-Doc docs/btn_press_schleuder_programm.md)
    SchleuderProgramId programId;        // NONE = kein Programm aktiv
    uint8_t programStepIndex;            // Index in die Flash-Schrittliste
    bool programStepDispatched;          // Trigger-Aktion des Schritts ausgeloest?
    unsigned long programStepStartMs;    // Startzeitpunkt des WAIT-Schritts

    // R12: Rampe beim Profilwechsel im Lauf.
    // rampOverrideDurationMs != 0 ersetzt die normale Anlaufdauer-Berechnung
    // (computeSwitchDurationMs). rampIsSlowdown dreht die Ring-Animation um
    // (Ring wird langsamer statt schneller, z. B. bei Absenkung der Drehzahl).
    unsigned long rampOverrideDurationMs;
    bool rampIsSlowdown;
};

ControllerState makeInitialControllerState();

bool isDirectionCCW(SpinDirection direction);
bool hasAutoRestart(const ControllerState& state);

void setTargetDirection(ControllerState& state, SpinDirection direction);
void flipTargetDirection(ControllerState& state);

float getRampProgress(
    const ControllerState& state,
    unsigned long nowMs,
    const BasicControlConfig& config);

unsigned long getEffectiveAccelerationDurationMs(
    const ControllerState& state,
    const BasicControlConfig& config);

unsigned long getEffectiveDecelerationDurationMs(
    const ControllerState& state,
    const BasicControlConfig& config);

void beginAcceleration(ControllerState& state, unsigned long nowMs, float fromProgress);
void completeAcceleration(ControllerState& state);

void beginDeceleration(
    ControllerState& state,
    unsigned long nowMs,
    float fromProgress,
    BinarySpeedDataset decelFromDataset,
    SpinDirection runningDirection,
    RestartIntent intent);

void beginWaiting(ControllerState& state, unsigned long nowMs);
void completeWaitingToStandby(ControllerState& state);
void consumeAutoRestart(ControllerState& state);

// R12: Rampe fuer Profilwechsel im Lauf (Richtung/Zeit aus den dAtA-Profilen).
void beginSpeedSwitchRamp(
    ControllerState& state,
    unsigned long nowMs,
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset);
