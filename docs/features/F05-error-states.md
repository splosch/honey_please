# F05 – Error States

**Status:** Planning  
**Depends on:** [F01 – Motor Control Architecture](./F01-motor-control-architecture.md), [F02 – RPM Monitoring](./F02-rpm-monitoring.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md), [F07 – Web UI Schematic View](./F07-webui-schematic-view.md), [F10 – Extraction Session](./F10-extraction-session.md)

---

## 1. Goal

Give the operator an unambiguous, always-visible indication of any fault condition. The system must never silently fail. Every error state must be detectable from the Web UI without reading log text.

---

## 2. Error Code Registry

| Code | Severity | Trigger Condition | Motor Action | Recovery |
|---|---|---|---|---|
| `E01_WIFI_LOST` | WARNING | WiFi RSSI drops / connection lost | None (motor keeps running) | Auto-reconnect; UI shows warning banner |
| `E02_WEBSOCKET_LOST` | WARNING | Browser WebSocket disconnects | None (motor keeps running) | UI reconnects automatically |
| `E03_RPM_SENSOR_LOST` | ERROR | No pulse for > `ZERO_RPM_TIMEOUT_MS` while powered | EMERGENCY_STOP | Operator must reset |
| `E04_OVERSPEED` | CRITICAL | Measured RPM > 300 (physical max) | EMERGENCY_STOP | Operator must reset |
| `E05_STALL` | WARNING | Power > 20 % but RPM < 5 for > 3 s | Reduce to idle | Operator decides action |
| `E06_DRIVER_FAULT` | CRITICAL | nFAULT pin = LOW (driver thermal/overcurrent) | EMERGENCY_STOP | Wait for driver cool-down, operator reset |
| `E07_PARAM_INVALID` | ERROR | Incoming param outside allowed range | Reject param, keep current | Auto-corrected, UI flashes invalid field |
| `E08_RAMP_DEVIATION` | WARNING | Actual RPM deviates > 10 from projected for > 2 s | Log only | Operator observes |
| `E09_EMERGENCY_STOP` | CRITICAL | Operator-triggered or auto-triggered | PWM = 0 immediately | Explicit operator reset required |

---

## 3. Error Severity Levels

| Level | Color | UI Behavior | Motor Stops? |
|---|---|---|---|
| WARNING | Yellow | Non-blocking banner; component outline turns yellow | No |
| ERROR | Orange | Modal overlay on affected component; blinking border | Depends |
| CRITICAL | Red | Full-screen red overlay; alarm icon; requires operator confirm to clear | Yes |

---

## 4. EMERGENCY_STOP Behavior

- PWM duty set to 0 **immediately** (no ramp).
- Direction GPIOs → LOW (COAST mode).
- Enable GPIO → LOW (driver disabled).
- State machine → `FAULT_STOP`.
- Session protocol entry written with timestamp and cause.
- Web UI: full red overlay on all components, flashing border on the component that triggered the stop.
- **Recovery:** Operator must click "RESET FAULT" button on the UI. This re-enables the driver and returns to `IDLE`. Does not auto-restart any program.

---

## 5. Firmware Error Handling

```cpp
// error_handler.h
enum ErrorCode {
    ERR_NONE = 0,
    ERR_RPM_SENSOR_LOST,
    ERR_OVERSPEED,
    ERR_STALL,
    ERR_DRIVER_FAULT,
    ERR_PARAM_INVALID,
    ERR_RAMP_DEVIATION,
    ERR_EMERGENCY_STOP
};

struct SystemError {
    ErrorCode   code;
    const char* message;
    uint32_t    timestamp_ms;
    bool        active;
};

void triggerError(ErrorCode code);
void clearError(ErrorCode code);       // only for non-critical
void clearAllErrors();                 // only on explicit operator reset
bool hasActiveCritical();
```

Error state is included in every WebSocket broadcast frame:

```json
{
  "errors": [
    { "code": "E06_DRIVER_FAULT", "msg": "Driver thermal shutdown", "ts": 84521 }
  ]
}
```

---

## 6. Web UI Error Presentation

### Component-Level Errors

Each component box in the schematic (R4 WiFi, Motor Controller, Motor) shows an error badge overlay:

```
  ┌─────────────────────────────┐
  │ ⚠ MOTOR CONTROLLER          │  ← yellow/orange/red background
  │ nFAULT: LOW                 │
  │ E06 – Driver Fault          │
  │ [RESET FAULT]               │
  └─────────────────────────────┘
```

### Error Log Panel (collapsible)

At the bottom of the UI: a scrollable list of all errors with timestamp, code, message, and whether they are resolved.

### Audio (optional / configurable)

Browser `AudioContext` plays a short beep tone on CRITICAL errors. Can be muted via UI toggle.

---

## 7. Fault Persistence

Active errors persist across WebSocket reconnects. A reconnecting browser immediately receives the current error state in the initial connection handshake frame:

```json
{
  "type": "INITIAL_STATE",
  "state": "FAULT_STOP",
  "errors": [ ... ]
}
```

---

## 8. Acceptance Criteria

- [ ] Every error code triggers correct motor action within one `loop()` cycle
- [ ] CRITICAL errors require explicit operator reset before motor can run again
- [ ] Error state visible on Web UI within 500 ms of fault trigger
- [ ] Reconnecting browser receives current error state immediately
- [ ] All errors logged to session protocol with timestamp
- [ ] nFAULT pin polling at ≥ 20 Hz (inside `loop()`, not ISR)
- [ ] E09 (EMERGENCY_STOP button on UI) cuts PWM within 100 ms of button press
