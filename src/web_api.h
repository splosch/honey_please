// src/web_api.h
// HTTP + WebSocket server for Arduino Uno R4 WiFi (M6.4–M6.7)
//
// R4 migration (2026-05-16):
//   ESPAsyncWebServer + AsyncTCP + FreeRTOS removed.
//   Replaced with synchronous WiFiServer/WiFiClient (single-threaded loop).
//   WebSocket handshake performed manually (SHA1 + Base64 in web_api.cpp).
//   Supports one WebSocket client at a time (one browser tab).
//   CORS: Access-Control-Allow-Origin: * on all HTTP responses (M6.6).
//
// Endpoints:
//   WS   /ws        – 10 Hz JSON state broadcast; accepts command frames
//   GET  /status    – JSON snapshot (M6.7)
//   GET  /sessions  – session ring-buffer list / export (M6.9 integration)
//   OPTIONS *       – CORS preflight (M6.6)
//
// WebSocket JSON protocol: unchanged from ESP32 version (see file header below)
//
// Outbound frame:
// { "rpm":0,"target":0,"eta":0,"state":"IDLE","duty":0,"dir":"CW",
//   "enabled":false,"fault":false,"sim":true,"critical":false,
//   "errors":[],"params":{...},"prog":{...},"session":{...},"uptime":0 }
//
// Inbound commands: target, stop, estop, resetfault, dir, set_param,
//   prog_start/skip/pause/resume/abort, session_start/stop, params_save,
//   inject_fault
#pragma once
#include <WiFiS3.h>
#include <ArduinoJson.h>
#include "params.h"
#include "motor_driver.h"
#include "rpm_source.h"
#include "ramp_controller.h"
#include "error_handler.h"
#include "sim_rpm_source.h"
#include "program.h"
#include "session.h"

class WebApi {
    WiFiServer  _server;

    // Active WebSocket client (at most one connection at a time)
    WiFiClient  _wsClient;
    bool        _wsActive  = false;

    // HTTP read buffer – re-used per request to avoid heap churn
    // Large enough for typical HTTP request headers (~600 bytes)
    static constexpr size_t HTTP_BUF_SIZE = 700;

    // Subsystem references
    IMotorDriver&   _driver;
    IRpmSource&     _rpm;
    RampController& _ramp;
    ErrorHandler&   _errors;
    MotorParams&    _params;
    SimMotorDriver& _simDriver;
    SimRpmSource&   _simRpm;
    ProgramRunner&  _program;
    SessionLogger&  _session;

    unsigned long _lastBroadcast = 0;

    // ── Internal helpers ──────────────────────────────────────────────────────
    void _checkNewConnection();
    void _handleHttpRequest(WiFiClient& client, const String& reqLine, const String& headers);
    bool _wsHandshake(WiFiClient& client, const String& headers);
    void _wsSend(WiFiClient& client, const char* payload, size_t len);
    void _wsProcessIncoming();
    void _handleCommand(const String& json);
    void _broadcastState();
    const char* _buildStateJson();

    // Helpers for HTTP responses with CORS headers
    void _replyStatus(WiFiClient& client);
    void _replySessions(WiFiClient& client);
    void _replyOptions(WiFiClient& client);
    void _replyNotFound(WiFiClient& client);

public:
    WebApi(IMotorDriver& driver, IRpmSource& rpm,
           RampController& ramp, ErrorHandler& errors, MotorParams& params,
           SimMotorDriver& simDriver, SimRpmSource& simRpm,
           ProgramRunner& program, SessionLogger& session)
        : _server(80),
          _driver(driver), _rpm(rpm), _ramp(ramp),
          _errors(errors), _params(params),
          _simDriver(simDriver), _simRpm(simRpm),
          _program(program), _session(session) {}

    void begin();

    // Call every loop() iteration – handles new connections and 10 Hz broadcast.
    void tick();
};
