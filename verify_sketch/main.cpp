// verify_sketch/main.cpp
// Board verification sketch for Arduino Uno R4 WiFi.
// Checks: USB Serial CDC, LED blink, serial echo, WiFi chip presence.
// Flash with: pio run -e r4wifi_verify --target upload
// Monitor with: pio device monitor -e r4wifi_verify

#include <Arduino.h>
#include <WiFiS3.h>

// ── LED blink state ──────────────────────────────────────────────────────────
static unsigned long lastBlink  = 0;
static unsigned long lastStatus = 0;
static bool          ledState   = false;
static uint32_t      echoCount  = 0;

// ── Simple free-RAM estimate via stack pointer ───────────────────────────────
static int freeRam() {
    volatile char stackTop;
    // RA4M1 SRAM ends at 0x20008000 (32 KB from 0x20000000)
    return (int)((uintptr_t)0x20008000 - (uintptr_t)&stackTop);
}

// ── setup ────────────────────────────────────────────────────────────────────
void setup() {
    pinMode(LED_BUILTIN, OUTPUT);
    digitalWrite(LED_BUILTIN, HIGH);   // LED ON during init

    Serial.begin(115200);

    // Wait up to 3 s for a Serial Monitor connection, then continue anyway.
    unsigned long t0 = millis();
    while (!Serial && (millis() - t0) < 3000) {}

    Serial.println();
    Serial.println("========================================");
    Serial.println(" honey_please – Board Verification v1.0");
    Serial.println(" Target: Arduino Uno R4 WiFi (RA4M1)");
    Serial.println("========================================");

    // Probe WiFi co-processor
    Serial.print("[WIFI] Probing ESP32-S3 co-processor... ");
    int wifiStatus = WiFi.status();
    if (wifiStatus == WL_NO_MODULE) {
        Serial.println("NOT FOUND  ← co-processor fault or firmware missing");
    } else {
        Serial.println("OK");
        Serial.print("[WIFI] Firmware version: ");
        Serial.println(WiFi.firmwareVersion());
    }

    // RAM check
    Serial.print("[RAM]  Free SRAM estimate: ");
    Serial.print(freeRam());
    Serial.println(" bytes");

    Serial.println("[READY] Blinking LED every 500 ms.");
    Serial.println("[READY] Type anything → echoed back.");
    Serial.println("[READY] Type 'info' → print status.");
    Serial.println();

    digitalWrite(LED_BUILTIN, LOW);
}

// ── loop ─────────────────────────────────────────────────────────────────────
void loop() {
    unsigned long now = millis();

    // Blink LED every 500 ms
    if (now - lastBlink >= 500) {
        lastBlink = now;
        ledState  = !ledState;
        digitalWrite(LED_BUILTIN, ledState ? HIGH : LOW);
    }

    // Periodic status every 10 s
    if (now - lastStatus >= 10000) {
        lastStatus = now;
        Serial.print("[HB] uptime=");
        Serial.print(now / 1000);
        Serial.print("s  freeRAM=");
        Serial.print(freeRam());
        Serial.print("B  echos=");
        Serial.println(echoCount);
    }

    // Serial echo
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) return;

        if (line.equalsIgnoreCase("info")) {
            Serial.println("---- INFO ----");
            Serial.print("  Uptime : "); Serial.print(millis() / 1000); Serial.println(" s");
            Serial.print("  FreeRAM: "); Serial.print(freeRam()); Serial.println(" B");
            Serial.print("  Echos  : "); Serial.println(echoCount);
            int ws = WiFi.status();
            Serial.print("  WiFi   : "); Serial.println(ws == WL_NO_MODULE ? "NO MODULE" : "present");
            Serial.println("--------------");
        } else {
            echoCount++;
            Serial.print("[ECHO #"); Serial.print(echoCount); Serial.print("] ");
            Serial.println(line);
        }
    }
}
