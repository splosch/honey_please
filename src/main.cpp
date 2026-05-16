// src/main.cpp
// honey_please – Arduino Uno R4 WiFi Motor Control
// Firmware v1.5.0 | Phase 4 + R4 migration (M6.2, M6.3, M6.11)
//
// Architecture:
//   SimMotorDriver + SimRpmSource active (simulation mode, no GPIO until Phase 5).
//   WiFiServer on port 80 – WebSocket /ws (10 Hz JSON) + GET /status.
//   Web UI served from developer PC (VS Code Live Server), NOT from board.
//   ProgramRunner: EEPROM-stored 6-step CW/CCW extraction program (F09).
//   SessionLogger: in-memory ring buffer, 50 entries max (F10).
//   Single-threaded loop() – no FreeRTOS, no mutexes.
//
// USB Serial commands: type 'help' in Serial Monitor
//
// R4 migration notes:
//   WiFi.h    → WiFiS3.h  (bundled with renesas-ra framework)
//   No ESPmDNS, AsyncTCP, ESPAsyncWebServer, WebSerial, LittleFS, FreeRTOS
//   No g_mutex – everything is single-threaded on RA4M1
//   LED_BUILTIN = GPIO 13, active-HIGH (RA4M1 dev board)
//   ArduinoOTA uses WiFiS3 stack – no espota, no UDP workaround needed
#include <Arduino.h>
#include <WiFiS3.h>
#include "secrets.h"
#include "log.h"
#include "params.h"
#include "motor_driver.h"
#include "rpm_source.h"
#include "ramp_controller.h"
#include "sim_rpm_source.h"
#include "web_api.h"
#include "program.h"
#include "session.h"

// ─── Firmware version ────────────────────────────────────────────────────────
#define FIRMWARE_VERSION "1.5.0"
const char* FIRMWARE_VERSION_STR = FIRMWARE_VERSION;

// ─── Network credentials (from secrets.h) ────────────────────────────────────
const char* ssid     = WIFI_SSID;
const char* password = WIFI_PASSWORD;

// ─── Motor subsystem – simulation drivers (Phase 1–4) ───────────────────────
MotorParams    params;

SimMotorDriver motorDriverImpl;
IMotorDriver*  motorDriver = &motorDriverImpl;
RampController rampCtrl(*motorDriver, params);

SimRpmSource   rpmSourceImpl(rampCtrl);
IRpmSource*    rpmSource = &rpmSourceImpl;

ErrorHandler   errorHandler(*motorDriver);
ProgramRunner  programRunner(rampCtrl, params);
SessionLogger  sessionLogger;

WebApi webApi(*motorDriver, *rpmSource, rampCtrl,
              errorHandler, params, motorDriverImpl, rpmSourceImpl,
              programRunner, sessionLogger);

// ─── Loop timing ─────────────────────────────────────────────────────────────
static unsigned long lastTick      = 0;
static unsigned long lastHeartbeat = 0;
static unsigned long lastWifiCheck = 0;

// ─── Status LED (M6.11) ──────────────────────────────────────────────────────
// LED_BUILTIN = GPIO 13, active-HIGH on Uno R4 WiFi.
enum class LedMode : uint8_t { STARTUP, ERROR_BLINK, READY };
static LedMode       g_ledMode   = LedMode::STARTUP;
static unsigned long g_ledLastMs = 0;
static uint8_t       g_ledPhase  = 0;

static const uint16_t LED_ERR_PATTERN[] = { 100, 100, 100, 700 };
static constexpr uint8_t LED_ERR_PHASES = 4;

static void setLedMode(LedMode mode) {
    g_ledMode   = mode;
    g_ledPhase  = (mode == LedMode::STARTUP) ? 1 : 0;
    g_ledLastMs = millis();
    digitalWrite(LED_BUILTIN, HIGH);
}

static void ledTick() {
    const unsigned long now = millis();
    if (g_ledMode == LedMode::READY) {
        digitalWrite(LED_BUILTIN, HIGH);
        return;
    }
    if (g_ledMode == LedMode::STARTUP) {
        if (now - g_ledLastMs >= 500UL) {
            g_ledLastMs = now;
            g_ledPhase ^= 1;
            digitalWrite(LED_BUILTIN, g_ledPhase ? HIGH : LOW);
        }
        return;
    }
    if (now - g_ledLastMs >= LED_ERR_PATTERN[g_ledPhase]) {
        g_ledLastMs = now;
        g_ledPhase  = (g_ledPhase + 1) % LED_ERR_PHASES;
        digitalWrite(LED_BUILTIN, (g_ledPhase % 2 == 0) ? HIGH : LOW);
    }
}

// ─── Helper: trigger CRITICAL error ──────────────────────────────────────────
static void triggerCritical(ErrorCode code, const char* msg) {
    rampCtrl.emergencyStop();
    errorHandler.trigger(code, msg);
    setLedMode(LedMode::ERROR_BLINK);
    String codeStr = "E0" + String((uint8_t)code);
    sessionLogger.logError(codeStr.c_str(), msg);
}

// ─── USB Serial command handler (M6.3) ───────────────────────────────────────
static void handleSerialCommand(const String& cmd) {
    LOG("[CMD] " + cmd);

    if (cmd == "status") {
        const char* stateStr[] = { "IDLE","RAMPING_UP","RUNNING","RAMPING_DOWN","DIR_CHANGE_PAUSE" };
        LOG("─── STATUS ──────────────────────────────────────────");
        LOG("[SIM]    Mode: SIMULATION (no GPIO output)");
        LOG("[RPM]    Current: " + String(rpmSource->getRpm(), 1)
            + "  Target: " + String(rampCtrl.getTarget(), 1)
            + "  ETA: " + String(rampCtrl.getEtaSeconds(), 1) + " s");
        LOG("[RAMP]   State: " + String(stateStr[(uint8_t)rampCtrl.getState()]));
        LOG("[DRV]    Duty: " + String(motorDriver->getDutyCycle())
            + "  Dir: " + String(motorDriver->getDirection() ? "CW" : "CCW")
            + "  En: " + String(motorDriver->isEnabled() ? "YES" : "NO")
            + "  Fault: " + String(motorDriver->isFault() ? "YES" : "NO"));
        LOG("[PARAMS] max_rpm=" + String(params.max_rpm)
            + " accel=" + String(params.accel_rate)
            + " decel=" + String(params.decel_rate)
            + " dir_pause=" + String(params.dir_pause_ms) + "ms");
        LOG("[ERRORS] count=" + String(errorHandler.count())
            + " critical=" + String(errorHandler.hasCritical() ? "YES" : "NO"));
        for (uint8_t i = 0; i < errorHandler.count(); i++) {
            const ActiveError& e = errorHandler.errors()[i];
            LOG("  E0" + String((uint8_t)e.code) + " t+" + String(e.timestamp_ms) + "ms: " + e.message);
        }
        LOG("────────────────────────────────────────────────────");

    } else if (cmd.startsWith("target ")) {
        if (errorHandler.hasCritical()) { LOG("[ERROR] FAULT active. Use resetfault first."); return; }
        float rpm = cmd.substring(7).toFloat();
        motorDriver->enable();
        rampCtrl.setTarget(rpm);
        LOG("[RAMP] Target -> " + String(rampCtrl.getTarget(), 1) + " RPM");

    } else if (cmd == "stop") {
        rampCtrl.setTarget(0.0f);
        LOG("[RAMP] Decelerating to 0 RPM");

    } else if (cmd == "estop") {
        triggerCritical(ErrorCode::EMERGENCY_STOP, "Operator E-Stop via Serial");

    } else if (cmd == "resetfault") {
        if (motorDriverImpl.isFault()) { LOG("[RESET] Driver fault still active."); return; }
        if (!rpmSourceImpl.isHealthy()) { LOG("[RESET] Sensor loss still active."); return; }
        rampCtrl.emergencyStop();
        errorHandler.clearAll();
        setLedMode(LedMode::READY);
        sessionLogger.logEvent("ERROR_CLEARED");

    } else if (cmd == "dir cw") {
        if (errorHandler.hasCritical()) { LOG("[ERROR] FAULT active."); return; }
        rampCtrl.requestDirectionChange(true);

    } else if (cmd == "dir ccw") {
        if (errorHandler.hasCritical()) { LOG("[ERROR] FAULT active."); return; }
        rampCtrl.requestDirectionChange(false);

    } else if (cmd == "fault on") {
        motorDriverImpl.injectFault(true);
        triggerCritical(ErrorCode::DRIVER_FAULT, "[SIM] Injected driver fault (E06)");

    } else if (cmd == "fault off") {
        motorDriverImpl.injectFault(false);
        LOG("[SIM] Driver fault injection cleared");

    } else if (cmd == "sensor off") {
        rpmSourceImpl.injectSensorLoss(true);
        triggerCritical(ErrorCode::RPM_SENSOR_LOST, "[SIM] Injected RPM sensor loss (E03)");

    } else if (cmd == "sensor on") {
        rpmSourceImpl.injectSensorLoss(false);
        LOG("[SIM] Sensor loss injection cleared");

    } else if (cmd.startsWith("set ")) {
        String rest  = cmd.substring(4);
        int    space = rest.indexOf(' ');
        if (space < 0) { LOG("[PARAMS] Usage: set <param> <value>"); return; }
        String key = rest.substring(0, space);
        float  val = rest.substring(space + 1).toFloat();
        MotorParams next = params;
        if      (key == "max_rpm")   next.max_rpm      = (uint16_t)val;
        else if (key == "accel")     next.accel_rate   = (uint8_t)val;
        else if (key == "decel")     next.decel_rate   = (uint8_t)val;
        else if (key == "dir_pause") next.dir_pause_ms = (uint16_t)val;
        else { LOG("[PARAMS] Unknown param: " + key); return; }
        if (!validateParams(next)) { LOG("[PARAMS] Value out of range."); return; }
        params = next;
        LOG("[PARAMS] " + key + " = " + String(val, 0) + " (use 'params save' to persist)");

    } else if (cmd == "params save") {
        saveParams(params);
        LOG("[PARAMS] Saved to EEPROM");

    } else if (cmd == "params reset") {
        resetToDefaults(params);
        saveParams(params);
        LOG("[PARAMS] Reset to defaults and saved");

    } else if (cmd == "help") {
        LOG("─── honey_please v" FIRMWARE_VERSION " Serial commands ───────────");
        LOG(" status              – full system state");
        LOG(" target <rpm>        – ramp to RPM");
        LOG(" stop                – ramp to 0 RPM");
        LOG(" estop               – immediate cut (E09)");
        LOG(" resetfault          – clear errors");
        LOG(" dir cw / dir ccw    – direction change");
        LOG(" fault on/off        – inject/clear E06");
        LOG(" sensor on/off       – inject/clear E03");
        LOG(" set max_rpm <n>     – RPM ceiling");
        LOG(" set accel/decel <n> – ramp rates (RPM/s)");
        LOG(" set dir_pause <ms>  – direction pause");
        LOG(" params save/reset   – EEPROM persistence");
        LOG("────────────────────────────────────────────────────");

    } else {
        LOG("[WARN] Unknown command. Type 'help'.");
    }
}

// Serial input accumulation buffer
static String g_serialBuf;

// ─── setup ───────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    // Brief pause for CDC USB enumeration on native USB
    delay(500);
    Serial.println("\n[BOOT] honey_please v" FIRMWARE_VERSION);

    pinMode(LED_BUILTIN, OUTPUT);
    setLedMode(LedMode::STARTUP);

    loadParams(params);
    programRunner.loadSteps();
    sessionLogger.begin();
    programRunner.setSession(&sessionLogger);

    // WiFi connect
    Serial.print("[WIFI] Connecting to ");
    Serial.println(ssid);
    WiFi.begin(ssid, password);
    {
        constexpr unsigned long WIFI_TIMEOUT_MS = 20000UL;
        unsigned long t0 = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) {
            ledTick();
            delay(10);
        }
    }
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[ERROR] WiFi connect timeout. Check SSID/password in secrets.h.");
        setLedMode(LedMode::ERROR_BLINK);
        // Continue without WiFi – Serial commands still work
    } else {
        Serial.print("[WIFI] Connected. IP: ");
        Serial.println(WiFi.localIP());

        webApi.begin();
        Serial.println("[HTTP] WebSocket + HTTP server ready");
        setLedMode(LedMode::READY);
    }

    motorDriver->begin();
    rpmSource->begin();

    Serial.println("[READY] Board up. Simulation mode active. Type 'help'.");
}

// ─── loop ────────────────────────────────────────────────────────────────────
void loop() {
    // USB Serial command handling (M6.3)
    while (Serial.available()) {
        char c = (char)Serial.read();
        if (c == '\n' || c == '\r') {
            g_serialBuf.trim();
            if (g_serialBuf.length() > 0) handleSerialCommand(g_serialBuf);
            g_serialBuf = "";
        } else {
            g_serialBuf += c;
        }
    }

    ledTick();


    const unsigned long now = millis();

    // WiFi reconnect watchdog (every 10 s)
    if (now - lastWifiCheck >= 10000UL) {
        lastWifiCheck = now;
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WIFI] Reconnecting...");
            WiFi.begin(ssid, password);
        }
    }

    // 20 Hz tick: ramp + fault + program runner
    if (now - lastTick >= 50UL) {
        lastTick = now;

        if (!errorHandler.hasCritical()) {
            rampCtrl.tick();
            programRunner.tick();

            if (rpmSource->getRpm() > PHYSICAL_MAX_RPM) {
                triggerCritical(ErrorCode::OVERSPEED, "RPM exceeded physical maximum (E04)");
            }
            if (motorDriver->isFault()) {
                triggerCritical(ErrorCode::DRIVER_FAULT, "nFAULT asserted (E06)");
            }
            if (!rpmSource->isHealthy()) {
                triggerCritical(ErrorCode::RPM_SENSOR_LOST, "RPM sensor unhealthy (E03)");
            }
        }
    }

    // Session data-logger tick
    {
        const char* dir = motorDriver->getDirection() ? "CW" : "CCW";
        const char* stStr;
        switch (rampCtrl.getState()) {
            case RampState::IDLE:             stStr = "IDLE"; break;
            case RampState::RAMPING_UP:       stStr = "RAMPING_UP"; break;
            case RampState::RUNNING:          stStr = "RUNNING"; break;
            case RampState::RAMPING_DOWN:     stStr = "RAMPING_DOWN"; break;
            case RampState::DIR_CHANGE_PAUSE: stStr = "DIR_CHANGE_PAUSE"; break;
            default:                          stStr = "UNKNOWN"; break;
        }
        sessionLogger.tick(rpmSource->getRpm(), dir, stStr);
    }

    // WebSocket 10 Hz broadcast + HTTP requests
    if (WiFi.status() == WL_CONNECTED) {
        webApi.tick();
    }

    // 5 s heartbeat
    if (now - lastHeartbeat >= 5000UL) {
        lastHeartbeat = now;
        const char* stateStr[] = { "IDLE","RAMPING_UP","RUNNING","RAMPING_DOWN","DIR_CHANGE_PAUSE" };
        LOG("[HB] RPM=" + String(rpmSource->getRpm(), 0)
            + " Tgt=" + String(rampCtrl.getTarget(), 0)
            + " " + stateStr[(uint8_t)rampCtrl.getState()]
            + (errorHandler.hasCritical() ? " [FAULT_STOP]" : " [OK]"));
    }
}

