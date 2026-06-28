#pragma once

#include <Arduino.h>
#include "config.h"
#include "speed_dataset.h"

enum class ControllerStateId {
    STANDBY,
    ACCELERATING,
    RUNNING_CW,
    RUNNING_CCW,
    DECELERATING,
    WAITING
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
