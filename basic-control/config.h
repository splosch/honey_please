/**
 * @file basic-control/config.h
 * @brief Shared configuration for wiring verification sketch.
 *
 * Centralizes pin mapping, timing constants and relay polarity so the
 * runtime logic and boot banner always use the same source of truth.
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
 * Pin/Wiring-Schema (muss mit Verdrahtungsplan übereinstimmen):
 *  D2   OUTPUT -> Relais 1 IN  (X1 am Treiber - START/STOPP)
 *  D3   OUTPUT -> Relais 2 IN  (X3 am Treiber - Richtung CW/CCW)
 *  D4   OUTPUT -> Relais 3 IN  unused
 *  D5   OUTPUT -> Relais 4 IN  unused
 *  D6   INPUT  <- Folientaster 1: Taste LINKS (CCW)   [aktiv LOW, Pullup]
 *  D7   INPUT  <- Folientaster 1: Taste RECHTS (CW)   [aktiv LOW, Pullup]
 *  D8   INPUT  <- Folientaster 2: Taste ROT (Stopp)   [aktiv LOW, Pullup]
 *  D9   INPUT  <- Folientaster 2: Taste GELB 1 (Preset 1)
 *  D10  INPUT  <- Folientaster 2: Taste GELB 2 (Preset 2)
 *  D11  INPUT  <- Folientaster 2: Taste GRUEN (Start) [aktiv LOW, Pullup]
 *
 * Relay-Modul-Hinweis:
 * - Standardfall: HIGH = Relais zieht an (aktiv-HIGH)
 * - Falls aktiv-LOW Modul verwendet wird, relayActiveHigh auf false setzen.
 */

#pragma once

#include <Arduino.h>

struct BasicControlConfig {
    // Relay outputs
    uint8_t pinRelayStart;
    uint8_t pinRelayDir;
    uint8_t pinRelayUnused3;
    uint8_t pinRelayUnused4;

    // Membrane keypad inputs (all INPUT_PULLUP, active LOW)
    uint8_t pinKeyLinks;
    uint8_t pinKeyRechts;
    uint8_t pinKeyStop;
    uint8_t pinKeyYel1;
    uint8_t pinKeyYel2;
    uint8_t pinKeyStart;

    // Ramp and safety timings
    unsigned long anlaufRampenZeitMs;
    unsigned long bremsRampenZeitMs;
    unsigned long sicherheitsPauseMs;

    // Debounce and relay stabilization timings
    unsigned long debounceDirectionMs;
    unsigned long debounceActionMs;
    unsigned long relaySettleMs;

    // Relay logic configuration
    bool relayActiveHigh;
    bool dirRelayHighMeansCCW;
};

struct WiringEntry {
    const char* signal;
    uint8_t pin;
    const char* mode;
    const char* detail;
};

static constexpr BasicControlConfig BASIC_CONTROL_CONFIG = {
    2,   // pinRelayStart
    3,   // pinRelayDir
    4,   // pinRelayUnused3
    5,   // pinRelayUnused4
    6,   // pinKeyLinks
    7,   // pinKeyRechts
    8,   // pinKeyStop
    9,   // pinKeyYel1
    10,  // pinKeyYel2
    11,  // pinKeyStart

    15000UL,  // anlaufRampenZeitMs
    15000UL,  // bremsRampenZeitMs
    150UL,   // sicherheitsPauseMs

    150UL,    // debounceDirectionMs
    200UL,    // debounceActionMs
    100UL,    // relaySettleMs

    true,     // relayActiveHigh: HIGH energizes relay
    true      // dirRelayHighMeansCCW: HIGH on dir relay means CCW
};

// Human-readable wiring table for boot banner and quick cross-check.
static constexpr WiringEntry BASIC_CONTROL_WIRING[] = {
    {"Relais 1 IN (X1) START/STOP", BASIC_CONTROL_CONFIG.pinRelayStart, "OUT", "Treiber start/stop"},
    {"Relais 2 IN (X3) Richtung", BASIC_CONTROL_CONFIG.pinRelayDir, "OUT", "CW/CCW"},
    {"Relais 3 IN", BASIC_CONTROL_CONFIG.pinRelayUnused3, "OUT", "unused"},
    {"Relais 4 IN", BASIC_CONTROL_CONFIG.pinRelayUnused4, "OUT", "unused"},
    {"Taste LINKS", BASIC_CONTROL_CONFIG.pinKeyLinks, "IN", "CCW, aktiv LOW"},
    {"Taste RECHTS", BASIC_CONTROL_CONFIG.pinKeyRechts, "IN", "CW, aktiv LOW"},
    {"Taste ROT", BASIC_CONTROL_CONFIG.pinKeyStop, "IN", "STOP, aktiv LOW"},
    {"Taste GELB 1", BASIC_CONTROL_CONFIG.pinKeyYel1, "IN", "Preset 1"},
    {"Taste GELB 2", BASIC_CONTROL_CONFIG.pinKeyYel2, "IN", "Preset 2"},
    {"Taste GRUEN", BASIC_CONTROL_CONFIG.pinKeyStart, "IN", "START, aktiv LOW"}
};

static constexpr size_t BASIC_CONTROL_WIRING_COUNT =
    sizeof(BASIC_CONTROL_WIRING) / sizeof(BASIC_CONTROL_WIRING[0]);
