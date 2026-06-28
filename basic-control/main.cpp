/**
 * @file basic-control/main.cpp
 * @brief Honigschleuder – Basic-Control
 *
 * Referenz-Verdrahtungsplan : docs/ErsteInbetriebnahmeMotorundSteuerung.html
 * PlatformIO-Umgebung       : r4wifi_basic_control
 * Flash-Befehl              : npm run basic-control:build  (Compile-Check)
 *                             npm run basic-control:flash  (Upload via auto-detected USB port)
 *
 * ─── Pin-Belegung (muss mit HTML-Verdrahtungsplan übereinstimmen) ───────────
 * Hinweis: Diese komplette Zuordnung ist zusaetzlich in basic-control/config.h
 * als modul-lokale Dokumentation hinterlegt und muss bei Aenderungen dort
 * mit gepflegt werden 
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️  Relay-Modul-Hinweis:
 *     Dieser Sketch verwendet HIGH = Relais zieht an (aktiv-HIGH).
 */

#include <Arduino.h>
#include "Arduino_LED_Matrix.h"
#include "config.h"
#include "controller_state.h"
#include "hardware_io.h"

// ── ZENTRALE KONFIGURATION ───────────────────────────────────────────────────
static constexpr BasicControlConfig CFG = BASIC_CONTROL_CONFIG;

static void printBootBanner() {
    Serial.println(F(""));
    Serial.println(F("============================================================"));
    Serial.println(F("  honey_please - BASIC-CONTROL / Wiring Verification Sketch"));
    Serial.println(F("  Referenz: ErsteInbetriebnahmeMotorundSteuerung.html"));
    Serial.println(F("============================================================"));
    Serial.println(F("  Pin-Belegung (aus config.h):"));

    for (size_t i = 0; i < BASIC_CONTROL_WIRING_COUNT; ++i) {
        const WiringEntry& entry = BASIC_CONTROL_WIRING[i];
        Serial.print(F("    D"));
        Serial.print(entry.pin);
        Serial.print(F(" "));
        Serial.print(entry.mode);
        Serial.print(F(" -> "));
        Serial.print(entry.signal);
        Serial.print(F(" ("));
        Serial.print(entry.detail);
        Serial.println(F(")"));
    }

    Serial.println(F("------------------------------------------------------------"));
    Serial.print(F("  Anlauframpe : "));
    Serial.print(CFG.anlaufRampenZeitMs / 1000);
    Serial.println(F(" s"));
    Serial.print(F("  Bremsrampe  : "));
    Serial.print(CFG.bremsRampenZeitMs / 1000);
    Serial.println(F(" s"));
    Serial.print(F("  Sicherheit  : "));
    Serial.print(CFG.sicherheitsPauseMs / 1000);
    Serial.println(F(" s"));
    Serial.println(F("------------------------------------------------------------"));
    Serial.println(F("  ABLAUF: Richtung waehlen -> START -> laeuft -> STOPP/Richtung"));
    Serial.println(F("  Richtungswechsel im Betrieb: LINKS/RECHTS druecken"));
    Serial.println(F("  -> Bremsrampe -> Auto-Neustart in neuer Richtung"));
    Serial.println(F("============================================================"));
    Serial.println(F(""));
}

static ControllerState controller = makeInitialControllerState();

// ── LED MATRIX ANIMATION ─────────────────────────────────────────────────────
// Äußerer Ring, 36 Positionen, im Uhrzeigersinn (CW) startend oben-links
struct LedPos { uint8_t r; uint8_t c; };
static const LedPos RING[36] = {
    // Oben: links→rechts (Zeile 0)
    {0,0},{0,1},{0,2},{0,3},{0,4},{0,5},{0,6},{0,7},{0,8},{0,9},{0,10},{0,11},
    // Rechts: oben→unten (Spalte 11, Zeilen 1–7)
    {1,11},{2,11},{3,11},{4,11},{5,11},{6,11},{7,11},
    // Unten: rechts→links (Zeile 7, Spalten 10–0)
    {7,10},{7,9},{7,8},{7,7},{7,6},{7,5},{7,4},{7,3},{7,2},{7,1},{7,0},
    // Links: unten→oben (Spalte 0, Zeilen 6–1)
    {6,0},{5,0},{4,0},{3,0},{2,0},{1,0}
};

ArduinoLEDMatrix     ledMatrix;
static int           ledRingPos        = 0;     // Aktuelle Ring-Position 0–35
static unsigned long lastLedStep       = 0;     // Zeitstempel letzter Animations-Schritt

// Icon-Definitionen (innere LEDs, außerhalb des äußeren Rings)
// Pause: zwei vertikale Balken, 5 Zeilen hoch (Zeilen 2–6), wie ⏸
static const LedPos ICON_PAUSE[] = {
    {2,4},{3,4},{4,4},{5,4},{6,4},  // linker Balken  (Spalte 4)
    {2,5},{3,5},{4,5},{5,5},{6,5},  // linker Balken  (Spalte 5)
    {2,7},{3,7},{4,7},{5,7},{6,7},  // rechter Balken (Spalte 7)
    {2,8},{3,8},{4,8},{5,8},{6,8}   // rechter Balken (Spalte 8)
};
static const int ICON_PAUSE_N = 20;

// Dreiecke: 5 Zeilen hoch (Zeilen 2–6), Spitze horizontal links/rechts
static const LedPos ICON_PLAY_CW[] = {   // ▶  Spitze rechts (Rechtslauf)
    {2,5},
    {3,5},{3,6},
    {4,5},{4,6},{4,7},
    {5,5},{5,6},
    {6,5}
};
static const LedPos ICON_PLAY_CCW[] = {  // ◀  Spitze links (Linkslauf)
    {2,7},
    {3,6},{3,7},
    {4,5},{4,6},{4,7},
    {5,6},{5,7},
    {6,7}
};
static const int ICON_PLAY_N = 9;

// ── Hilfsfunktion: Relay-Zustand als Text ────────────────────────────────────
static void printRelayStates() {
    Serial.print(F("  [REL1/X1="));
    Serial.print(isStartRelayEnabled(CFG) ? F("ON") : F("OFF"));
    Serial.print(F(", REL2/X3="));
    Serial.print(isDirectionRelayCCW(CFG) ? F("CCW") : F("CW"));
    Serial.println(F("]"));
}

static const __FlashStringHelper* directionText(SpinDirection direction) {
    return isDirectionCCW(direction) ? F("LINKS (CCW)") : F("RECHTS (CW)");
}

// ── setup ────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);

    // Warten bis Serial Monitor bereit (max. 3 s, dann weiter)
    unsigned long t0 = millis();
    while (!Serial && (millis() - t0) < 3000) {}

    printBootBanner();

    initializeHardwareIo(CFG);

    ledMatrix.begin();

    Serial.println(F("[BOOT] Initialisierung abgeschlossen. Zustand: STANDBY"));
    Serial.println(F("[BOOT] Warte auf Eingaben..."));
    Serial.println(F(""));
}

// ── LED-Matrix Animation ─────────────────────────────────────────────────────
// Ring  : 4 LEDs umlaufend, Geschwindigkeit = aktueller Rampenfortschritt
// Innen : Icon zeigt Zielaktion (⏸/▶/◀) – blinkt während Rampe läuft, steht still wenn etabliert
void updateLedAnimation() {
    unsigned long now   = millis();
    byte          frame[8][12];
    memset(frame, 0, sizeof(frame));

    // ── Ring-LEDs ────────────────────────────────────────────────────────────
    int  dir      = +1;
    bool drawRing = true;
    switch (controller.id) {
        case ControllerStateId::STANDBY:
        case ControllerStateId::WAITING:
            drawRing = false;
            break;
        case ControllerStateId::ACCELERATING:
            dir = isDirectionCCW(controller.targetDirection) ? -1 : +1;
            break;
        case ControllerStateId::RUNNING_CW:
            dir = +1;
            break;
        case ControllerStateId::RUNNING_CCW:
            dir = -1;
            break;
        case ControllerStateId::DECELERATING:
            dir = isDirectionCCW(controller.runningDirection) ? -1 : +1;
            break;
        default:
            drawRing = false;
            break;
    }
    if (drawRing) {
        // stepMs aus Rampenfortschritt: 250 ms/Schritt (langsam) → 30 ms/Schritt (schnell)
        unsigned long stepMs = (unsigned long)(250.0f - 220.0f * getRampProgress(controller, now, CFG));
        if (now - lastLedStep >= stepMs) {
            ledRingPos  = (dir > 0) ? (ledRingPos + 1) % 36 : (ledRingPos + 35) % 36;
            lastLedStep = now;
        }
        const int idx[4] = {
            ledRingPos,           (ledRingPos +  1) % 36,
            (ledRingPos + 18) % 36, (ledRingPos + 19) % 36
        };
        for (int i = 0; i < 4; i++) {
            frame[ RING[idx[i]].r ][ RING[idx[i]].c ] = 1;
        }
    }

    // ── Inneres Icon ─────────────────────────────────────────────────────────
    // Zeigt Zielaktion: ⏸ Pause | ▶ CW | ◀ CCW
    // Blinkt (~1.25 Hz) wenn Rampe noch läuft, steht still wenn Zustand etabliert
    const LedPos* iconPts   = nullptr;
    int           iconCount = 0;
    bool          iconBlink = false;
    switch (controller.id) {
        case ControllerStateId::STANDBY:
            iconPts = ICON_PAUSE; iconCount = ICON_PAUSE_N; iconBlink = false; break;
        case ControllerStateId::ACCELERATING:
            iconPts   = isDirectionCCW(controller.targetDirection) ? ICON_PLAY_CCW : ICON_PLAY_CW;
            iconCount = ICON_PLAY_N; iconBlink = true; break;
        case ControllerStateId::RUNNING_CW:
            iconPts = ICON_PLAY_CW; iconCount = ICON_PLAY_N; iconBlink = false; break;
        case ControllerStateId::RUNNING_CCW:
            iconPts = ICON_PLAY_CCW; iconCount = ICON_PLAY_N; iconBlink = false; break;
        case ControllerStateId::DECELERATING:
        case ControllerStateId::WAITING:
            iconPts = hasAutoRestart(controller)
                      ? (isDirectionCCW(controller.targetDirection) ? ICON_PLAY_CCW : ICON_PLAY_CW)
                      : ICON_PAUSE;
            iconCount = hasAutoRestart(controller) ? ICON_PLAY_N : ICON_PAUSE_N;
            iconBlink = true; break;
        default: break;
    }
    if (iconPts != nullptr) {
        bool show = !iconBlink || ((now / 400) % 2 == 0);
        if (show) {
            for (int i = 0; i < iconCount; i++) {
                frame[ iconPts[i].r ][ iconPts[i].c ] = 1;
            }
        }
    }

    ledMatrix.renderBitmap(frame, 8, 12);
}

// ── loop ─────────────────────────────────────────────────────────────────────
void loop() {
    unsigned long currentMillis = millis();
    InputSnapshot inputs = readInputs(CFG);

    switch (controller.id) {

        case ControllerStateId::STANDBY:
            // Im Standby kann die Richtung jederzeit gewählt werden
            if (inputs.dirLeftPressed) {
                setTargetDirection(controller, SpinDirection::CCW);
                setDirectionRelay(CFG, true);
                Serial.println(F("[STANDBY] Richtung gewählt: LINKS (CCW)"));
                printRelayStates();
                delay(CFG.debounceDirectionMs);
            }
            else if (inputs.dirRightPressed) {
                setTargetDirection(controller, SpinDirection::CW);
                setDirectionRelay(CFG, false);
                Serial.println(F("[STANDBY] Richtung gewählt: RECHTS (CW)"));
                printRelayStates();
                delay(CFG.debounceDirectionMs);
            }

            if (inputs.startPressed) {
                setStartRelayEnabled(CFG, true);
                beginAcceleration(controller, currentMillis, 0.0f);
                Serial.print(F("[START] Anlauframpe → "));
                Serial.println(directionText(controller.targetDirection));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            break;

        case ControllerStateId::ACCELERATING: {
            // REL1 ist AN – Motor läuft hoch
            // Richtungswechsel während Anlauf erlaubt (Gegenrichtungs-Taste)
            bool dirChange =
                (!isDirectionCCW(controller.targetDirection) && inputs.dirLeftPressed) ||
                ( isDirectionCCW(controller.targetDirection) && inputs.dirRightPressed);

            if (inputs.stopPressed || dirChange) {
                float currentProgress = getRampProgress(controller, currentMillis, CFG);
                setStartRelayEnabled(CFG, false);
                if (dirChange) {
                    SpinDirection runningDirection = controller.targetDirection;
                    flipTargetDirection(controller);
                    beginDeceleration(
                        controller,
                        currentMillis,
                        currentProgress,
                        runningDirection,
                        RestartIntent::AUTO_RESTART);
                    Serial.print(F("[DIR] Richtungswechsel im Anlauf → "));
                    Serial.println(directionText(controller.targetDirection));
                    Serial.println(F("      Bremsrampe proportional, danach Auto-Neustart"));
                } else {
                    beginDeceleration(
                        controller,
                        currentMillis,
                        currentProgress,
                        controller.targetDirection,
                        RestartIntent::NONE);
                    Serial.print(F("[STOP] Anlauf abgebrochen bei "));
                    Serial.print((int)(currentProgress * 100.0f));
                    Serial.println(F("% – Bremsrampe proportional"));
                }
                printRelayStates();
                delay(CFG.debounceActionMs);
            } else {
                unsigned long effAccelDur = getEffectiveAccelerationDurationMs(controller, CFG);
                if (currentMillis - controller.stateTimerStartMs >= effAccelDur) {
                    completeAcceleration(controller);
                    Serial.print(F("[RUNNING] Anlauframpe abgeschlossen → "));
                    Serial.print(F("LAEUFT "));
                    Serial.println(directionText(controller.targetDirection));
                }
            }
            break;
        }

        case ControllerStateId::RUNNING_CW:
            // STOPP oder Richtungswechsel nach LINKS
            if (inputs.stopPressed) {
                setStartRelayEnabled(CFG, false);
                beginDeceleration(
                    controller,
                    currentMillis,
                    1.0f,
                    SpinDirection::CW,
                    RestartIntent::NONE);
                Serial.println(F("[STOP] Signal erhalten – Bremsrampe läuft"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            else if (inputs.dirLeftPressed) {
                setTargetDirection(controller, SpinDirection::CCW);
                setStartRelayEnabled(CFG, false);
                beginDeceleration(
                    controller,
                    currentMillis,
                    1.0f,
                    SpinDirection::CW,
                    RestartIntent::AUTO_RESTART);
                Serial.println(F("[DIR] Richtungswechsel → LINKS (CCW) angefordert"));
                Serial.println(F("      Bremsrampe läuft, danach Auto-Neustart"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            break;

        case ControllerStateId::RUNNING_CCW:
            // STOPP oder Richtungswechsel nach RECHTS
            if (inputs.stopPressed) {
                setStartRelayEnabled(CFG, false);
                beginDeceleration(
                    controller,
                    currentMillis,
                    1.0f,
                    SpinDirection::CCW,
                    RestartIntent::NONE);
                Serial.println(F("[STOP] Signal erhalten – Bremsrampe läuft"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            else if (inputs.dirRightPressed) {
                setTargetDirection(controller, SpinDirection::CW);
                setStartRelayEnabled(CFG, false);
                beginDeceleration(
                    controller,
                    currentMillis,
                    1.0f,
                    SpinDirection::CCW,
                    RestartIntent::AUTO_RESTART);
                Serial.println(F("[DIR] Richtungswechsel → RECHTS (CW) angefordert"));
                Serial.println(F("      Bremsrampe läuft, danach Auto-Neustart"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            break;

        case ControllerStateId::DECELERATING: {
            // Proportionale Bremsdauer + optional Umkehrung per START-Taste
            unsigned long effDecelDur = getEffectiveDecelerationDurationMs(controller, CFG);
            if (!hasAutoRestart(controller) && inputs.startPressed) {
                // Bremsung umkehren: Anlauf vom aktuellen Rampen-Punkt
                float currentProgress = getRampProgress(controller, currentMillis, CFG);
                setStartRelayEnabled(CFG, true);
                beginAcceleration(controller, currentMillis, currentProgress);
                Serial.print(F("[RE-START] Bremsung umgekehrt bei "));
                Serial.print((int)(currentProgress * 100.0f));
                Serial.println(F("% → Anlauframpe"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            } else if (currentMillis - controller.stateTimerStartMs >= effDecelDur) {
                beginWaiting(controller, currentMillis);
                Serial.print(F("[WARTEN] Bremsrampe abgelaufen ("));
                Serial.print(effDecelDur / 1000);
                Serial.print(F(" s). "));
                Serial.println(hasAutoRestart(controller) ? F("Auto-Neustart folgt...") : F("Sicherheitspause läuft..."));
            }
            break;
        }

        case ControllerStateId::WAITING:
            if (currentMillis - controller.stateTimerStartMs >= CFG.sicherheitsPauseMs) {
                if (hasAutoRestart(controller)) {
                    // Richtungsrelais auf neuen Wert setzen, kurz warten, dann starten
                    setDirectionRelay(CFG, isDirectionCCW(controller.targetDirection));
                    delay(CFG.relaySettleMs); // Relais-Einschwingzeit
                    setStartRelayEnabled(CFG, true);
                    beginAcceleration(controller, millis(), 0.0f);
                    consumeAutoRestart(controller);
                    Serial.print(F("[AUTO-START] Richtung gesetzt → Anlauframpe → "));
                    Serial.println(directionText(controller.targetDirection));
                    printRelayStates();
                } else {
                    completeWaitingToStandby(controller);
                    Serial.print(F("[STANDBY] Bereit. Gesamtwartezeit: "));
                    Serial.print((CFG.bremsRampenZeitMs + CFG.sicherheitsPauseMs) / 1000);
                    Serial.println(F(" s abgelaufen."));
                    Serial.println(F(""));
                }
            }
            break;
    }

    // ── Gelbe Tasten (Presets – noch nicht belegt) ───────────────────────────
    if (controller.id == ControllerStateId::STANDBY) {
        if (inputs.preset1Pressed) {
            Serial.println(F("[PRESET 1] Gelb-1 gedrückt (noch nicht belegt)"));
            delay(CFG.debounceActionMs);
        }
        if (inputs.preset2Pressed) {
            Serial.println(F("[PRESET 2] Gelb-2 gedrückt (noch nicht belegt)"));
            delay(CFG.debounceActionMs);
        }
    }

    updateLedAnimation();
}
