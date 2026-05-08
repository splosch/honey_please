// src/web_api.h
// WebSocket server – broadcasts system state JSON at 10 Hz.
//
// WebSocket endpoint: ws://<ip>/ws
// Frame rate: 10 Hz (every 100 ms, called from loop())
//
// Outbound message format (JSON):
// {
//   "rpm":       80.0,
//   "target":    80.0,
//   "eta":       0.0,
//   "state":     "RUNNING",         // IDLE | RAMPING_UP | RUNNING | RAMPING_DOWN | DIR_CHANGE_PAUSE
//   "duty":      68,
//   "dir":       "CW",              // CW | CCW
//   "enabled":   true,
//   "fault":     false,
//   "sim":       true,
//   "critical":  false,
//   "errors":    [{"code":6,"msg":"...","ts":12345}],
//   "params":    {"max_rpm":100,"accel":10,"decel":15,"dir_pause":2000},
//   "uptime":    84521
// }
//
// Inbound message format (JSON):
// { "cmd": "target",    "value": 80   }
// { "cmd": "stop"                     }
// { "cmd": "estop"                    }
// { "cmd": "resetfault"               }
// { "cmd": "dir",       "value": "cw" }
// { "cmd": "set_param",       "key": "accel", "value": 20 }
// { "cmd": "prog_start"                                    }
// { "cmd": "prog_skip"                                     }
// { "cmd": "prog_pause"                                    }
// { "cmd": "prog_resume"                                   }
// { "cmd": "prog_abort"                                    }
// { "cmd": "session_start"                                 }
// { "cmd": "session_stop"                                  }
// { "cmd": "params_save"                                   }
#pragma once
#include <ESPAsyncWebServer.h>
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
    AsyncWebServer&    _server;
    AsyncWebSocket     _ws;

    IMotorDriver&      _driver;
    IRpmSource&        _rpm;
    RampController&    _ramp;
    ErrorHandler&      _errors;
    MotorParams&       _params;

    // Concrete impl refs for fault injection (sim only)
    SimMotorDriver&    _simDriver;
    SimRpmSource&      _simRpm;

    // Phase 4
    ProgramRunner&     _program;
    SessionLogger&     _session;

    unsigned long _lastBroadcast = 0;

    // P2-B: per-client rate-limit timestamps (max 50 ms between commands)
    // P2-F: per-client frame accumulation buffer for fragmented WS frames
    static constexpr uint8_t WS_RATE_SLOTS = 8;
    uint32_t _lastCmdMs[WS_RATE_SLOTS] = {};
    String   _frameBuf[WS_RATE_SLOTS];

    void handleCommand(AsyncWebSocketClient* client, const String& json);
    void broadcastState();

public:
    WebApi(AsyncWebServer& server,
           IMotorDriver& driver, IRpmSource& rpm,
           RampController& ramp, ErrorHandler& errors, MotorParams& params,
           SimMotorDriver& simDriver, SimRpmSource& simRpm,
           ProgramRunner& program, SessionLogger& session)
        : _server(server), _ws("/ws"),
          _driver(driver), _rpm(rpm), _ramp(ramp),
          _errors(errors), _params(params),
          _simDriver(simDriver), _simRpm(simRpm),
          _program(program), _session(session) {}

    void begin();

    // Call every loop() iteration – broadcasts at 10 Hz
    void tick();
};
