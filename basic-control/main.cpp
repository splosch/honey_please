/**
 * @file basic-control/main.cpp
 * @brief Honigschleuder – Basic-Control
 *
 * Referenz-Verdrahtungsplan : docs/InteractiveDocumentation.html
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
#include "controller_logic.h"
#include "controller_state.h"
#include "hardware_io.h"
#include "led_animation.h"
#include "speed_dataset.h"

// ── ZENTRALE KONFIGURATION ───────────────────────────────────────────────────
static constexpr BasicControlConfig CFG = BASIC_CONTROL_CONFIG;

static void printBootBanner() {
    Serial.println(F(""));
    Serial.println(F("============================================================"));
    Serial.println(F("  honey_please - BASIC-CONTROL / Wiring Verification Sketch"));
    Serial.println(F("  Referenz: InteractiveDocumentation.html"));
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
    const BinarySpeedDataset datasets[] = {
        BinarySpeedDataset::DATASET_0,
        BinarySpeedDataset::DATASET_2,
        BinarySpeedDataset::DATASET_4,
        BinarySpeedDataset::DATASET_6
    };

    Serial.println(F("  dAtA-Profile (Ziel/Ac/dc):"));
    for (size_t i = 0; i < sizeof(datasets) / sizeof(datasets[0]); ++i) {
        const BinarySpeedDynamicsProfile& p = dynamicsProfileForDataset(datasets[i]);
        Serial.print(F("    "));
        Serial.print(datasetText(p.dataset));
        Serial.print(F(": "));
        Serial.print(p.targetRpm);
        Serial.print(F(" rpm, Ac="));
        Serial.print(p.accelerationMs);
        Serial.print(F(" ms, dc="));
        Serial.print(p.decelerationMs);
        Serial.println(F(" ms"));
    }
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

static ControllerState    controller = makeInitialControllerState();
static LedAnimationState  ledAnim    = makeInitialLedAnimationState();

// ── LED MATRIX ───────────────────────────────────────────────────────────────
// Geometry, icons, and animation logic live in led_animation.h / led_animation.cpp
ArduinoLEDMatrix ledMatrix;

// ── setup ────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);

    // Warten bis Serial Monitor bereit (max. 3 s, dann weiter)
    unsigned long t0 = millis();
    while (!Serial && (millis() - t0) < 3000) {}

    printBootBanner();

    initializeHardwareIo(CFG);

    ledMatrix.begin();
    // Draw the initial standby frame immediately so the matrix shows something at boot.
    // renderBitmap must be called here (main.cpp) to avoid the duplicate-static
    // `framebuffer` ODR issue in Arduino_LED_Matrix.h.
    updateLedAnimationFrame(ledAnim, controller, millis(), CFG);
    ledMatrix.renderBitmap(ledAnim.frame, 8, 12);

    Serial.println(F("[BOOT] Initialisierung abgeschlossen. Zustand: STANDBY"));
    Serial.println(F("[BOOT] Warte auf Eingaben..."));
    Serial.println(F(""));
}

// ── loop ─────────────────────────────────────────────────────────────────────
void loop() {
    unsigned long currentMillis = millis();
    InputSnapshot inputs = readInputs(CFG);

    tickController(controller, inputs, currentMillis, CFG);

    updateLedAnimationFrame(ledAnim, controller, millis(), CFG);
    ledMatrix.renderBitmap(ledAnim.frame, 8, 12);
}
