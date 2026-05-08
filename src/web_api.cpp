// src/web_api.cpp
#include "web_api.h"
#include "sim_rpm_source.h"
#include "log.h"
#include <LittleFS.h>

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

// ─── begin ────────────────────────────────────────────────────────────────────
void WebApi::begin() {
    // WebSocket handler
    _ws.onEvent([this](AsyncWebSocket* server, AsyncWebSocketClient* client,
                       AwsEventType type, void* arg, uint8_t* data, size_t len) {
        if (type == WS_EVT_CONNECT) {
            LOG("[WS] Client connected: " + String(client->id()));
            // Send initial full state immediately so UI renders on first connect
            broadcastState();
        } else if (type == WS_EVT_DISCONNECT) {
            LOG("[WS] Client disconnected: " + String(client->id()));
        } else if (type == WS_EVT_DATA) {
            AwsFrameInfo* info = (AwsFrameInfo*)arg;
            if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
                String msg;
                msg.reserve(len + 1);
                for (size_t i = 0; i < len; i++) msg += (char)data[i];
                handleCommand(client, msg);
            }
        }
    });
    _server.addHandler(&_ws);

    // Serve index.html from LittleFS
    _server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
    LOG("[WS] WebSocket ready at /ws");
}

// ─── broadcastState ───────────────────────────────────────────────────────────
void WebApi::broadcastState() {
    if (_ws.count() == 0) return;

    JsonDocument doc;
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

    JsonArray errors = doc["errors"].to<JsonArray>();
    for (uint8_t i = 0; i < _errors.count(); i++) {
        const ActiveError& e = _errors.errors()[i];
        JsonObject obj = errors.add<JsonObject>();
        obj["code"] = (uint8_t)e.code;
        obj["msg"]  = e.message;
        obj["ts"]   = e.timestamp_ms;
    }

    JsonObject p = doc["params"].to<JsonObject>();
    p["max_rpm"]   = _params.max_rpm;
    p["accel"]     = _params.accel_rate;
    p["decel"]     = _params.decel_rate;
    p["dir_pause"] = _params.dir_pause_ms;

    String json;
    serializeJson(doc, json);
    _ws.textAll(json);
}

// ─── handleCommand ────────────────────────────────────────────────────────────
void WebApi::handleCommand(AsyncWebSocketClient* client, const String& json) {
    JsonDocument doc;
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        LOG("[WS] Bad JSON from client " + String(client->id()));
        return;
    }

    const char* cmd = doc["cmd"] | "";
    LOG("[WS] cmd=" + String(cmd));

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

    } else if (strcmp(cmd, "resetfault") == 0) {
        if (_simDriver.isFault() || !_simRpm.isHealthy()) {
            LOG("[WS] Cannot reset: active injected fault");
            return;
        }
        _ramp.emergencyStop();
        _errors.clearAll();

    } else if (strcmp(cmd, "dir") == 0) {
        if (_errors.hasCritical()) return;
        const char* val = doc["value"] | "cw";
        _ramp.requestDirectionChange(strcmp(val, "cw") == 0);

    } else if (strcmp(cmd, "set_param") == 0) {
        const char* key = doc["key"] | "";
        float val       = doc["value"] | 0.0f;
        MotorParams next = _params;
        if      (strcmp(key, "max_rpm")   == 0) next.max_rpm      = (uint16_t)val;
        else if (strcmp(key, "accel")     == 0) next.accel_rate   = (uint8_t)val;
        else if (strcmp(key, "decel")     == 0) next.decel_rate   = (uint8_t)val;
        else if (strcmp(key, "dir_pause") == 0) next.dir_pause_ms = (uint16_t)val;
        if (validateParams(next)) {
            _params = next;
            saveParams(_params);
        }

    } else if (strcmp(cmd, "inject_fault") == 0) {
        const char* type = doc["type"] | "";
        bool active = doc["active"] | false;
        if (strcmp(type, "driver") == 0) {
            _simDriver.injectFault(active);
            if (active) {
                _ramp.emergencyStop();
                _errors.trigger(ErrorCode::DRIVER_FAULT, "[SIM] Injected E06");
            }
        } else if (strcmp(type, "sensor") == 0) {
            _simRpm.injectSensorLoss(active);
            if (active) {
                _ramp.emergencyStop();
                _errors.trigger(ErrorCode::RPM_SENSOR_LOST, "[SIM] Injected E03");
            } else {
                _errors.clear(ErrorCode::RPM_SENSOR_LOST);
            }
        }
    }

    // Broadcast updated state immediately after any command
    broadcastState();
}

// ─── tick ─────────────────────────────────────────────────────────────────────
void WebApi::tick() {
    const unsigned long now = millis();
    if (now - _lastBroadcast >= 100UL) {  // 10 Hz
        _lastBroadcast = now;
        broadcastState();
        _ws.cleanupClients();  // free disconnected client slots
    }
}
