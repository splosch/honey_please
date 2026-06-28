#include "controller_state.h"

ControllerState makeInitialControllerState() {
    ControllerState state;
    state.id = ControllerStateId::STANDBY;
    state.targetDirection = SpinDirection::CW;
    state.runningDirection = SpinDirection::CW;
    state.selectedRunDataset = BASIC_CONTROL_CONFIG.preset1Dataset;
    state.decelFromDataset = BASIC_CONTROL_CONFIG.preset1Dataset;
    state.restartIntent = RestartIntent::NONE;
    state.stateTimerStartMs = 0;
    state.rampStartProgress = 0.0f;
    return state;
}

bool isDirectionCCW(SpinDirection direction) {
    return direction == SpinDirection::CCW;
}

bool hasAutoRestart(const ControllerState& state) {
    return state.restartIntent == RestartIntent::AUTO_RESTART;
}

void setTargetDirection(ControllerState& state, SpinDirection direction) {
    state.targetDirection = direction;
}

void flipTargetDirection(ControllerState& state) {
    state.targetDirection =
        isDirectionCCW(state.targetDirection) ? SpinDirection::CW : SpinDirection::CCW;
}

float getRampProgress(
    const ControllerState& state,
    unsigned long nowMs,
    const BasicControlConfig& config) {
    (void)config;
    float elapsed = (float)(nowMs - state.stateTimerStartMs);

    switch (state.id) {
        case ControllerStateId::ACCELERATING: {
            const unsigned long accelFromStopMs =
                computeAccelerationDurationFromStopMs(state.selectedRunDataset);
            float effDur = max(
                100.0f,
                (1.0f - state.rampStartProgress)
                    * (float)accelFromStopMs);
            return state.rampStartProgress
                + min(1.0f, elapsed / effDur) * (1.0f - state.rampStartProgress);
        }
        case ControllerStateId::RUNNING_CW:
        case ControllerStateId::RUNNING_CCW:
            return 1.0f;
        case ControllerStateId::DECELERATING: {
            const unsigned long decelToStopMs =
                computeDecelerationDurationToStopMs(state.decelFromDataset);
            float effDur = max(
                100.0f,
                state.rampStartProgress
                    * (float)decelToStopMs);
            return state.rampStartProgress * (1.0f - min(1.0f, elapsed / effDur));
        }
        default:
            return 0.0f;
    }
}

unsigned long getEffectiveAccelerationDurationMs(
    const ControllerState& state,
    const BasicControlConfig& config) {
    (void)config;
    const unsigned long accelFromStopMs =
        computeAccelerationDurationFromStopMs(state.selectedRunDataset);
    return (unsigned long)max(
        100.0f,
        (1.0f - state.rampStartProgress)
            * (float)accelFromStopMs);
}

unsigned long getEffectiveDecelerationDurationMs(
    const ControllerState& state,
    const BasicControlConfig& config) {
    (void)config;
    const unsigned long decelToStopMs =
        computeDecelerationDurationToStopMs(state.decelFromDataset);
    return (unsigned long)max(
        100.0f,
        state.rampStartProgress
            * (float)decelToStopMs);
}

void beginAcceleration(ControllerState& state, unsigned long nowMs, float fromProgress) {
    state.rampStartProgress = fromProgress;
    state.stateTimerStartMs = nowMs;
    state.restartIntent = RestartIntent::NONE;
    state.id = ControllerStateId::ACCELERATING;
}

void completeAcceleration(ControllerState& state) {
    state.id = isDirectionCCW(state.targetDirection)
        ? ControllerStateId::RUNNING_CCW
        : ControllerStateId::RUNNING_CW;
}

void beginDeceleration(
    ControllerState& state,
    unsigned long nowMs,
    float fromProgress,
    BinarySpeedDataset decelFromDataset,
    SpinDirection runningDirection,
    RestartIntent intent) {
    state.rampStartProgress = fromProgress;
    state.decelFromDataset = decelFromDataset;
    state.runningDirection = runningDirection;
    state.stateTimerStartMs = nowMs;
    state.restartIntent = intent;
    state.id = ControllerStateId::DECELERATING;
}

void beginWaiting(ControllerState& state, unsigned long nowMs) {
    state.stateTimerStartMs = nowMs;
    state.id = ControllerStateId::WAITING;
}

void completeWaitingToStandby(ControllerState& state) {
    state.id = ControllerStateId::STANDBY;
}

void consumeAutoRestart(ControllerState& state) {
    state.restartIntent = RestartIntent::NONE;
}
