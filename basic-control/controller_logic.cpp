#include "controller_logic.h"

static constexpr BinarySpeedDataset kStandbyDataset = BinarySpeedDataset::DATASET_0;
static constexpr BinarySpeedDataset kMode1Dataset = BinarySpeedDataset::DATASET_2;

static void printRelayStates(const BasicControlConfig& cfg) {
    Serial.print(F("  [REL1/X1="));
    Serial.print(isStartRelayEnabled(cfg) ? F("ON") : F("OFF"));
    Serial.print(F(", REL2/X3="));
    Serial.print(isDirectionRelayCCW(cfg) ? F("CCW") : F("CW"));
    Serial.print(F(", M1/M2="));
    Serial.print(datasetText(currentSpeedDataset(cfg)));
    Serial.println(F("]"));
}

static const __FlashStringHelper* directionText(SpinDirection direction) {
    return isDirectionCCW(direction) ? F("LINKS (CCW)") : F("RECHTS (CW)");
}

static void setSelectedRunDataset(
    ControllerState& controller,
    const BasicControlConfig& cfg,
    BinarySpeedDataset dataset,
    const __FlashStringHelper* sourceText) {
    controller.selectedRunDataset = dataset;

    // If motor is not running, keep relays at standby profile until start.
    if (isStartRelayEnabled(cfg)) {
        applySpeedDataset(cfg, dataset);
    }

    Serial.print(sourceText);
    Serial.print(F(" -> Modus gesetzt: "));
    Serial.println(datasetText(dataset));
    printRelayStates(cfg);
}

static void requestDirectionChange(
    ControllerState& controller,
    unsigned long nowMs,
    SpinDirection newDirection,
    SpinDirection runningDirection,
    const BasicControlConfig& cfg) {
    setTargetDirection(controller, newDirection);
    setStartRelayEnabled(cfg, false);
    beginDeceleration(
        controller,
        nowMs,
        1.0f,
        runningDirection,
        RestartIntent::AUTO_RESTART);

    Serial.print(F("[DIR] Richtungswechsel -> "));
    Serial.println(directionText(newDirection));
    Serial.println(F("      Bremsrampe laeuft, danach Auto-Neustart"));
    printRelayStates(cfg);
    delay(cfg.debounceActionMs);
}

static void completeWaitingPeriod(
    ControllerState& controller,
    const BasicControlConfig& cfg) {
    if (hasAutoRestart(controller)) {
        // Set relay direction before restart and wait for relay settle time.
        setDirectionRelay(cfg, isDirectionCCW(controller.targetDirection));
        applySpeedDataset(cfg, controller.selectedRunDataset);
        delay(cfg.relaySettleMs);
        setStartRelayEnabled(cfg, true);
        beginAcceleration(controller, millis(), 0.0f);
        consumeAutoRestart(controller);

        Serial.print(F("[AUTO-START] Richtung gesetzt -> Anlauframpe -> "));
        Serial.println(directionText(controller.targetDirection));
        printRelayStates(cfg);
        return;
    }

    completeWaitingToStandby(controller);
    applySpeedDataset(cfg, kStandbyDataset);
    Serial.print(F("[STANDBY] Bereit. Gesamtwartezeit: "));
    Serial.print((cfg.bremsRampenZeitMs + cfg.sicherheitsPauseMs) / 1000);
    Serial.println(F(" s abgelaufen."));
    Serial.println(F(""));
}

static void handleStandby(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    if (inputs.preset1Pressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            BinarySpeedDataset::DATASET_2,
            F("[PRESET 1] Gelb-1 gedrueckt"));
        delay(cfg.debounceActionMs);
    }
    else if (inputs.preset2Pressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            BinarySpeedDataset::DATASET_4,
            F("[PRESET 2] Gelb-2 gedrueckt"));
        delay(cfg.debounceActionMs);
    }

    if (inputs.dirLeftPressed) {
        setTargetDirection(controller, SpinDirection::CCW);
        setDirectionRelay(cfg, true);
        Serial.println(F("[STANDBY] Richtung gewaehlt: LINKS (CCW)"));
        printRelayStates(cfg);
        delay(cfg.debounceDirectionMs);
    }
    else if (inputs.dirRightPressed) {
        setTargetDirection(controller, SpinDirection::CW);
        setDirectionRelay(cfg, false);
        Serial.println(F("[STANDBY] Richtung gewaehlt: RECHTS (CW)"));
        printRelayStates(cfg);
        delay(cfg.debounceDirectionMs);
    }

    if (inputs.startPressed) {
        applySpeedDataset(cfg, controller.selectedRunDataset);
        setStartRelayEnabled(cfg, true);
        beginAcceleration(controller, nowMs, 0.0f);
        Serial.print(F("[START] Anlauframpe -> "));
        Serial.println(directionText(controller.targetDirection));
        Serial.print(F("        Geschwindigkeitsmodus: "));
        Serial.println(datasetText(controller.selectedRunDataset));
        printRelayStates(cfg);
        delay(cfg.debounceActionMs);
    }
}

static void handleAccelerating(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    if (inputs.preset1Pressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            BinarySpeedDataset::DATASET_2,
            F("[PRESET 1] Gelb-1 gedrueckt"));
        delay(cfg.debounceActionMs);
    }
    else if (inputs.preset2Pressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            BinarySpeedDataset::DATASET_4,
            F("[PRESET 2] Gelb-2 gedrueckt"));
        delay(cfg.debounceActionMs);
    }

    bool dirChange =
        (!isDirectionCCW(controller.targetDirection) && inputs.dirLeftPressed) ||
        (isDirectionCCW(controller.targetDirection) && inputs.dirRightPressed);

    if (inputs.stopPressed || dirChange) {
        float currentProgress = getRampProgress(controller, nowMs, cfg);
        setStartRelayEnabled(cfg, false);
        if (dirChange) {
            SpinDirection runningDirection = controller.targetDirection;
            flipTargetDirection(controller);
            beginDeceleration(
                controller,
                nowMs,
                currentProgress,
                runningDirection,
                RestartIntent::AUTO_RESTART);
            Serial.print(F("[DIR] Richtungswechsel im Anlauf -> "));
            Serial.println(directionText(controller.targetDirection));
            Serial.println(F("      Bremsrampe proportional, danach Auto-Neustart"));
        }
        else {
            beginDeceleration(
                controller,
                nowMs,
                currentProgress,
                controller.targetDirection,
                RestartIntent::NONE);
            Serial.print(F("[STOP] Anlauf abgebrochen bei "));
            Serial.print((int)(currentProgress * 100.0f));
            Serial.println(F("% - Bremsrampe proportional"));
        }
        printRelayStates(cfg);
        delay(cfg.debounceActionMs);
        return;
    }

    unsigned long effAccelDur = getEffectiveAccelerationDurationMs(controller, cfg);
    if (nowMs - controller.stateTimerStartMs >= effAccelDur) {
        completeAcceleration(controller);
        Serial.print(F("[RUNNING] Anlauframpe abgeschlossen -> "));
        Serial.print(F("LAEUFT "));
        Serial.println(directionText(controller.targetDirection));
    }
}

static void handleRunning(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    SpinDirection runningDirection,
    const BasicControlConfig& cfg) {
    if (inputs.preset1Pressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            BinarySpeedDataset::DATASET_2,
            F("[PRESET 1] Gelb-1 gedrueckt"));
        delay(cfg.debounceActionMs);
    }
    else if (inputs.preset2Pressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            BinarySpeedDataset::DATASET_4,
            F("[PRESET 2] Gelb-2 gedrueckt"));
        delay(cfg.debounceActionMs);
    }

    if (inputs.stopPressed) {
        setStartRelayEnabled(cfg, false);
        beginDeceleration(
            controller,
            nowMs,
            1.0f,
            runningDirection,
            RestartIntent::NONE);
        Serial.println(F("[STOP] Signal erhalten - Bremsrampe laeuft"));
        printRelayStates(cfg);
        delay(cfg.debounceActionMs);
        return;
    }

    // Re-pressing START while already running always falls back to Mode 1 (slower).
    if (inputs.startPressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            kMode1Dataset,
            F("[START] Erneut gedrueckt (RUNNING)"));
        delay(cfg.debounceActionMs);
        return;
    }

    bool changeToCCW = !isDirectionCCW(runningDirection) && inputs.dirLeftPressed;
    bool changeToCW = isDirectionCCW(runningDirection) && inputs.dirRightPressed;
    if (changeToCCW) {
        requestDirectionChange(
            controller,
            nowMs,
            SpinDirection::CCW,
            runningDirection,
            cfg);
    }
    else if (changeToCW) {
        requestDirectionChange(
            controller,
            nowMs,
            SpinDirection::CW,
            runningDirection,
            cfg);
    }
}

static void handleDecelerating(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    unsigned long effDecelDur = getEffectiveDecelerationDurationMs(controller, cfg);

    if (inputs.stopPressed && hasAutoRestart(controller)) {
        consumeAutoRestart(controller);
        Serial.println(F("[STOP] Auto-Neustart waehrend Bremsrampe verworfen"));
        printRelayStates(cfg);
        delay(cfg.debounceActionMs);
    }

    if (!hasAutoRestart(controller) && inputs.startPressed) {
        float currentProgress = getRampProgress(controller, nowMs, cfg);
        setStartRelayEnabled(cfg, true);
        beginAcceleration(controller, nowMs, currentProgress);
        Serial.print(F("[RE-START] Bremsung umgekehrt bei "));
        Serial.print((int)(currentProgress * 100.0f));
        Serial.println(F("% -> Anlauframpe"));
        printRelayStates(cfg);
        delay(cfg.debounceActionMs);
        return;
    }

    if (nowMs - controller.stateTimerStartMs >= effDecelDur) {
        beginWaiting(controller, nowMs);
        Serial.print(F("[WARTEN] Bremsrampe abgelaufen ("));
        Serial.print(effDecelDur / 1000);
        Serial.print(F(" s). "));
        Serial.println(hasAutoRestart(controller)
            ? F("Auto-Neustart folgt...")
            : F("Sicherheitspause laeuft..."));
    }
}

static void handleWaiting(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    if (inputs.stopPressed && hasAutoRestart(controller)) {
        consumeAutoRestart(controller);
        Serial.println(F("[STOP] Auto-Neustart in Sicherheitspause verworfen"));
        printRelayStates(cfg);
        delay(cfg.debounceActionMs);
    }

    if (nowMs - controller.stateTimerStartMs >= cfg.sicherheitsPauseMs) {
        completeWaitingPeriod(controller, cfg);
    }
}

void tickController(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    switch (controller.id) {
        case ControllerStateId::STANDBY:
            handleStandby(controller, inputs, nowMs, cfg);
            break;
        case ControllerStateId::ACCELERATING:
            handleAccelerating(controller, inputs, nowMs, cfg);
            break;
        case ControllerStateId::RUNNING_CW:
            handleRunning(controller, inputs, nowMs, SpinDirection::CW, cfg);
            break;
        case ControllerStateId::RUNNING_CCW:
            handleRunning(controller, inputs, nowMs, SpinDirection::CCW, cfg);
            break;
        case ControllerStateId::DECELERATING:
            handleDecelerating(controller, inputs, nowMs, cfg);
            break;
        case ControllerStateId::WAITING:
            handleWaiting(controller, inputs, nowMs, cfg);
            break;
    }
}
