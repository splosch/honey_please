// src/web_api.cpp
// WebApi implementation – Phase 4: adds program & session state to broadcasts,
// new WS commands (prog_start/skip/pause/resume/abort, session_start/stop),
// HTTP GET /sessions and /sessions/<id> routes.
#include "web_api.h"
#include "sim_rpm_source.h"
#include "log.h"
#include <LittleFS.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// Declared and initialised in main.cpp before server.begin().
extern SemaphoreHandle_t g_mutex;

// ─── helpers ──────────────────────────────────────────────────────────────────
static const char* rampStateStr(RampState s) {
    switch (s) {
        case RampState::IDLE:             return "IDLE";
        case RampState::RAMPING_UP:       return "RAMPING_UP";
        case RampState::RUNNING:          return "RUNNING";
        case RampState::RAMPING_DOWN:     return "RAMPING_DOWN";
        case RampState::DIR_CHANGE_PAUSE: return "DIR_CHANGE_PAUSE";
    }
    return "UNKNOWN";
}

static const char* progStateStr(ProgramState s) {
    switch (s) {
        case ProgramState::IDLE:            return "IDLE";
        case ProgramState::WAITING_FOR_RPM: return "WAITING_FOR_RPM";
        case ProgramState::HOLDING:         return "HOLDING";
        case ProgramState::DIR_CHANGING:    return "DIR_CHANGING";
        case ProgramState::PAUSED:          return "PAUSED";
        case ProgramState::COMPLETE:        return "COMPLETE";
        case ProgramState::ABORTED:         return "ABORTED";
    }
    return "UNKNOWN";
}

// ─── begin ────────────────────────────────────────────────────────────────────
void WebApi::begin() {
    _ws.onEvent([this](AsyncWebSocket* server, AsyncWebSocketClient* client,
                       AwsEventType type, void* arg, uint8_t* data, size_t len) {
        if (type == WS_EVT_CONNECT) {
            LOG("[WS] Client connected: " + String(client->id()));
            broadcastState();
        } else if (type == WS_EVT_DISCONNECT) {
            LOG("[WS] Client disconnected: " + String(client->id()));
            _frameBuf[client->id() % WS_RATE_SLOTS] = "";
        } else if (type == WS_EVT_DATA) {
            AwsFrameInfo* info = (AwsFrameInfo*)arg;
            if (info->opcode == WS_TEXT) {
                uint8_t slot = client->id() % WS_RATE_SLOTS;
                if (info->index == 0) _frameBuf[slot] = "";
                _frameBuf[slot].concat((const char*)data, len);
                if (info->final) handleCommand(client, _frameBuf[slot]);
            }
        }
    });
    _server.addHandler(&_ws);

    // HTTP GET /sessions          – JSON list of stored session files
    // HTTP GET /sessions?id=<n>   – download session JSONL (no regex needed)
    _server.on("/sessions", HTTP_GET, [this](AsyncWebServerRequest* req) {
        if (req->hasParam("id")) {
            uint16_t id = (uint16_t)req->getParam("id")->value().toInt();
            String path = _session.sessionPath(id);
            if (LittleFS.exists(path)) {
                req->send(LittleFS, path, "application/json", true);  // attachment
            } else {
                req->send(404, "application/json", "{\"error\":\"session not found\"}");
            }
        } else {
            req->send(200, "application/json", _session.listSessions());
        }
    });

    // Serve static UI files from LittleFS
    _server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
    LOG("[WS] WebSocket /ws + HTTP /sessions ready");
}

// ─── broadcastState ───────────────────────────────────────────────────────────
void WebApi::broadcastState() {
    if (_ws.count() == 0) return;

    JsonDocument doc;

    // Motor state
    doc["rpm"]      = (float)((int)(_rpm.getRpm() * 10)) / 10.0f;
    doc["target"]   = _ramp.getTarget();
    doc["eta"]      = (float)((int)(_ramp.getEtaSeconds() * 10)) / 10.0f;
    doc["state"]    = rampStateStr(_ramp.getState());
    doc["duty"]     = _driver.getDutyCycle();
    doc["dir"]      = _driver.getDirection() ? "CW" : "CCW";
    doc["enabled"]  = _driver.isEnabled();
    doc["fault"]    = _driver.isFault();
    doc["sim"]      = true;
    doc["critical"] = _errors.hasCritical();
    doc["uptime"]   = millis();

    // Errors
    JsonArray errors = doc["errors"].to<JsonArray>();
    for (uint8_t i = 0; i < _errors.count(); i++) {
        const ActiveError& e = _errors.errors()[i];
        JsonObject obj = errors.add<JsonObject>();
        obj["code"] = (uint8_t)e.code;
        obj["msg"]  = e.message;
        obj["ts"]   = e.timestamp_ms;
    }

    // Params
    JsonObject p    = doc["params"].to<JsonObject>();
    p["max_rpm"]    = _params.max_rpm;
    p["accel"]      = _params.accel_rate;
    p["decel"]      = _params.decel_rate;
    p["dir_pause"]  = _params.dir_pause_ms;

    // Program state (Phase 4)
    JsonObject prog      = doc["prog"].to<JsonObject>();
    prog["state"]        = progStateStr(_program.state());
    prog["step"]         = _program.currentStep() + 1;  // 1-based
    prog["step_total"]   = _program.stepCount();
    prog["hold_remain"]  = _program.holdRemaining();
    prog["total_remain"] = _program.totalRemainingSecs();
    prog["running"]      = _program.isRunning();

    JsonArray steps = prog["steps"].to<JsonArray>();
    for (uint8_t i = 0; i < _program.stepCount(); i++) {
        const ProgramStep& ps = _program.step(i);
        JsonObject st = steps.add<JsonObject>();
        st["cw"]  = ps.cw;
        st["pct"] = ps.rpm_pct;
        st["dur"] = ps.duration_s;
    }

    // Session state (Phase 4)
    JsonObject sess    = doc["session"].to<JsonObject>();
    sess["active"]     = _session.isActive();
    sess["id"]         = _session.sessionId();

    // P2-C: static buffer avoids a heap String allocation on every broadcast
    static char jsonBuf[1024];
    serializeJson(doc, jsonBuf, sizeof(jsonBuf));
    _ws.textAll(jsonBuf);
}

// ─── handleCommand ────────────────────────────────────────────────────────────
void WebApi::handleCommand(AsyncWebSocketClient* client, const String& json) {
    // P2-B: rate-limit – drop commands arriving faster than 50 ms per client slot
    uint8_t slot = client->id() % WS_RATE_SLOTS;
    uint32_t now_ms = millis();
    if (now_ms - _lastCmdMs[slot] < 50) return;
    _lastCmdMs[slot] = now_ms;

    JsonDocument doc;
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        LOG("[WS] Bad JSON from client " + String(client->id()));
        return;
    }

    const char* cmd = doc["cmd"] | "";
    LOG("[WS] cmd=" + String(cmd));
    // Guard all shared state access from the Core-0 AsyncTCP task.
    xSemaphoreTake(g_mutex, portMAX_DELAY);
    // ── Motor commands ────────────────────────────────────────────────────────
    if (strcmp(cmd, "target") == 0) {
        if (_errors.hasCritical()) return;
        float rpm = doc["value"] | 0.0f;
        _driver.enable();
        _ramp.setTarget(rpm);

    } else if (strcmp(cmd, "stop") == 0) {
        _ramp.setTarget(0.0f);

    } else if (strcmp(cmd, "estop") == 0) {
        _ramp.emergencyStop();
        _errors.trigger(ErrorCode::EMERGENCY_STOP, "E-Stop via Web UI");
        _session.logError("E09", "E-Stop via Web UI");

    } else if (strcmp(cmd, "resetfault") == 0) {
        if (_simDriver.isFault() || !_simRpm.isHealthy()) {
            LOG("[WS] Cannot reset: active injected fault");
            return;
        }
        _ramp.emergencyStop();
        _errors.clearAll();
        _session.logEvent("ERROR_CLEARED");

    } else if (strcmp(cmd, "dir") == 0) {
        if (_errors.hasCritical()) return;
        const char* val = doc["value"] | "cw";
        bool targetCw = strcmp(val, "cw") == 0;
        _session.logDirectionChange(_ramp.isCurrentDirectionCw() ? "CW" : "CCW",
                                    targetCw ? "CW" : "CCW");
        _ramp.requestDirectionChange(targetCw);

    } else if (strcmp(cmd, "set_param") == 0) {
        const char* key = doc["key"] | "";
        float val       = doc["value"] | 0.0f;
        MotorParams next = _params;
        if      (strcmp(key, "max_rpm")   == 0) next.max_rpm      = (uint16_t)val;
        else if (strcmp(key, "accel")     == 0) next.accel_rate   = (uint8_t)val;
        else if (strcmp(key, "decel")     == 0) next.decel_rate   = (uint8_t)val;
        else if (strcmp(key, "dir_pause") == 0) next.dir_pause_ms = (uint16_t)val;
        if (validateParams(next)) {
            _session.logParamChange(key, val);
            _params = next;
            // P2-E: do NOT write NVS here; use params_save to persist explicitly
        }

    } else if (strcmp(cmd, "params_save") == 0) {
        // P2-E: explicit NVS persist – decoupled from live set_param updates
        saveParams(_params);
        LOG("[WS] Params saved to NVS");

    } else if (strcmp(cmd, "inject_fault") == 0) {
        const char* type = doc["type"] | "";
        bool active = doc["active"] | false;
        if (strcmp(type, "driver") == 0) {
            _simDriver.injectFault(active);
            if (active) {
                _ramp.emergencyStop();
                _errors.trigger(ErrorCode::DRIVER_FAULT, "[SIM] Injected E06");
                _session.logError("E06", "[SIM] Injected E06");
            }
        } else if (strcmp(type, "sensor") == 0) {
            _simRpm.injectSensorLoss(active);
            if (active) {
                _ramp.emergencyStop();
                _errors.trigger(ErrorCode::RPM_SENSOR_LOST, "[SIM] Injected E03");
                _session.logError("E03", "[SIM] Injected E03");
            } else {
                _errors.clear(ErrorCode::RPM_SENSOR_LOST);
                _session.logErrorCleared("E03");
            }
        }

    // ── Program commands (Phase 4) ────────────────────────────────────────────
    } else if (strcmp(cmd, "prog_start") == 0) {
        if (_errors.hasCritical()) return;
        _driver.enable();
        _program.start();
        _session.logProgramStart(_program.stepCount(), _params.max_rpm);

    } else if (strcmp(cmd, "prog_skip") == 0) {
        _program.skip();

    } else if (strcmp(cmd, "prog_pause") == 0) {
        _program.pause();

    } else if (strcmp(cmd, "prog_resume") == 0) {
        if (_errors.hasCritical()) return;
        _program.resume();

    } else if (strcmp(cmd, "prog_abort") == 0) {
        _program.abort();  // abort() now calls _session.logProgramAbort() internally

    // ── Session commands (Phase 4) ────────────────────────────────────────────
    } else if (strcmp(cmd, "session_start") == 0) {
        if (!_session.isActive()) {
            extern const char* FIRMWARE_VERSION_STR;  // defined in main.cpp
            _session.start(String(FIRMWARE_VERSION_STR),
                           _params.max_rpm, _program.stepCount());
        }

    } else if (strcmp(cmd, "session_stop") == 0) {
        if (_session.isActive()) {
            _session.stop(0, 0, _program.currentStep());
        }
    }

    xSemaphoreGive(g_mutex);

    broadcastState();
}

// ─── tick ─────────────────────────────────────────────────────────────────────
void WebApi::tick() {
    const unsigned long now = millis();
    if (now - _lastBroadcast >= 100UL) {
        _lastBroadcast = now;
        broadcastState();
        _ws.cleanupClients();
    }
}
