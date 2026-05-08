# F01 – Motor Control Architecture

**Status:** In Development (HAL layer – Phase 1)  
**Depends on:** [Initial Setup](../initial_esp32_setup.md), [F06 – RPM Limits & Params](./F06-rpm-limits-and-params.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md)

> **Development approach:** The firmware is built against a `IMotorDriver` abstract interface from day one. `SimMotorDriver` (no GPIO, synthetic RPM) is used in Phases 1–4 so the full application can be developed and UI-tested without any hardware. `RealMotorDriver` replaces it in Phase 5 once the physical driver chip and wiring are confirmed. No calling code changes when swapping.

---

## 1. System Components

```
[ Browser / Web UI ]
        │  HTTP + WebSocket
        ▼
[ ESP32 (192.168.178.64) ]
   - WiFi / OTA
   - Async Web Server
   - RampController
   - StateMachine
   - ErrorHandler
        │  calls IMotorDriver interface
        ▼
[ IMotorDriver ]  ◄── abstract HAL boundary
   │
   ├─ SimMotorDriver   (Phase 1–4: no GPIO, synthetic RPM)
   │
   └─ RealMotorDriver  (Phase 5: PWM + GPIO, deferred)
              │  PWM + Direction GPIO
              ▼
        [ Motor Controller ]
           (type TBD – see §3, Phase 5)
              │  Motor power lines
              ▼
        [ Motor – Honigschleuder ]
           (type TBD – see §4, Phase 5)
```

---

## 2. HAL Interface: `IMotorDriver`

This interface is the **only** thing `RampController`, `ErrorHandler`, and `WebApi` ever call. It is defined now and does not change when the real driver is added.

```cpp
// src/motor_driver.h
class IMotorDriver {
public:
    virtual void    begin()                     = 0;
    virtual void    setDutyCycle(uint8_t duty)  = 0;  // 0–255
    virtual void    setDirection(bool cw)       = 0;
    virtual void    enable()                    = 0;
    virtual void    disable()                   = 0;
    virtual bool    isFault()                   = 0;  // reads nFAULT (or injected)
    virtual uint8_t getDutyCycle()        const = 0;
    virtual bool    getDirection()        const = 0;
    virtual bool    isEnabled()           const = 0;
    virtual ~IMotorDriver() {}
};
```

### SimMotorDriver (Phase 1 – builds today)

```cpp
// src/sim_motor_driver.h
class SimMotorDriver : public IMotorDriver {
    uint8_t _duty    = 0;
    bool    _cw      = true;
    bool    _enabled = false;
    bool    _fault   = false;  // injectable via F08 fault injection panel
public:
    void    begin()                     override { LOG("[SIM] Motor driver ready"); }
    void    setDutyCycle(uint8_t duty)  override { _duty = duty; }
    void    setDirection(bool cw)       override { _cw = cw; }
    void    enable()                    override { _enabled = true; }
    void    disable()                   override { _enabled = false; }
    bool    isFault()                   override { return _fault; }
    uint8_t getDutyCycle()        const override { return _duty; }
    bool    getDirection()        const override { return _cw; }
    bool    isEnabled()           const override { return _enabled; }
    void    injectFault(bool f)         { _fault = f; }  // F08 fault injection
};
```

### RealMotorDriver (Phase 5 – deferred until hardware confirmed)

```cpp
// src/real_motor_driver.h  – skeleton only; fills in when §5 questions are answered
class RealMotorDriver : public IMotorDriver {
public:
    void begin() override;
    void setDutyCycle(uint8_t duty) override;
    void setDirection(bool cw) override;
    void enable() override;
    void disable() override;
    bool isFault() override;
    uint8_t getDutyCycle() const override;
    bool getDirection() const override;
    bool isEnabled() const override;
};
```

### Driver Selection in `main.cpp`

```cpp
#if defined(REAL_HARDWARE)
    RealMotorDriver motorDriver;
#else
    SimMotorDriver  motorDriver;  // default until Phase 5
#endif
IMotorDriver* driver = &motorDriver;  // all modules use this pointer
```

Switching from sim to real requires only adding `-DREAL_HARDWARE` to `build_flags` in `platformio.ini` and implementing `RealMotorDriver`. Zero changes to any calling code.

---

## 3. ESP32 Pin Assignments (Phase 5 – deferred)

> ⚠️ **Not needed until Phase 5.** No GPIO code is written before the driver chip and schematic are confirmed.  
> The table below uses placeholder values only.

| Signal | ESP32 GPIO | Direction | Notes |
|---|---|---|---|
| PWM Speed | GPIO 18 | OUT | LEDC channel 0, freq TBD |
| Motor Direction A | GPIO 19 | OUT | High = forward (CW) |
| Motor Direction B | GPIO 21 | OUT | High = reverse (CCW) |
| RPM Sensor | GPIO 34 | IN | Hall/optical interrupt, input-only pin |
| Enable / nSLEEP | GPIO 22 | OUT | Pull high to enable driver |
| Fault / nFAULT | GPIO 35 | IN | Active-low fault signal from driver |

> Update this table and all `#define` constants in `src/motor_config.h` when the schematic is confirmed.

---

## 4. Motor Controller (TBD – Phase 5)

❓ **Open question – please clarify which driver is used:**

| Option | Chip | Max Current | Direction Control | Fault Pin |
|---|---|---|---|---|
| A | L298N | 2 A | 2x GPIO (IN1/IN2) | No |
| B | DRV8833 | 1.5 A | 2x GPIO (IN1/IN2) | Yes (nFAULT) |
| C | DRV8871 | 3.6 A | 2x GPIO (IN1/IN2) | Yes (nFAULT) |
| D | BTS7960 | 43 A | PWM+DIR | No (overcurrent via IS pin) |

The architecture above assumes a **PWM + 2-pin direction** interface. Adjust if the actual driver uses a different scheme (e.g., separate PWM lines per direction).

---

## 5. Motor (Honigschleuder – TBD – Phase 5)

❓ **Open question – confirm motor specs:**

| Property | Value |
|---|---|
| Type | DC brushed / brushless |
| Voltage | TBD (12 V / 24 V) |
| Rated current | TBD |
| Max RPM | TBD (physical limit → see F06: hard-coded to 300 RPM) |
| Gear ratio (if any) | TBD |

---

## 6. Firmware Module Structure

```
src/
  main.cpp                – setup(), loop(), OTA, WebSerial
  motor_driver.h          – IMotorDriver interface          [Phase 1 – NOW]
  sim_motor_driver.h      – SimMotorDriver implementation   [Phase 1 – NOW]
  rpm_source.h            – IRpmSource interface            [Phase 1 – NOW]
  sim_rpm_source.h        – SimRpmSource (reads RampCtrl)   [Phase 1 – NOW]
  ramp_controller.h/cpp   – Linear ramp, 20 Hz tick         [Phase 2]
  direction_control.h/cpp – Safe direction change sequence  [Phase 2]
  error_handler.h/cpp     – All error codes E01–E09         [Phase 2]
  params.h/cpp            – NVS persistence                 [Phase 2]
  web_api.h/cpp           – REST + WebSocket endpoints      [Phase 3]
  session.h/cpp           – LittleFS event log              [Phase 4]
  motor_config.h          – Pin defines, PWM constants      [Phase 5]
  real_motor_driver.h/cpp – RealMotorDriver implementation  [Phase 5]
  real_rpm_source.h/cpp   – ISR-based RPM measurement       [Phase 5]
```

Each module has a single responsibility. `main.cpp` only wires them together.  
All hardware-specific files are isolated in the `real_*` modules – nothing else touches GPIO.

---

## 7. Communication Protocol (ESP32 ↔ Browser)

All real-time data flows over a single WebSocket endpoint (`/ws`).

### ESP32 → Browser (JSON frames, ~100 ms interval)

```json
{
  "rpm":        45,
  "rpm_target": 60,
  "direction":  "CW",
  "state":      "RAMPING_UP",
  "fault":      false,
  "pins": {
    "pwm":     18,
    "dir_a":   19,
    "dir_b":   21,
    "enable":  22,
    "rpm_in":  34,
    "fault_in":35
  },
  "pin_states": {
    "18": 1,
    "19": 1,
    "21": 0,
    "22": 1,
    "34": 0,
    "35": 1
  }
}
```

### Browser → ESP32 (JSON commands)

```json
{ "cmd": "SET_SPEED",    "rpm": 80 }
{ "cmd": "SET_DIRECTION","dir": "CCW" }
{ "cmd": "STOP" }
{ "cmd": "PAUSE" }
{ "cmd": "RESUME" }
{ "cmd": "EMERGENCY_STOP" }
{ "cmd": "SET_PARAMS",   "max_rpm": 100, "accel_rate": 10, "decel_rate": 15 }
{ "cmd": "SIM_MODE",     "enable": true }
{ "cmd": "START_SESSION" }
{ "cmd": "STOP_SESSION" }
```

---

## 8. Motor State Machine

```
       ┌──────────────────────────────────────────────┐
       │                   IDLE                       │
       └──────────┬───────────────────────────────────┘
                  │ SET_SPEED / START_SESSION
                  ▼
       ┌──────────────────────────────────────────────┐
       │               RAMPING_UP                     │◄──────────────┐
       └──────────┬───────────────────────────────────┘               │
                  │ target RPM reached                                 │ RESUME
                  ▼                                                    │
       ┌──────────────────────────────────────────────┐               │
       │               RUNNING                        │               │
       └──────┬────────────────┬──────────────────────┘               │
              │ PAUSE          │ direction change request              │
              ▼                ▼                                       │
       ┌────────────┐   ┌──────────────────┐                          │
       │   PAUSED   │   │  RAMPING_DOWN    │──► DIRECTION_CHANGE ─────┘
       └────────────┘   └──────────────────┘     (0 RPM reached,
                                │ STOP            dir flipped)
                                ▼
                        ┌──────────────┐
                        │     IDLE     │
                        └──────────────┘
                               ▲
                   FAULT ──────┴──── (from any state → FAULT_STOP)
```

States are broadcast in every WebSocket frame so the UI always reflects reality.

---

## 9. Acceptance Criteria

### Phase 1 – HAL (verifiable now, no hardware)
- [ ] `IMotorDriver` compiles without errors
- [ ] `SimMotorDriver` can be instantiated and all methods return correct internal state
- [ ] `injectFault(true)` causes `isFault()` to return `true`
- [ ] `driver` pointer resolves to `SimMotorDriver` in default (non-`REAL_HARDWARE`) build
- [ ] All state transitions are logged via `LOG()` macro with `[MOTOR]` tag
- [ ] WebSocket frame rate ≥ 10 Hz under normal operation (sim)

### Phase 5 – Hardware (requires physical setup)
- [ ] PWM output measurable with oscilloscope / multimeter on target GPIO
- [ ] Direction GPIO toggles correctly for CW / CCW commands
- [ ] Enable pin held HIGH during operation, pulled LOW on EMERGENCY_STOP
- [ ] nFAULT pin triggers `FAULT_STOP` state within one `loop()` cycle

---

## 10. Open Questions

> These questions block **Phase 5 only**. All of Phases 1–4 proceed without answers.

| # | Question | Needed before |
|---|---|---|
| Q1 | Motor driver chip? | `RealMotorDriver.begin()` |
| Q2 | Motor voltage / current? | Driver selection |
| Q3 | RPM sensor type (Hall / optical / encoder)? | `RealRpmSource` ISR |
| Q4 | Gear ratio (basket RPM ≠ motor RPM)? | RPM display calibration |
| Q5 | PWM frequency for chosen driver? | LEDC config in `motor_config.h` |
| Q6 | Exact pin wiring (schematic or photo)? | Any `#define PIN_*` constant |
