#include "controller_logic.h"

static constexpr BinarySpeedDataset kStandbyDataset = BinarySpeedDataset::DATASET_0;

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
    BinarySpeedDataset previousDataset = currentSpeedDataset(cfg);
    controller.selectedRunDataset = dataset;

    // If motor is not running, keep relays at standby profile until start.
    if (isStartRelayEnabled(cfg)) {
        applySpeedDataset(cfg, dataset);
    }

    Serial.print(sourceText);
    Serial.print(F(" -> Modus gesetzt: "));
    Serial.println(datasetText(dataset));

    if (isStartRelayEnabled(cfg) && previousDataset != dataset) {
        unsigned long switchMs = computeSwitchDurationMs(previousDataset, dataset);
        Serial.print(F("      Profilwechsel "));
        Serial.print(datasetText(previousDataset));
        Serial.print(F(" -> "));
        Serial.print(datasetText(dataset));
        Serial.print(F("; berechnete Uebergangszeit: "));
        Serial.print(switchMs);
        Serial.println(F(" ms"));
    }

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
        currentSpeedDataset(cfg),
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
    const unsigned long decelToStopMs =
        computeDecelerationDurationToStopMs(controller.decelFromDataset);
    Serial.print(F("[STANDBY] Bereit. Gesamtwartezeit: "));
    Serial.print((decelToStopMs + cfg.sicherheitsPauseMs) / 1000);
    Serial.println(F(" s abgelaufen."));
    Serial.println(F(""));
}

// ── Schleuder-Programme (Feature-Doc docs/btn_press_schleuder_programm.md) ────

static const __FlashStringHelper* programTag(const ControllerState& controller) {
    return controller.programId == SchleuderProgramId::PROG_1
        ? F("[PROG_1]") : F("[PROG_2]");
}

static bool anyButtonPressed(const InputSnapshot& inputs) {
    return inputs.dirLeftPressed || inputs.dirRightPressed || inputs.stopPressed
        || inputs.preset1Pressed || inputs.preset2Pressed || inputs.startPressed;
}

static void beginProgramSelection(
    ControllerState& controller,
    SchleuderProgramId id) {
    controller.programId = id;
    controller.programStepIndex = 0;
    controller.programStepDispatched = false;
    controller.programStepStartMs = 0;
    controller.id = ControllerStateId::PROGRAM_SELECTION;
}

static void clearProgramContext(ControllerState& controller) {
    controller.programId = SchleuderProgramId::NONE;
    controller.programStepIndex = 0;
    controller.programStepDispatched = false;
    controller.programStepStartMs = 0;
}

static void handleProgramSelection(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    (void)nowMs;

    // Solange eine Kombi-Taste gehalten wird: warten, alle Aktionen
    // unterdruecken (R1).
    if (inputs.preset1Pressed || inputs.preset2Pressed || inputs.startPressed) {
        return;
    }

    // Dritte Taste waehrend der Auswahl: Auswahl abbrechen; die normale
    // Tasten-Aktion greift im naechsten Tick (level-basierte Eingabe).
    if (inputs.dirLeftPressed || inputs.dirRightPressed || inputs.stopPressed) {
        Serial.print(programTag(controller));
        Serial.println(F(" Auswahl abgebrochen (andere Taste gedrueckt)"));
        clearProgramContext(controller);
        controller.id = ControllerStateId::STANDBY;
        return;
    }

    // Alle Tasten losgelassen -> Startrichtung anwenden (D1) und Schritt 0.
    const SchleuderProgram* program = programById(controller.programId);
    if (program == nullptr) {
        clearProgramContext(controller);
        controller.id = ControllerStateId::STANDBY;
        return;
    }
    setTargetDirection(
        controller,
        program->startDirectionCcw ? SpinDirection::CCW : SpinDirection::CW);
    setDirectionRelay(cfg, program->startDirectionCcw);
    controller.id = ControllerStateId::STANDBY;
    Serial.print(programTag(controller));
    Serial.print(F(" Alle Tasten losgelassen -> Programmstart, Richtung: "));
    Serial.println(directionText(program->startDirectionCcw
        ? SpinDirection::CCW : SpinDirection::CW));
    printRelayStates(cfg);
}

static void dispatchProgramStep(
    ControllerState& controller,
    const SchleuderProgram& program,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    const ProgramStep& step = program.steps[controller.programStepIndex];

    Serial.print(programTag(controller));
    Serial.print(F(" Schritt "));
    Serial.print(controller.programStepIndex + 1);
    Serial.print(F("/"));
    Serial.print(program.stepCount);
    Serial.print(F(": "));

    switch (step.action) {
        case ProgramStepAction::DIRECTION: {
            bool wantCcw = step.paramDirectionCcw;
            Serial.println(wantCcw ? F("DIRECTION LINKS (CCW)") : F("DIRECTION RECHTS (CW)"));
            if (controller.id == ControllerStateId::STANDBY) {
                setTargetDirection(
                    controller,
                    wantCcw ? SpinDirection::CCW : SpinDirection::CW);
                setDirectionRelay(cfg, wantCcw);
            }
            else if ((controller.id == ControllerStateId::RUNNING_CW && wantCcw)
                || (controller.id == ControllerStateId::RUNNING_CCW && !wantCcw)) {
                // Richtungswechsel im Lauf: bestehendes Muster Bremsrampe ->
                // Sicherheitspause -> Auto-Neustart (R7).
                SpinDirection runningDirection =
                    (controller.id == ControllerStateId::RUNNING_CW)
                        ? SpinDirection::CW : SpinDirection::CCW;
                requestDirectionChange(
                    controller,
                    nowMs,
                    wantCcw ? SpinDirection::CCW : SpinDirection::CW,
                    runningDirection,
                    cfg);
            }
            // Bereits in Zielrichtung: nichts zu tun.
            break;
        }
        case ProgramStepAction::SPEED: {
            Serial.println(datasetText(step.paramDataset));
            BinarySpeedDataset previousDataset = currentSpeedDataset(cfg);
            setSelectedRunDataset(
                controller,
                cfg,
                step.paramDataset,
                programTag(controller));
            if ((controller.id == ControllerStateId::RUNNING_CW
                 || controller.id == ControllerStateId::RUNNING_CCW)
                && previousDataset != step.paramDataset) {
                // R12: Wechsel-Rampe im Lauf.
                beginSpeedSwitchRamp(
                    controller,
                    nowMs,
                    previousDataset,
                    step.paramDataset);
            }
            break;
        }
        case ProgramStepAction::START: {
            Serial.println(F("START"));
            delay(cfg.relaySettleMs);
            applySpeedDataset(cfg, controller.selectedRunDataset);
            setStartRelayEnabled(cfg, true);
            beginAcceleration(controller, nowMs, 0.0f);
            Serial.print(programTag(controller));
            Serial.print(F("      Anlauframpe -> "));
            Serial.println(directionText(controller.targetDirection));
            printRelayStates(cfg);
            break;
        }
        case ProgramStepAction::STOP: {
            Serial.println(F("STOP"));
            if (controller.id != ControllerStateId::STANDBY) {
                setStartRelayEnabled(cfg, false);
                SpinDirection runningDirection =
                    (controller.id == ControllerStateId::RUNNING_CCW)
                        ? SpinDirection::CCW : SpinDirection::CW;
                beginDeceleration(
                    controller,
                    nowMs,
                    1.0f,
                    currentSpeedDataset(cfg),
                    runningDirection,
                    RestartIntent::NONE);
                Serial.println(F("      Bremsrampe laeuft"));
                printRelayStates(cfg);
            }
            break;
        }
        case ProgramStepAction::WAIT: {
            controller.programStepStartMs = nowMs;
            Serial.print(F("WAIT "));
            Serial.print(step.paramWaitMs);
            Serial.println(F(" ms"));
            break;
        }
    }
}

static bool programStepDone(
    const ControllerState& controller,
    const ProgramStep& step,
    unsigned long nowMs) {
    switch (step.action) {
        case ProgramStepAction::DIRECTION: {
            if (controller.id == ControllerStateId::STANDBY) {
                return true;  // Richtung im Stillstand sofort gesetzt
            }
            return (controller.id == ControllerStateId::RUNNING_CW && !step.paramDirectionCcw)
                || (controller.id == ControllerStateId::RUNNING_CCW && step.paramDirectionCcw);
        }
        case ProgramStepAction::SPEED:
            return controller.id == ControllerStateId::STANDBY
                || controller.id == ControllerStateId::RUNNING_CW
                || controller.id == ControllerStateId::RUNNING_CCW;
        case ProgramStepAction::START:
            return controller.id == ControllerStateId::RUNNING_CW
                || controller.id == ControllerStateId::RUNNING_CCW;
        case ProgramStepAction::STOP:
            return controller.id == ControllerStateId::STANDBY;
        case ProgramStepAction::WAIT:
            return (nowMs - controller.programStepStartMs) >= step.paramWaitMs;
    }
    return true;
}

static void runProgramSequencer(
    ControllerState& controller,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    const SchleuderProgram* program = programById(controller.programId);
    if (program == nullptr) {
        clearProgramContext(controller);
        return;
    }

    // Pro Tick hoechstens alle Schritte einmal durchlaufen (sofort erledigte
    // Schritte laufen ohne Zustandswechsel in Serie durch).
    for (uint8_t i = 0; i < program->stepCount; ++i) {
        if (!controller.programStepDispatched) {
            controller.programStepDispatched = true;
            dispatchProgramStep(controller, *program, nowMs, cfg);
        }

        const ProgramStep& step = program->steps[controller.programStepIndex];
        if (!programStepDone(controller, step, nowMs)) {
            return;  // Schritt laeuft — normale Zustandsmaschine uebernimmt.
        }

        Serial.print(programTag(controller));
        Serial.print(F(" Schritt "));
        Serial.print(controller.programStepIndex + 1);
        Serial.print(F("/"));
        Serial.print(program->stepCount);
        Serial.println(F(" abgeschlossen"));

        controller.programStepIndex++;
        controller.programStepDispatched = false;
        controller.programStepStartMs = 0;

        if (controller.programStepIndex >= program->stepCount) {
            Serial.print(programTag(controller));
            Serial.println(F(" Programm beendet - STANDBY"));
            clearProgramContext(controller);
            return;
        }
    }
}

static void handleStandby(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    const BasicControlConfig& cfg) {
    // R1: Kombination GELB x + START -> Programm-Auswahl (nur im STANDBY).
    // Muss VOR allen Einzeltasten-Aktionen laufen, damit Preset/Start
    // unterdrueckt werden. Ausfuehrung startet erst nach dem Loslassen
    // aller Tasten.
    if (inputs.startPressed && (inputs.preset1Pressed || inputs.preset2Pressed)) {
        beginProgramSelection(
            controller,
            inputs.preset1Pressed ? SchleuderProgramId::PROG_1
                                   : SchleuderProgramId::PROG_2);
        Serial.print(programTag(controller));
        Serial.println(F(" Auswahl: Speed-Taste + Start gedrueckt"));
        Serial.println(F("      Alle Tasten losgelassen -> Programm startet"));
        return;
    }
    if (inputs.preset1Pressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            cfg.preset1Dataset,
            F("[PRESET 1] Gelb-1 gedrueckt"));
        delay(cfg.debounceActionMs);
    }
    else if (inputs.preset2Pressed) {
        setSelectedRunDataset(
            controller,
            cfg,
            cfg.preset2Dataset,
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
        // Waehrend einer (Wechsel-)Rampe: Override verwerfen, Rampe rechnet
        // ab jetzt mit dem neuen Zielprofil (R12).
        controller.rampOverrideDurationMs = 0;
        controller.rampIsSlowdown = false;
        setSelectedRunDataset(
            controller,
            cfg,
            cfg.preset1Dataset,
            F("[PRESET 1] Gelb-1 gedrueckt"));
        delay(cfg.debounceActionMs);
    }
    else if (inputs.preset2Pressed) {
        controller.rampOverrideDurationMs = 0;
        controller.rampIsSlowdown = false;
        setSelectedRunDataset(
            controller,
            cfg,
            cfg.preset2Dataset,
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
                currentSpeedDataset(cfg),
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
                currentSpeedDataset(cfg),
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
    // R12: Profilwechsel im Lauf faehrt jetzt eine Rampe (ANLAUFEN-Zustand
    // fuer die berechnete Uebergangszeit), statt das Profil sofort zu schalten.
    if (inputs.preset1Pressed) {
        BinarySpeedDataset previousDataset = currentSpeedDataset(cfg);
        setSelectedRunDataset(
            controller,
            cfg,
            cfg.preset1Dataset,
            F("[PRESET 1] Gelb-1 gedrueckt"));
        if (previousDataset != cfg.preset1Dataset) {
            beginSpeedSwitchRamp(controller, nowMs, previousDataset, cfg.preset1Dataset);
            Serial.print(F("[PROFIL] Wechsel-Rampe laeuft -> "));
            Serial.println(datasetText(cfg.preset1Dataset));
            printRelayStates(cfg);
        }
        delay(cfg.debounceActionMs);
        return;
    }
    else if (inputs.preset2Pressed) {
        BinarySpeedDataset previousDataset = currentSpeedDataset(cfg);
        setSelectedRunDataset(
            controller,
            cfg,
            cfg.preset2Dataset,
            F("[PRESET 2] Gelb-2 gedrueckt"));
        if (previousDataset != cfg.preset2Dataset) {
            beginSpeedSwitchRamp(controller, nowMs, previousDataset, cfg.preset2Dataset);
            Serial.print(F("[PROFIL] Wechsel-Rampe laeuft -> "));
            Serial.println(datasetText(cfg.preset2Dataset));
            printRelayStates(cfg);
        }
        delay(cfg.debounceActionMs);
        return;
    }

    if (inputs.stopPressed) {
        setStartRelayEnabled(cfg, false);
        beginDeceleration(
            controller,
            nowMs,
            1.0f,
            currentSpeedDataset(cfg),
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
            cfg.preset1Dataset,
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
    // ── Programm-Runner Overlay (R4/R6) ──────────────────────────────────────
    // Jede Taste beendet den Programm-Modus (R6/Q9); die Taste faellt danach
    // an den normalen Handler des aktuellen Zustands durch. Ohne Tastendruck
    // arbeitet der Sequencer die Schritte ab — die normale Zustandsmaschine
    // fuehrt die Motor-Uebergaenge dabei unveraendert aus.
    if (controller.programId != SchleuderProgramId::NONE
        && controller.id != ControllerStateId::PROGRAM_SELECTION) {
        if (anyButtonPressed(inputs)) {
            Serial.print(programTag(controller));
            Serial.println(F(" Programm verlassen (Taste gedrueckt)"));
            clearProgramContext(controller);
        }
        else {
            runProgramSequencer(controller, nowMs, cfg);
        }
    }

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
        case ControllerStateId::PROGRAM_SELECTION:
            handleProgramSelection(controller, inputs, nowMs, cfg);
            break;
    }
}
