// src/web_api.cpp
// WebApi implementation – synchronous WiFiServer/WiFiClient for Arduino Uno R4 WiFi.
//
// R4 migration (M6.4-M6.7, 2026-05-16):
//   Replaced ESPAsyncWebServer + FreeRTOS with synchronous WiFiServer.
//   One WebSocket client supported at a time.
//   Manual RFC 6455 WebSocket handshake (SHA1 + Base64 inline).
//   CORS header on all HTTP responses.
#include "web_api.h"
#include "log.h"

// ─── WebSocket SHA-1 (RFC 6455 handshake) ─────────────────────────────────────
static void sha1(const uint8_t* msg, size_t len, uint8_t* digest) {
    uint32_t h0=0x67452301UL, h1=0xEFCDAB89UL, h2=0x98BADCFEUL,
             h3=0x10325476UL, h4=0xC3D2E1F0UL;
    size_t newLen = len + 1;
    while (newLen % 64 != 56) newLen++;
    size_t totalLen = newLen + 8;
    uint8_t* buf = (uint8_t*)calloc(totalLen, 1);
    if (!buf) return;
    memcpy(buf, msg, len);
    buf[len] = 0x80;
    uint64_t bitLen = (uint64_t)len * 8;
    for (int i = 0; i < 8; i++) buf[totalLen-1-i] = (uint8_t)(bitLen >> (i*8));
    auto rotl = [](uint32_t v, int n) -> uint32_t { return (v<<n)|(v>>(32-n)); };
    for (size_t chunk = 0; chunk < totalLen; chunk += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++) {
            w[i]  = ((uint32_t)buf[chunk+i*4  ])<<24;
            w[i] |= ((uint32_t)buf[chunk+i*4+1])<<16;
            w[i] |= ((uint32_t)buf[chunk+i*4+2])<<8;
            w[i] |= ((uint32_t)buf[chunk+i*4+3]);
        }
        for (int i=16;i<80;i++) w[i]=rotl(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
        uint32_t a=h0,b=h1,c=h2,d=h3,e=h4;
        for (int i=0;i<80;i++) {
            uint32_t f,k;
            if      (i<20){f=(b&c)|(~b&d);k=0x5A827999UL;}
            else if (i<40){f=b^c^d;       k=0x6ED9EBA1UL;}
            else if (i<60){f=(b&c)|(b&d)|(c&d);k=0x8F1BBCDCUL;}
            else          {f=b^c^d;       k=0xCA62C1D6UL;}
            uint32_t temp=rotl(a,5)+f+e+k+w[i];
            e=d;d=c;c=rotl(b,30);b=a;a=temp;
        }
        h0+=a;h1+=b;h2+=c;h3+=d;h4+=e;
    }
    free(buf);
    uint32_t hh[5]={h0,h1,h2,h3,h4};
    for (int i=0;i<5;i++){
        digest[i*4  ]=(uint8_t)(hh[i]>>24);
        digest[i*4+1]=(uint8_t)(hh[i]>>16);
        digest[i*4+2]=(uint8_t)(hh[i]>>8);
        digest[i*4+3]=(uint8_t)(hh[i]);
    }
}

static const char B64[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static String base64Encode(const uint8_t* src, size_t len) {
    String out; out.reserve(((len+2)/3)*4+1);
    for (size_t i=0;i<len;i+=3){
        uint8_t b0=src[i], b1=(i+1<len)?src[i+1]:0, b2=(i+2<len)?src[i+2]:0;
        out+=B64[b0>>2];
        out+=B64[((b0&3)<<4)|(b1>>4)];
        out+=(i+1<len)?B64[((b1&0xF)<<2)|(b2>>6)]:'=';
        out+=(i+2<len)?B64[b2&0x3F]:'=';
    }
    return out;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
static const char CORS_HEADER[] = "Access-Control-Allow-Origin: *\r\n";

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

static char s_jsonBuf[1024];

const char* WebApi::_buildStateJson() {
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

    JsonObject p   = doc["params"].to<JsonObject>();
    p["max_rpm"]   = _params.max_rpm;
    p["accel"]     = _params.accel_rate;
    p["decel"]     = _params.decel_rate;
    p["dir_pause"] = _params.dir_pause_ms;

    JsonObject prog      = doc["prog"].to<JsonObject>();
    prog["state"]        = progStateStr(_program.state());
    prog["step"]         = _program.currentStep() + 1;
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

    JsonObject sess = doc["session"].to<JsonObject>();
    sess["active"]  = _session.isActive();
    sess["id"]      = _session.sessionId();

    serializeJson(doc, s_jsonBuf, sizeof(s_jsonBuf));
    return s_jsonBuf;
}

// ─── WebSocket frame encode (RFC 6455, server->client, unmasked text) ─────────
void WebApi::_wsSend(WiFiClient& client, const char* payload, size_t len) {
    if (!client.connected()) return;
    client.write((uint8_t)0x81);
    if (len <= 125) {
        client.write((uint8_t)len);
    } else if (len <= 65535) {
        client.write((uint8_t)126);
        client.write((uint8_t)(len >> 8));
        client.write((uint8_t)(len & 0xFF));
    } else {
        return;
    }
    client.write((const uint8_t*)payload, len);
}

// ─── WebSocket frame decode (client->server, masked text) ─────────────────────
static bool wsReadFrame(WiFiClient& client, String& out) {
    if (client.available() < 2) return false;
    uint8_t b0 = client.read();
    uint8_t b1 = client.read();
    bool masked   = (b1 & 0x80) != 0;
    uint64_t plen = b1 & 0x7F;
    uint8_t opcode = b0 & 0x0F;

    if (plen == 126) {
        if (client.available() < 2) return false;
        uint8_t p[2]; client.readBytes(p, 2);
        plen = ((uint64_t)p[0] << 8) | p[1];
    } else if (plen == 127) {
        if (client.available() < 8) return false;
        uint8_t p[8]; client.readBytes(p, 8);
        plen = 0;
        for (int i = 0; i < 8; i++) plen = (plen << 8) | p[i];
    }

    uint8_t mask[4] = {};
    if (masked) {
        if (client.available() < 4) return false;
        client.readBytes(mask, 4);
    }

    if ((size_t)client.available() < (size_t)plen) return false;

    if (opcode == 0x08) { while (plen--) client.read(); client.stop(); return false; }
    if (opcode == 0x09) {
        uint8_t pong[2] = { 0x8A, 0x00 };
        client.write(pong, 2);
        while (plen--) client.read();
        return false;
    }
    if (opcode != 0x01) { while (plen--) client.read(); return false; }

    out = "";
    out.reserve((size_t)plen + 1);
    for (uint64_t i = 0; i < plen; i++) {
        char c = (char)client.read();
        if (masked) c ^= mask[i % 4];
        out += c;
    }
    return true;
}

// ─── begin ────────────────────────────────────────────────────────────────────
void WebApi::begin() {
    _server.begin();
    LOG("[HTTP] WiFiServer started on port 80");
}

// ─── _checkNewConnection ──────────────────────────────────────────────────────
void WebApi::_checkNewConnection() {
    WiFiClient client = _server.available();
    if (!client) return;

    unsigned long t0 = millis();
    String req;
    req.reserve(HTTP_BUF_SIZE);
    while (client.connected() && (millis() - t0) < 300) {
        while (client.available()) {
            char c = client.read();
            req += c;
            if (req.endsWith("\r\n\r\n")) goto done_reading;
        }
    }
done_reading:
    int nl = req.indexOf('\n');
    String reqLine = (nl > 0) ? req.substring(0, nl) : req;
    String headers = (nl > 0) ? req.substring(nl + 1) : "";
    _handleHttpRequest(client, reqLine, headers);
}

// ─── _handleHttpRequest ───────────────────────────────────────────────────────
void WebApi::_handleHttpRequest(WiFiClient& client,
                                const String& reqLine,
                                const String& headers) {
    if (reqLine.startsWith("OPTIONS")) { _replyOptions(client); return; }

    bool isUpgrade = (headers.indexOf("Upgrade: websocket") >= 0 ||
                      headers.indexOf("upgrade: websocket") >= 0);
    bool isWsPath  = reqLine.indexOf("/ws") >= 0;

    if (isUpgrade && isWsPath) {
        if (_wsActive && _wsClient.connected()) {
            client.print("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n");
            client.stop();
            return;
        }
        if (_wsHandshake(client, headers)) {
            _wsClient = client;
            _wsActive = true;
            LOG("[WS] Client connected");
            const char* json = _buildStateJson();
            _wsSend(_wsClient, json, strlen(json));
        }
        return;
    }
    if (reqLine.startsWith("GET") && reqLine.indexOf("/status") >= 0)   { _replyStatus(client);   return; }
    if (reqLine.startsWith("GET") && reqLine.indexOf("/sessions") >= 0) { _replySessions(client); return; }
    // Root path → friendly info page (browser hits this directly)
    if (reqLine.startsWith("GET / ") || reqLine.startsWith("GET /\r")) { _replyRoot(client); return; }
    _replyNotFound(client);
}

// ─── _wsHandshake ─────────────────────────────────────────────────────────────
bool WebApi::_wsHandshake(WiFiClient& client, const String& headers) {
    const char* keyHeader = "Sec-WebSocket-Key: ";
    int keyIdx = headers.indexOf(keyHeader);
    if (keyIdx < 0) {
        client.print("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
        client.stop();
        return false;
    }
    keyIdx += strlen(keyHeader);
    int keyEnd = headers.indexOf('\r', keyIdx);
    if (keyEnd < 0) keyEnd = headers.indexOf('\n', keyIdx);
    String clientKey = headers.substring(keyIdx, keyEnd);
    clientKey.trim();

    String combined = clientKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    uint8_t digest[20];
    sha1((const uint8_t*)combined.c_str(), combined.length(), digest);
    String acceptKey = base64Encode(digest, 20);

    client.print("HTTP/1.1 101 Switching Protocols\r\n"
                 "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                 "Access-Control-Allow-Origin: *\r\n"
                 "Sec-WebSocket-Accept: ");
    client.print(acceptKey);
    client.print("\r\n\r\n");
    return true;
}

// ─── HTTP reply helpers ───────────────────────────────────────────────────────
void WebApi::_replyStatus(WiFiClient& client) {
    const char* json = _buildStateJson();
    size_t len = strlen(json);
    client.print("HTTP/1.1 200 OK\r\n");
    client.print(CORS_HEADER);
    client.print("Content-Type: application/json\r\nContent-Length: ");
    client.print((unsigned int)len);
    client.print("\r\n\r\n");
    client.print(json);
    client.stop();
}

void WebApi::_replySessions(WiFiClient& client) {
    String body = _session.listSessions();
    client.print("HTTP/1.1 200 OK\r\n");
    client.print(CORS_HEADER);
    client.print("Content-Type: application/json\r\nContent-Length: ");
    client.print(body.length());
    client.print("\r\n\r\n");
    client.print(body);
    client.stop();
}

void WebApi::_replyOptions(WiFiClient& client) {
    client.print("HTTP/1.1 200 OK\r\n");
    client.print(CORS_HEADER);
    client.print("Access-Control-Allow-Methods: GET, OPTIONS\r\n"
                 "Access-Control-Allow-Headers: Content-Type\r\n"
                 "Content-Length: 0\r\n\r\n");
    client.stop();
}

void WebApi::_replyRoot(WiFiClient& client) {
    // Browsers opening the board IP directly get a useful info response
    // instead of a 404. The Web UI is served from the developer's local server.
    static const char BODY[] =
        "{\"board\":\"honey_please\",\"version\":\""
        "1.5.0"
        "\","
        "\"endpoints\":{\"/status\":\"GET – JSON snapshot\","
        "\"/ws\":\"WebSocket – 10 Hz state frames\","
        "\"/sessions\":\"GET – session ring buffer JSONL\"},"
        "\"webui\":\"Serve data/ from your local dev server and point it at this IP\"}";
    char lenBuf[6];
    snprintf(lenBuf, sizeof(lenBuf), "%u", (unsigned)strlen(BODY));
    client.print("HTTP/1.1 200 OK\r\n");
    client.print(CORS_HEADER);
    client.print("Content-Type: application/json\r\nContent-Length: ");
    client.print(lenBuf);
    client.print("\r\n\r\n");
    client.print(BODY);
    client.stop();
}

void WebApi::_replyNotFound(WiFiClient& client) {
    client.print("HTTP/1.1 404 Not Found\r\n");
    client.print(CORS_HEADER);
    client.print("Content-Type: application/json\r\nContent-Length: 21\r\n\r\n"
                 "{\"error\":\"not found\"}");
    client.stop();
}

// ─── _wsProcessIncoming ───────────────────────────────────────────────────────
void WebApi::_wsProcessIncoming() {
    if (!_wsActive) return;
    if (!_wsClient.connected()) {
        LOG("[WS] Client disconnected");
        _wsActive = false;
        _wsClient.stop();
        return;
    }
    String frame;
    if (wsReadFrame(_wsClient, frame)) {
        _handleCommand(frame);
        const char* json = _buildStateJson();
        _wsSend(_wsClient, json, strlen(json));
    }
}

// ─── _broadcastState ──────────────────────────────────────────────────────────
void WebApi::_broadcastState() {
    if (!_wsActive || !_wsClient.connected()) return;
    const char* json = _buildStateJson();
    _wsSend(_wsClient, json, strlen(json));
}

// ─── _handleCommand ───────────────────────────────────────────────────────────
void WebApi::_handleCommand(const String& json) {
    JsonDocument doc;
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        LOG("[WS] Bad JSON"); return;
    }

    const char* cmd = doc["cmd"] | "";
    LOG("[WS] cmd=" + String(cmd));

    if (strcmp(cmd, "target") == 0) {
        if (_errors.hasCritical()) return;
        _driver.enable();
        _ramp.setTarget(doc["value"] | 0.0f);

    } else if (strcmp(cmd, "stop") == 0) {
        _ramp.setTarget(0.0f);

    } else if (strcmp(cmd, "estop") == 0) {
        _ramp.emergencyStop();
        _errors.trigger(ErrorCode::EMERGENCY_STOP, "E-Stop via Web UI");
        _session.logError("E09", "E-Stop via Web UI");

    } else if (strcmp(cmd, "resetfault") == 0) {
        if (_simDriver.isFault() || !_simRpm.isHealthy()) {
            LOG("[WS] Cannot reset: active injected fault"); return;
        }
        _ramp.emergencyStop();
        _errors.clearAll();
        _session.logEvent("ERROR_CLEARED");

    } else if (strcmp(cmd, "dir") == 0) {
        if (_errors.hasCritical()) return;
        const char* val = doc["value"] | "cw";
        bool targetCw = (strcmp(val, "cw") == 0);
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
        }

    } else if (strcmp(cmd, "params_save") == 0) {
        saveParams(_params);
        LOG("[WS] Params saved to EEPROM");

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
        _program.abort();

    } else if (strcmp(cmd, "session_start") == 0) {
        if (!_session.isActive()) {
            extern const char* FIRMWARE_VERSION_STR;
            _session.start(String(FIRMWARE_VERSION_STR),
                           _params.max_rpm, _program.stepCount());
        }

    } else if (strcmp(cmd, "session_stop") == 0) {
        if (_session.isActive()) {
            _session.stop(0, 0, _program.currentStep());
        }
    }
}

// ─── tick ─────────────────────────────────────────────────────────────────────
void WebApi::tick() {
    _checkNewConnection();
    _wsProcessIncoming();
    const unsigned long now = millis();
    if (now - _lastBroadcast >= 100UL) {
        _lastBroadcast = now;
        _broadcastState();
    }
}

