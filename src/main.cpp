// src/main.cpp
// honey_please – ESP32 Honigschleuder Motor Control
// Firmware v1.5.0 | Phase 4 + stability fixes
//
// Architecture:
//   SimMotorDriver + SimRpmSource are the active implementations.
//   LittleFS serves data/index.html from ESP32 flash.
//   WebSocket /ws broadcasts state JSON at 10 Hz.
//   ProgramRunner: NVS-stored 6-step CW/CCW extraction program (F09).
//   SessionLogger: JSONL per-session log in /sessions/ on LittleFS (F10).
//   No GPIO is touched until Phase 5 (REAL_HARDWARE build flag).
//
// Dual-core safety:
//   AsyncTCP callbacks run on Core 0; loop() runs on Core 1.
//   g_mutex protects all shared subsystem state. Callbacks take the mutex
//   before touching any shared object. loop() takes it for the 20 Hz gate,
//   programRunner.tick(), and the session tick.
//   LOG() posts to a FreeRTOS queue; logDrain() (called at top of loop)
//   is the only site that calls WebSerial.println().
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
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "secrets.h"
#include "log.h"
#include "params.h"
#include "motor_driver.h"
#include "rpm_source.h"
#include "ramp_controller.h"
#include "sim_rpm_source.h"
#include <LittleFS.h>
#include "web_api.h"
#include "program.h"
#include "session.h"

// ─── Firmware version ────────────────────────────────────────────────────────
#define FIRMWARE_VERSION "1.4.0"
const char* FIRMWARE_VERSION_STR = FIRMWARE_VERSION;

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
ProgramRunner  programRunner(rampCtrl, params);
SessionLogger  sessionLogger;
WebApi         webApi(server, *motorDriver, *rpmSource, rampCtrl,
                      errorHandler, params, motorDriverImpl, rpmSourceImpl,
                      programRunner, sessionLogger);

// ─── Dual-core mutex ─────────────────────────────────────────────────────────
// Protects all shared subsystem state between Core-0 async callbacks and
// Core-1 loop(). Initialised in setup() before WiFi/WebSocket start.
SemaphoreHandle_t g_mutex = nullptr;

// ─── Loop timing ─────────────────────────────────────────────────────────────
static unsigned long lastTick      = 0;
static unsigned long lastHeartbeat = 0;
static unsigned long lastWifiCheck = 0;

// ─── Status LED ──────────────────────────────────────────────────────────────
// Built-in LED pin – GPIO 2 on DevKit, NodeMCU-32S, LOLIN32 and most clones.
constexpr uint8_t STATUS_LED_PIN = 2;
// NodeMCU-32S / LOLIN32 / Wemos: LED cathode → GPIO (LOW = ON, HIGH = OFF).
// Set false for classic ESP32-DevKitC where HIGH = ON.
constexpr bool    LED_ACTIVE_LOW = true;

// Polarity-aware write helper.
static inline void ledWrite(bool on) {
    digitalWrite(STATUS_LED_PIN, (LED_ACTIVE_LOW ? !on : on) ? HIGH : LOW);
}

enum class LedMode : uint8_t { STARTUP, ERROR_BLINK, READY };

static LedMode       g_ledMode   = LedMode::STARTUP;
static unsigned long g_ledLastMs = 0;
static uint8_t       g_ledPhase  = 0;

// Error pattern (ms per phase): ON-100, OFF-100, ON-100, OFF-700 → fast-fast-[gap]
static const uint16_t LED_ERR_PATTERN[] = { 100, 100, 100, 700 };
static constexpr uint8_t LED_ERR_PHASES = 4;

static void setLedMode(LedMode mode) {
    g_ledMode   = mode;
    // phase=1 for STARTUP so the first toggle (at 500 ms) turns OFF correctly
    g_ledPhase  = (mode == LedMode::STARTUP) ? 1 : 0;
    g_ledLastMs = millis();
    ledWrite(true);   // all modes start LED ON
}

// Call every loop() iteration – non-blocking.
static void ledTick() {
    const unsigned long now = millis();

    if (g_ledMode == LedMode::READY) {
        // Constant ON – redundant writes are harmless.
        ledWrite(true);
        return;
    }

    if (g_ledMode == LedMode::STARTUP) {
        // 1 Hz symmetric blink: 500 ms ON / 500 ms OFF
        if (now - g_ledLastMs >= 500UL) {
            g_ledLastMs = now;
            g_ledPhase ^= 1;
            ledWrite(g_ledPhase != 0);
        }
        return;
    }

    // ERROR_BLINK: fast-fast-[long gap] repeating pattern
    if (now - g_ledLastMs >= LED_ERR_PATTERN[g_ledPhase]) {
        g_ledLastMs = now;
        g_ledPhase  = (g_ledPhase + 1) % LED_ERR_PHASES;
        // Even phases (0, 2) = ON; odd phases (1, 3) = OFF
        ledWrite(g_ledPhase % 2 == 0);
    }
}

// ─── Helper: trigger CRITICAL error + always zero the ramp ───────────────────
// All CRITICAL paths must go through here so ramp state stays consistent.
static void triggerCritical(ErrorCode code, const char* msg) {
    rampCtrl.emergencyStop();          // zero ramp + PWM before error state set
    errorHandler.trigger(code, msg);   // sets hasCritical() + disables driver again
    setLedMode(LedMode::ERROR_BLINK);  // visual indicator: fast-fast-[gap] pattern
    // Log to active session
    String codeStr = "E0" + String((uint8_t)code);
    sessionLogger.logError(codeStr.c_str(), msg);
}

// ─── WebSerial command handler ────────────────────────────────────────────────
void onWebSerialMessage(uint8_t* data, size_t len) {
    String cmd;
    cmd.reserve(len);
    for (size_t i = 0; i < len; i++) cmd += (char)data[i];
    cmd.trim();
    LOG("[CMD] " + cmd);
    xSemaphoreTake(g_mutex, portMAX_DELAY);

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
        setLedMode(LedMode::READY);     // error cleared → constant ON
        sessionLogger.logEvent("ERROR_CLEARED");

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
    xSemaphoreGive(g_mutex);
}

// ─── setup ───────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    Serial.println("\n[START] honey_please v" FIRMWARE_VERSION);

    // Status LED – slow blink (1 Hz) while connecting / initialising
    pinMode(STATUS_LED_PIN, OUTPUT);
    setLedMode(LedMode::STARTUP);

    // Mutex must exist before WiFi/WebSocket bring up Core-0 async tasks
    g_mutex = xSemaphoreCreateMutex();
    configASSERT(g_mutex);

    // LittleFS
    if (!LittleFS.begin()) {
        LOG("[ERROR] LittleFS mount failed – run 'Upload Filesystem Image' once");
    } else {
        LOG("[FS] LittleFS mounted");
    }

    loadParams(params);
    programRunner.loadSteps();
    sessionLogger.begin();
    programRunner.setSession(&sessionLogger);  // wire session logging into ProgramRunner

    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);
    // Non-blocking wait so ledTick() keeps the STARTUP blink alive during connect.
    // Cold-boot WiFi can take longer than OTA-reboot reconnects.
    {
        constexpr unsigned long WIFI_TIMEOUT_MS = 15000UL;
        unsigned long t0 = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) {
            ledTick();
            delay(10);
        }
    }
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[ERROR] WiFi connect timeout. Rebooting...");
        setLedMode(LedMode::ERROR_BLINK);
        for (unsigned long _t = millis(); millis() - _t < 5000;) {
            ledTick();
            delay(10);
        }
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

    setLedMode(LedMode::READY);   // all subsystems up → LED constant ON
    LOG("[READY] honey_please v" FIRMWARE_VERSION);
    LOG("[INFO]  IP:        " + WiFi.localIP().toString());
    LOG("[INFO]  Web UI:    http://" + WiFi.localIP().toString() + "/");
    LOG("[INFO]  WebSerial: http://" + WiFi.localIP().toString() + "/webserial");
    LOG("[SIM]   Simulation mode – no GPIO output. Type 'help'.");
}

// ─── loop ────────────────────────────────────────────────────────────────────
void loop() {
    // Drain the thread-safe log queue first – only WebSerial.println() call site.
    logDrain();

    ledTick();   // non-blocking LED state machine (STARTUP / ERROR_BLINK / READY)
    ArduinoOTA.handle();

    const unsigned long now = millis();

    // ── WiFi reconnect watchdog ───────────────────────────────────────────────
    // Checks every 10 s; reconnects transparently after AP restart or range loss.
    // OTA + WebSocket resume automatically once the IP is restored.
    if (now - lastWifiCheck >= 10000UL) {
        lastWifiCheck = now;
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WIFI] Connection lost – reconnecting...");
            WiFi.disconnect();
            WiFi.begin(ssid, password);
        }
    }

    xSemaphoreTake(g_mutex, portMAX_DELAY);

    // 20 Hz tick: ramp advance + fault polling + program runner
    if (now - lastTick >= 50UL) {
        lastTick = now;

        if (!errorHandler.hasCritical()) {
            rampCtrl.tick();

            // Program runner tick must follow rampCtrl.tick() at same rate
            programRunner.tick();

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

    // Session data-logger tick (samples every SESSION_SAMPLE_INT ms)
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

    xSemaphoreGive(g_mutex);

    // WebSocket 10 Hz broadcast (outside mutex – AsyncTCP handles its own queueing)
    webApi.tick();

    // 5 s heartbeat
    if (now - lastHeartbeat >= 5000UL) {
        lastHeartbeat = now;
        const char* stateStr[] = { "IDLE", "RAMPING_UP", "RUNNING", "RAMPING_DOWN", "DIR_CHANGE_PAUSE" };
        LOG("[HB] RPM=" + String(rpmSource->getRpm(), 0)
            + " Tgt=" + String(rampCtrl.getTarget(), 0)
            + " " + stateStr[(uint8_t)rampCtrl.getState()]
            + (errorHandler.hasCritical() ? " [FAULT_STOP]" : " [OK]")
            + " heap=" + String(ESP.getFreeHeap()));
    }
}
