// src/main.cpp
// honey_please – ESP32 Honigschleuder Motor Control
// Firmware v1.3.0 | Phase 3: Web UI + WebSocket
//
// Architecture:
//   SimMotorDriver + SimRpmSource are the active implementations.
//   LittleFS serves data/index.html from ESP32 flash.
//   WebSocket /ws broadcasts state JSON at 10 Hz.
//   No GPIO is touched until Phase 5 (REAL_HARDWARE build flag).
//
// WebSerial commands: type 'help' in browser terminal
#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <WebSerial.h>
#include "secrets.h"
#include "log.h"
#include "params.h"
#include "motor_driver.h"
#include "rpm_source.h"
#include "ramp_controller.h"
#include "sim_rpm_source.h"
#include <LittleFS.h>
#include "web_api.h"

// ─── Firmware version ────────────────────────────────────────────────────────
#define FIRMWARE_VERSION "1.3.0"

// ─── Network ─────────────────────────────────────────────────────────────────
const char* ssid     = WIFI_SSID;
const char* password = WIFI_PASSWORD;

AsyncWebServer server(80);

// ─── Motor subsystem – simulation drivers (Phase 1–4) ───────────────────────
MotorParams    params;

#if defined(REAL_HARDWARE)
    #error "RealMotorDriver not yet implemented. Remove REAL_HARDWARE flag."
#else
    SimMotorDriver motorDriverImpl;
#endif

IMotorDriver*  motorDriver = &motorDriverImpl;
RampController rampCtrl(*motorDriver, params);

#if defined(REAL_HARDWARE)
    // Phase 5: RealRpmSource rpmSourceImpl(...);
#else
    SimRpmSource   rpmSourceImpl(rampCtrl);
#endif

IRpmSource*    rpmSource = &rpmSourceImpl;
ErrorHandler   errorHandler(*motorDriver);
WebApi         webApi(server, *motorDriver, *rpmSource, rampCtrl,
                      errorHandler, params, motorDriverImpl, rpmSourceImpl);

// ─── Loop timing ─────────────────────────────────────────────────────────────
static unsigned long lastTick      = 0;
static unsigned long lastHeartbeat = 0;

// ─── Helper: trigger CRITICAL error + always zero the ramp ───────────────────
// All CRITICAL paths must go through here so ramp state stays consistent.
static void triggerCritical(ErrorCode code, const char* msg) {
    rampCtrl.emergencyStop();          // zero ramp + PWM before error state set
    errorHandler.trigger(code, msg);   // sets hasCritical() + disables driver again
}

// ─── WebSerial command handler ────────────────────────────────────────────────
void onWebSerialMessage(uint8_t* data, size_t len) {
    String cmd;
    cmd.reserve(len);
    for (size_t i = 0; i < len; i++) cmd += (char)data[i];
    cmd.trim();
    LOG("[CMD] " + cmd);

    // ── status ───────────────────────────────────────────────────────────────
    if (cmd == "status") {
        const char* stateStr[] = { "IDLE", "RAMPING_UP", "RUNNING", "RAMPING_DOWN", "DIR_CHANGE_PAUSE" };
        LOG("─── STATUS ─────────────────────────────────────────");
        LOG("[SIM]    Mode: SIMULATION (no GPIO output)");
        LOG("[RPM]    Current: " + String(rpmSource->getRpm(), 1)
            + "  Target: " + String(rampCtrl.getTarget(), 1)
            + "  ETA: " + String(rampCtrl.getEtaSeconds(), 1) + " s");
        LOG("[RAMP]   State: " + String(stateStr[(uint8_t)rampCtrl.getState()]));
        LOG("[DRV]    Duty: " + String(motorDriver->getDutyCycle())
            + "  Dir: " + String(motorDriver->getDirection() ? "CW" : "CCW")
            + "  En: "  + String(motorDriver->isEnabled()    ? "YES" : "NO")
            + "  Fault: "+ String(motorDriver->isFault()     ? "YES" : "NO"));
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

    // ── target <rpm> ─────────────────────────────────────────────────────────
    } else if (cmd.startsWith("target ")) {
        if (errorHandler.hasCritical()) {
            LOG("[ERROR] FAULT_STOP active. Use 'resetfault' before setting a target.");
            return;
        }
        float rpm = cmd.substring(7).toFloat();
        motorDriver->enable();
        rampCtrl.setTarget(rpm);
        LOG("[RAMP] Target → " + String(rampCtrl.getTarget(), 1)
            + " RPM  (ETA " + String(rampCtrl.getEtaSeconds(), 1) + " s)");

    // ── stop ─────────────────────────────────────────────────────────────────
    } else if (cmd == "stop") {
        rampCtrl.setTarget(0.0f);
        LOG("[RAMP] Decelerating to 0 RPM");

    // ── estop ────────────────────────────────────────────────────────────────
    } else if (cmd == "estop") {
        triggerCritical(ErrorCode::EMERGENCY_STOP, "Operator E-Stop via WebSerial");

    // ── resetfault ───────────────────────────────────────────────────────────
    } else if (cmd == "resetfault") {
        if (motorDriverImpl.isFault()) {
            LOG("[RESET] Cannot reset: injected driver fault still active. Run 'fault off'.");
            return;
        }
        if (!rpmSourceImpl.isHealthy()) {
            LOG("[RESET] Cannot reset: sensor loss still injected. Run 'sensor on'.");
            return;
        }
        rampCtrl.emergencyStop();   // ensure ramp is zeroed before clearing
        errorHandler.clearAll();

    // ── dir cw / ccw ──────────────────────────────────────────────────────────
    } else if (cmd == "dir cw") {
        if (errorHandler.hasCritical()) {
            LOG("[ERROR] FAULT_STOP active – direction change rejected.");
            return;
        }
        rampCtrl.requestDirectionChange(true);

    } else if (cmd == "dir ccw") {
        if (errorHandler.hasCritical()) {
            LOG("[ERROR] FAULT_STOP active – direction change rejected.");
            return;
        }
        rampCtrl.requestDirectionChange(false);

    // ── fault on / off ────────────────────────────────────────────────────────
    } else if (cmd == "fault on") {
        motorDriverImpl.injectFault(true);
        triggerCritical(ErrorCode::DRIVER_FAULT, "[SIM] Injected driver fault (E06)");

    } else if (cmd == "fault off") {
        motorDriverImpl.injectFault(false);
        LOG("[SIM] Driver fault injection cleared");

    // ── sensor on / off ───────────────────────────────────────────────────────
    } else if (cmd == "sensor off") {
        rpmSourceImpl.injectSensorLoss(true);
        triggerCritical(ErrorCode::RPM_SENSOR_LOST, "[SIM] Injected RPM sensor loss (E03)");

    } else if (cmd == "sensor on") {
        rpmSourceImpl.injectSensorLoss(false);
        LOG("[SIM] Sensor loss injection cleared");

    // ── set <param> <value> ────────────────────────────────────────────────────
    } else if (cmd.startsWith("set ")) {
        String rest  = cmd.substring(4);
        int    space = rest.indexOf(' ');
        if (space < 0) {
            LOG("[PARAMS] Usage: set <param> <value>  (params: max_rpm accel decel dir_pause)");
            return;
        }
        String key = rest.substring(0, space);
        float  val = rest.substring(space + 1).toFloat();

        MotorParams next = params;  // stage copy
        if      (key == "max_rpm")   next.max_rpm        = (uint16_t)val;
        else if (key == "accel")     next.accel_rate     = (uint8_t)val;
        else if (key == "decel")     next.decel_rate     = (uint8_t)val;
        else if (key == "dir_pause") next.dir_pause_ms   = (uint16_t)val;
        else {
            LOG("[PARAMS] Unknown param '" + key + "'. Use: max_rpm accel decel dir_pause");
            return;
        }

        if (!validateParams(next)) {
            LOG("[PARAMS] Value out of range – rejected. Changes not applied.");
            return;
        }
        params = next;
        LOG("[PARAMS] " + key + " = " + String(val, 0)
            + "  (use 'params save' to persist)");

    // ── params ────────────────────────────────────────────────────────────────
    } else if (cmd == "params save") {
        saveParams(params);

    } else if (cmd == "params reset") {
        resetToDefaults(params);
        saveParams(params);

    // ── help ──────────────────────────────────────────────────────────────────
    } else if (cmd == "help") {
        LOG("┌─ honey_please v" FIRMWARE_VERSION " WebSerial commands ─────┐");
        LOG("│ status                 – full system state           │");
        LOG("│ target <rpm>           – ramp to RPM                 │");
        LOG("│ stop                   – ramp to 0 RPM               │");
        LOG("│ estop                  – immediate PWM cut (E09)      │");
        LOG("│ resetfault             – clear errors, return to IDLE │");
        LOG("│ dir cw / dir ccw       – safe direction change (F04)  │");
        LOG("│ fault on/off           – inject/clear E06             │");
        LOG("│ sensor on/off          – inject/clear E03             │");
        LOG("│ set max_rpm <n>        – set RPM ceiling (10–300)     │");
        LOG("│ set accel <n>          – accel rate RPM/s (1–50)      │");
        LOG("│ set decel <n>          – decel rate RPM/s (1–50)      │");
        LOG("│ set dir_pause <ms>     – direction pause (500–10000)  │");
        LOG("│ params save            – persist to NVS               │");
        LOG("│ params reset           – restore factory defaults     │");
        LOG("└───────────────────────────────────────────────────────┘");

    } else {
        LOG("[WARN] Unknown command. Type 'help'.");
    }
}

// ─── setup ───────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    Serial.println("\n[START] honey_please v" FIRMWARE_VERSION);

    // LittleFS
    if (!LittleFS.begin()) {
        LOG("[ERROR] LittleFS mount failed – run 'Upload Filesystem Image' once");
    } else {
        LOG("[FS] LittleFS mounted");
    }

    loadParams(params);

    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);
    while (WiFi.waitForConnectResult() != WL_CONNECTED) {
        Serial.println("[ERROR] WiFi failed. Rebooting...");
        delay(5000);
        ESP.restart();
    }

    ArduinoOTA.setHostname("honey-please");
    ArduinoOTA.onStart([]() {
        LOG("[OTA] Start: " + String(ArduinoOTA.getCommand() == U_FLASH ? "sketch" : "filesystem"));
    });
    ArduinoOTA.onEnd([]() { LOG("[OTA] Done!"); });
    ArduinoOTA.onError([](ota_error_t err) {
        Serial.printf("[OTA] Error [%u]\n", err);
    });
    ArduinoOTA.begin();

    WebSerial.begin(&server);
    WebSerial.onMessage(onWebSerialMessage);
    webApi.begin();     // registers /ws and serves LittleFS /
    server.begin();

    motorDriver->begin();
    rpmSource->begin();

    LOG("[READY] honey_please v" FIRMWARE_VERSION);
    LOG("[INFO]  IP:        " + WiFi.localIP().toString());
    LOG("[INFO]  Web UI:    http://" + WiFi.localIP().toString() + "/");
    LOG("[INFO]  WebSerial: http://" + WiFi.localIP().toString() + "/webserial");
    LOG("[SIM]   Simulation mode – no GPIO output. Type 'help'.");
}

// ─── loop ────────────────────────────────────────────────────────────────────
void loop() {
    ArduinoOTA.handle();

    const unsigned long now = millis();

    // 20 Hz tick: ramp advance + fault polling
    if (now - lastTick >= 50UL) {
        lastTick = now;

        if (!errorHandler.hasCritical()) {
            rampCtrl.tick();

            // Overspeed guard (E04)
            if (rpmSource->getRpm() > PHYSICAL_MAX_RPM) {
                triggerCritical(ErrorCode::OVERSPEED, "RPM exceeded physical maximum (E04)");
            }

            // Driver fault (E06) – polls at 20 Hz per F05 spec
            if (motorDriver->isFault()) {
                triggerCritical(ErrorCode::DRIVER_FAULT, "nFAULT asserted (E06)");
            }

            // RPM sensor unhealthy (E03) → CRITICAL + EMERGENCY_STOP per F05
            if (!rpmSource->isHealthy()) {
                triggerCritical(ErrorCode::RPM_SENSOR_LOST, "RPM sensor unhealthy (E03)");
            }
        }
    }

    // WebSocket 10 Hz broadcast
    webApi.tick();

    // 5 s heartbeat
    if (now - lastHeartbeat >= 5000UL) {
        lastHeartbeat = now;
        const char* stateStr[] = { "IDLE", "RAMPING_UP", "RUNNING", "RAMPING_DOWN", "DIR_CHG_PAUSE" };
        LOG("[HB] RPM=" + String(rpmSource->getRpm(), 0)
            + " Tgt=" + String(rampCtrl.getTarget(), 0)
            + " " + stateStr[(uint8_t)rampCtrl.getState()]
            + (errorHandler.hasCritical() ? " [FAULT_STOP]" : " [OK]"));
    }
}
