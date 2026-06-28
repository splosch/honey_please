/**
 * @file basic-control/main.cpp
 * @brief Honigschleuder – Basic-Control / Wiring-Verification Sketch
 *
 * Quelle: docs/base_honey_extractor_controller.ino (erstellt mit Google Gemini)
 * Zweck : Verdrahtungscheck OHNE angeschlossenen Motor-Treiber.
 *         Relais klicken, Serial-Monitor zeigt alle Zustandsübergänge.
 *
 * Referenz-Verdrahtungsplan : docs/ErsteInbetriebnahmeMotorundSteuerung.html
 * PlatformIO-Umgebung       : r4wifi_basic_control
 * Flash-Befehl              : npm run basic-control:build  (Compile-Check)
 *                             npm run basic-control:flash  (Upload via auto-detected USB port)
 *
 * ─── Pin-Belegung (muss mit HTML-Verdrahtungsplan übereinstimmen) ───────────
 * Hinweis: Diese komplette Zuordnung ist zusaetzlich in basic-control/config.h
 * als modul-lokale Dokumentation hinterlegt und muss bei Aenderungen dort
 * mit gepflegt werden (Single Source of Truth fuer extrahierte Konfiguration).
 *  D2  OUTPUT  → Relais 1 IN  (X1 am Treiber – START/STOPP)
 *  D3  OUTPUT  → Relais 2 IN  (X3 am Treiber – Richtung CW/CCW)
 *  D4  OUTPUT  → Relais 3 IN  unused
 *  D5  OUTPUT  → Relais 4 IN  unused
 *                Folientaster 1: GND (1)
 *  D6  INPUT   ← Folientaster 1: Taste LINKS (3)  (CCW)   [aktiv LOW, Pullup]
 *  D7  INPUT   ← Folientaster 1: Taste RECHTS (2) (CW)    [aktiv LOW, Pullup]
 *                Folientaster 2: GND (1)
 *  D8  INPUT   ← Folientaster 2: Taste ROT (5)   (Stopp) [aktiv LOW, Pullup]
 *  D9  INPUT   ← Folientaster 2: Taste GELB 1 (4) (Preset 1)
 *  D10  INPUT   ← Folientaster 2: Taste GELB 2 (3) (Preset 2)
 *  D11  INPUT   ← Folientaster 2: Taste GRÜN (2)  (Start)  [aktiv LOW, Pullup]
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️  Relay-Modul-Hinweis:
 *     Dieser Sketch verwendet HIGH = Relais zieht an (aktiv-HIGH).
 *     Gilt für die meisten Standard-5V-Relaismodule mit Optokoppler (z.B. SRD-05VDC-SL-C).
 *     Falls dein Modul aktiv-LOW ist (Relais zieht bei LOW an), setze in
 *     basic-control/config.h den Wert relayActiveHigh auf false.
 */

#include <Arduino.h>
#include "Arduino_LED_Matrix.h"
#include "config.h"

// ── ZENTRALE KONFIGURATION ───────────────────────────────────────────────────
static constexpr BasicControlConfig CFG = BASIC_CONTROL_CONFIG;

static constexpr uint8_t relayOnLevel() {
    return CFG.relayActiveHigh ? HIGH : LOW;
}

static constexpr uint8_t relayOffLevel() {
    return CFG.relayActiveHigh ? LOW : HIGH;
}

static constexpr uint8_t relayDirLevelFor(bool ccw) {
    bool highLevel = (ccw == CFG.dirRelayHighMeansCCW);
    return highLevel ? HIGH : LOW;
}

enum ButtonId {
    BUTTON_DIR_LEFT,
    BUTTON_DIR_RIGHT,
    BUTTON_STOP,
    BUTTON_PRESET_1,
    BUTTON_PRESET_2,
    BUTTON_START
};

struct InputSnapshot {
    bool dirLeftPressed;
    bool dirRightPressed;
    bool stopPressed;
    bool preset1Pressed;
    bool preset2Pressed;
    bool startPressed;
};

static bool isButtonPressedOnPin(uint8_t pin) {
    return digitalRead(pin) == LOW;
}

static uint8_t pinForButton(ButtonId button) {
    switch (button) {
        case BUTTON_DIR_LEFT:  return CFG.pinKeyLinks;
        case BUTTON_DIR_RIGHT: return CFG.pinKeyRechts;
        case BUTTON_STOP:      return CFG.pinKeyStop;
        case BUTTON_PRESET_1:  return CFG.pinKeyYel1;
        case BUTTON_PRESET_2:  return CFG.pinKeyYel2;
        case BUTTON_START:     return CFG.pinKeyStart;
        default:               return CFG.pinKeyStart;
    }
}

static bool isButtonPressed(ButtonId button) {
    return isButtonPressedOnPin(pinForButton(button));
}

static InputSnapshot readInputs() {
    InputSnapshot snapshot;
    snapshot.dirLeftPressed = isButtonPressed(BUTTON_DIR_LEFT);
    snapshot.dirRightPressed = isButtonPressed(BUTTON_DIR_RIGHT);
    snapshot.stopPressed = isButtonPressed(BUTTON_STOP);
    snapshot.preset1Pressed = isButtonPressed(BUTTON_PRESET_1);
    snapshot.preset2Pressed = isButtonPressed(BUTTON_PRESET_2);
    snapshot.startPressed = isButtonPressed(BUTTON_START);
    return snapshot;
}

static void setStartRelayEnabled(bool enabled) {
    digitalWrite(CFG.pinRelayStart, enabled ? relayOnLevel() : relayOffLevel());
}

static void setDirectionRelay(bool ccw) {
    digitalWrite(CFG.pinRelayDir, relayDirLevelFor(ccw));
}

static bool isStartRelayEnabled() {
    return digitalRead(CFG.pinRelayStart) == relayOnLevel();
}

static bool isDirectionRelayCCW() {
    return digitalRead(CFG.pinRelayDir) == relayDirLevelFor(true);
}

static void initializeHardwareIo() {
    pinMode(CFG.pinRelayStart, OUTPUT);
    pinMode(CFG.pinRelayDir, OUTPUT);
    pinMode(CFG.pinRelayUnused3, OUTPUT);
    pinMode(CFG.pinRelayUnused4, OUTPUT);

    // Safe startup state for all relay outputs.
    setStartRelayEnabled(false);
    setDirectionRelay(false);
    digitalWrite(CFG.pinRelayUnused3, relayOffLevel());
    digitalWrite(CFG.pinRelayUnused4, relayOffLevel());

    pinMode(CFG.pinKeyLinks, INPUT_PULLUP);
    pinMode(CFG.pinKeyRechts, INPUT_PULLUP);
    pinMode(CFG.pinKeyStop, INPUT_PULLUP);
    pinMode(CFG.pinKeyYel1, INPUT_PULLUP);
    pinMode(CFG.pinKeyYel2, INPUT_PULLUP);
    pinMode(CFG.pinKeyStart, INPUT_PULLUP);
}

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

// ── SYSTEM ZUSTÄNDE (STATE MACHINE) ─────────────────────────────────────────
enum SystemState {
    STATE_STANDBY,       // Schleuder steht, wartet auf Start
    STATE_ACCELERATING,  // Motor läuft an (Anlauframpe, Richtungswechsel erlaubt)
    STATE_RUNNING_CW,    // Dreht nach Rechts (CW)  – Richtungswechsel erlaubt
    STATE_RUNNING_CCW,   // Dreht nach Links (CCW) – Richtungswechsel erlaubt
    STATE_DECELERATING,  // Motor bremst ab, alle Eingaben gesperrt
    STATE_WAITING        // Motor steht still, Sicherheitszeit läuft ab
};

SystemState   currentState        = STATE_STANDBY;
bool          targetDirectionCCW  = false;  // false = CW (Rechts), true = CCW (Links)
bool          pendingAutoRestart  = false;  // true = Richtungswechsel, danach Auto-Neustart
unsigned long stateTimerStart     = 0;

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
static bool          runningDirCCW     = false; // Drehrichtung beim Eintritt in DECELERATING
static float         rampStartProgress = 0.0f;  // Rampenfortschritt beim Eintritt in Rampenzustand

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
    Serial.print(isStartRelayEnabled() ? F("ON") : F("OFF"));
    Serial.print(F(", REL2/X3="));
    Serial.print(isDirectionRelayCCW() ? F("CCW") : F("CW"));
    Serial.println(F("]"));
}

// ── setup ────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);

    // Warten bis Serial Monitor bereit (max. 3 s, dann weiter)
    unsigned long t0 = millis();
    while (!Serial && (millis() - t0) < 3000) {}

    printBootBanner();

    initializeHardwareIo();

    ledMatrix.begin();

    Serial.println(F("[BOOT] Initialisierung abgeschlossen. Zustand: STANDBY"));
    Serial.println(F("[BOOT] Warte auf Eingaben..."));
    Serial.println(F(""));
}

// ── Rampenfortschritt berechnen (0.0=steht, 1.0=Vollgeschwindigkeit) ─────────
// Berücksichtigt den gespeicherten Einstiegspunkt (rampStartProgress) für
// proportionale Zeiten beim Umkehren einer laufenden Rampe.
float getCurrentRampProgress() {
    float elapsed = (float)(millis() - stateTimerStart);
    switch (currentState) {
        case STATE_ACCELERATING: {
            float effDur = max(100.0f, (1.0f - rampStartProgress) * (float)CFG.anlaufRampenZeitMs);
            return rampStartProgress + min(1.0f, elapsed / effDur) * (1.0f - rampStartProgress);
        }
        case STATE_RUNNING_CW:
        case STATE_RUNNING_CCW:
            return 1.0f;
        case STATE_DECELERATING: {
            float effDur = max(100.0f, rampStartProgress * (float)CFG.bremsRampenZeitMs);
            return rampStartProgress * (1.0f - min(1.0f, elapsed / effDur));
        }
        default:
            return 0.0f;
    }
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
    switch (currentState) {
        case STATE_STANDBY:
        case STATE_WAITING:      drawRing = false;                             break;
        case STATE_ACCELERATING: dir = targetDirectionCCW ? -1 : +1;
                                 runningDirCCW = targetDirectionCCW;           break;
        case STATE_RUNNING_CW:   dir = +1; runningDirCCW = false;             break;
        case STATE_RUNNING_CCW:  dir = -1; runningDirCCW = true;              break;
        case STATE_DECELERATING: dir = runningDirCCW ? -1 : +1;              break;
        default:                 drawRing = false;                             break;
    }
    if (drawRing) {
        // stepMs aus Rampenfortschritt: 250 ms/Schritt (langsam) → 30 ms/Schritt (schnell)
        unsigned long stepMs = (unsigned long)(250.0f - 220.0f * getCurrentRampProgress());
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
    switch (currentState) {
        case STATE_STANDBY:
            iconPts = ICON_PAUSE; iconCount = ICON_PAUSE_N; iconBlink = false; break;
        case STATE_ACCELERATING:
            iconPts   = targetDirectionCCW ? ICON_PLAY_CCW : ICON_PLAY_CW;
            iconCount = ICON_PLAY_N; iconBlink = true; break;
        case STATE_RUNNING_CW:
            iconPts = ICON_PLAY_CW; iconCount = ICON_PLAY_N; iconBlink = false; break;
        case STATE_RUNNING_CCW:
            iconPts = ICON_PLAY_CCW; iconCount = ICON_PLAY_N; iconBlink = false; break;
        case STATE_DECELERATING:
        case STATE_WAITING:
            iconPts = pendingAutoRestart
                      ? (targetDirectionCCW ? ICON_PLAY_CCW : ICON_PLAY_CW)
                      : ICON_PAUSE;
            iconCount = pendingAutoRestart ? ICON_PLAY_N : ICON_PAUSE_N;
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
    InputSnapshot inputs = readInputs();

    switch (currentState) {

        case STATE_STANDBY:
            // Im Standby kann die Richtung jederzeit gewählt werden
            if (inputs.dirLeftPressed) {
                targetDirectionCCW = true;
                setDirectionRelay(true);
                Serial.println(F("[STANDBY] Richtung gewählt: LINKS (CCW)"));
                printRelayStates();
                delay(CFG.debounceDirectionMs);
            }
            else if (inputs.dirRightPressed) {
                targetDirectionCCW = false;
                setDirectionRelay(false);
                Serial.println(F("[STANDBY] Richtung gewählt: RECHTS (CW)"));
                printRelayStates();
                delay(CFG.debounceDirectionMs);
            }

            if (inputs.startPressed) {
                rampStartProgress   = 0.0f; // vollständiger Anlauf vom Stillstand
                setStartRelayEnabled(true);
                stateTimerStart     = currentMillis;
                pendingAutoRestart  = false;
                currentState        = STATE_ACCELERATING;
                Serial.print(F("[START] Anlauframpe → "));
                Serial.println(targetDirectionCCW ? F("LINKS (CCW)") : F("RECHTS (CW)"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            break;

        case STATE_ACCELERATING: {
            // REL1 ist AN – Motor läuft hoch
            // Richtungswechsel während Anlauf erlaubt (Gegenrichtungs-Taste)
            bool dirChange =
                (!targetDirectionCCW && inputs.dirLeftPressed) ||
                ( targetDirectionCCW && inputs.dirRightPressed);

            if (inputs.stopPressed || dirChange) {
                rampStartProgress = getCurrentRampProgress();
                setStartRelayEnabled(false);
                stateTimerStart   = currentMillis;
                if (dirChange) {
                    targetDirectionCCW = !targetDirectionCCW;
                    pendingAutoRestart = true;
                    Serial.print(F("[DIR] Richtungswechsel im Anlauf → "));
                    Serial.println(targetDirectionCCW ? F("LINKS (CCW)") : F("RECHTS (CW)"));
                    Serial.println(F("      Bremsrampe proportional, danach Auto-Neustart"));
                } else {
                    pendingAutoRestart = false;
                    Serial.print(F("[STOP] Anlauf abgebrochen bei "));
                    Serial.print((int)(rampStartProgress * 100.0f));
                    Serial.println(F("% – Bremsrampe proportional"));
                }
                currentState = STATE_DECELERATING;
                printRelayStates();
                delay(CFG.debounceActionMs);
            } else {
                unsigned long effAccelDur = (unsigned long)max(100.0f,
                    (1.0f - rampStartProgress) * (float)CFG.anlaufRampenZeitMs);
                if (currentMillis - stateTimerStart >= effAccelDur) {
                    currentState = targetDirectionCCW ? STATE_RUNNING_CCW : STATE_RUNNING_CW;
                    Serial.print(F("[RUNNING] Anlauframpe abgeschlossen → "));
                    Serial.println(targetDirectionCCW ? F("LÄUFT LINKS (CCW)") : F("LÄUFT RECHTS (CW)"));
                }
            }
            break;
        }

        case STATE_RUNNING_CW:
            // STOPP oder Richtungswechsel nach LINKS
            if (inputs.stopPressed) {
                rampStartProgress  = 1.0f; // Vollgas → volle Bremsrampe
                setStartRelayEnabled(false);
                stateTimerStart    = currentMillis;
                pendingAutoRestart = false;
                currentState       = STATE_DECELERATING;
                Serial.println(F("[STOP] Signal erhalten – Bremsrampe läuft"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            else if (inputs.dirLeftPressed) {
                rampStartProgress  = 1.0f;
                targetDirectionCCW = true;
                setStartRelayEnabled(false);
                stateTimerStart    = currentMillis;
                pendingAutoRestart = true;
                currentState       = STATE_DECELERATING;
                Serial.println(F("[DIR] Richtungswechsel → LINKS (CCW) angefordert"));
                Serial.println(F("      Bremsrampe läuft, danach Auto-Neustart"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            break;

        case STATE_RUNNING_CCW:
            // STOPP oder Richtungswechsel nach RECHTS
            if (inputs.stopPressed) {
                rampStartProgress  = 1.0f; // Vollgas → volle Bremsrampe
                setStartRelayEnabled(false);
                stateTimerStart    = currentMillis;
                pendingAutoRestart = false;
                currentState       = STATE_DECELERATING;
                Serial.println(F("[STOP] Signal erhalten – Bremsrampe läuft"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            else if (inputs.dirRightPressed) {
                rampStartProgress  = 1.0f;
                targetDirectionCCW = false;
                setStartRelayEnabled(false);
                stateTimerStart    = currentMillis;
                pendingAutoRestart = true;
                currentState       = STATE_DECELERATING;
                Serial.println(F("[DIR] Richtungswechsel → RECHTS (CW) angefordert"));
                Serial.println(F("      Bremsrampe läuft, danach Auto-Neustart"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            }
            break;

        case STATE_DECELERATING: {
            // Proportionale Bremsdauer + optional Umkehrung per START-Taste
            unsigned long effDecelDur = (unsigned long)max(100.0f,
                rampStartProgress * (float)CFG.bremsRampenZeitMs);
            if (!pendingAutoRestart && inputs.startPressed) {
                // Bremsung umkehren: Anlauf vom aktuellen Rampen-Punkt
                rampStartProgress = getCurrentRampProgress();
                setStartRelayEnabled(true);
                stateTimerStart   = currentMillis;
                currentState      = STATE_ACCELERATING;
                Serial.print(F("[RE-START] Bremsung umgekehrt bei "));
                Serial.print((int)(rampStartProgress * 100.0f));
                Serial.println(F("% → Anlauframpe"));
                printRelayStates();
                delay(CFG.debounceActionMs);
            } else if (currentMillis - stateTimerStart >= effDecelDur) {
                stateTimerStart = currentMillis;
                currentState    = STATE_WAITING;
                Serial.print(F("[WARTEN] Bremsrampe abgelaufen ("));
                Serial.print(effDecelDur / 1000);
                Serial.print(F(" s). "));
                Serial.println(pendingAutoRestart ? F("Auto-Neustart folgt...") : F("Sicherheitspause läuft..."));
            }
            break;
        }

        case STATE_WAITING:
            if (currentMillis - stateTimerStart >= CFG.sicherheitsPauseMs) {
                if (pendingAutoRestart) {
                    // Richtungsrelais auf neuen Wert setzen, kurz warten, dann starten
                    setDirectionRelay(targetDirectionCCW);
                    delay(CFG.relaySettleMs); // Relais-Einschwingzeit
                    setStartRelayEnabled(true);
                    rampStartProgress  = 0.0f; // Motor vollständig gestoppt → voller Anlauf
                    stateTimerStart    = millis();
                    pendingAutoRestart = false;
                    currentState       = STATE_ACCELERATING;
                    Serial.print(F("[AUTO-START] Richtung gesetzt → Anlauframpe → "));
                    Serial.println(targetDirectionCCW ? F("LINKS (CCW)") : F("RECHTS (CW)"));
                    printRelayStates();
                } else {
                    currentState = STATE_STANDBY;
                    Serial.print(F("[STANDBY] Bereit. Gesamtwartezeit: "));
                    Serial.print((CFG.bremsRampenZeitMs + CFG.sicherheitsPauseMs) / 1000);
                    Serial.println(F(" s abgelaufen."));
                    Serial.println(F(""));
                }
            }
            break;
    }

    // ── Gelbe Tasten (Presets – noch nicht belegt) ───────────────────────────
    if (currentState == STATE_STANDBY) {
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
