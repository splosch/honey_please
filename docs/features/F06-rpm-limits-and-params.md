# F06 – RPM Limits & Parameters

**Status:** Planning  
**Depends on:** [F01 – Motor Control Architecture](./F01-motor-control-architecture.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md), [F03 – Ramps](./F03-acceleration-deceleration-ramps.md), [F07 – Web UI](./F07-webui-schematic-view.md)

---

## 1. Goal

Define all configurable operational parameters, their defaults, limits, and persistence. Parameters must be adjustable via the Web UI and survive power cycles.

---

## 2. Parameter Table

| Parameter | Key | Default | Min | Max | Unit | Persistent |
|---|---|---|---|---|---|---|
| Maximum RPM (operator limit) | `max_rpm` | 100 | 10 | 300 | RPM | Yes |
| Acceleration rate | `accel_rate` | 10 | 1 | 50 | RPM/s | Yes |
| Deceleration rate | `decel_rate` | 15 | 1 | 50 | RPM/s | Yes |
| Direction change pause | `dir_pause_ms` | 2000 | 500 | 10000 | ms | Yes |
| RPM sensor zero timeout | `zero_timeout_ms` | 2000 | 500 | 5000 | ms | Yes |
| Stall detection threshold | `stall_rpm_min` | 5 | 1 | 20 | RPM | Yes |
| Stall detection duration | `stall_detect_s` | 3 | 1 | 10 | s | Yes |
| PWM frequency | `pwm_freq_hz` | 1000 | 100 | 20000 | Hz | Yes |
| Physical max RPM (hard limit) | `phys_max_rpm` | 300 | — | — | RPM | No (compile-time) |

### Notes

- `max_rpm` is the **operator-configurable ceiling**. The UI slider caps at this value.
- `phys_max_rpm = 300` is a **compile-time hard limit** (`#define PHYSICAL_MAX_RPM 300`). Exceeding it triggers E04_OVERSPEED and EMERGENCY_STOP regardless of any other setting.
- `max_rpm` can never be set above `phys_max_rpm`. The firmware rejects such commands with `E07_PARAM_INVALID`.

---

## 3. Persistence

Parameters are stored in ESP32 NVS (Non-Volatile Storage) via the Arduino `Preferences` library.

```cpp
// params.h
struct MotorParams {
    uint16_t max_rpm        = 100;
    uint8_t  accel_rate     = 10;
    uint8_t  decel_rate     = 15;
    uint16_t dir_pause_ms   = 2000;
    uint16_t zero_timeout   = 2000;
    uint8_t  stall_rpm_min  = 5;
    uint8_t  stall_detect_s = 3;
    uint16_t pwm_freq_hz    = 1000;
};

void loadParams(MotorParams& p);
void saveParams(const MotorParams& p);
void resetToDefaults(MotorParams& p);
```

Namespace: `"motor_params"` in NVS.

---

## 4. Parameter Validation

Every incoming `SET_PARAMS` command is validated before application:

```cpp
bool validateParams(const MotorParams& p) {
    if (p.max_rpm < 10 || p.max_rpm > PHYSICAL_MAX_RPM) return false;
    if (p.accel_rate < 1 || p.accel_rate > 50) return false;
    if (p.decel_rate < 1 || p.decel_rate > 50) return false;
    if (p.dir_pause_ms < 500 || p.dir_pause_ms > 10000) return false;
    // ... etc.
    return true;
}
```

Invalid parameters are rejected. The current parameter set is unchanged. UI highlights the invalid field in red.

---

## 5. Web UI – Parameters Panel

A collapsible panel (sidebar or bottom drawer) with:

```
┌─────────────────────────────────────────────────┐
│ ⚙ PARAMETERS                          [RESET]   │
├─────────────────────────────────────────────────┤
│ Max RPM        [──────────●──────] 100  /300    │
│ Accel rate     [──●──────────────]  10 RPM/s    │
│ Decel rate     [────●─────────────] 15 RPM/s    │
│ Dir pause      [──────●───────────] 2000 ms     │
│ PWM Frequency  [───────────────●─] 1000 Hz      │
│                        [APPLY]  [CANCEL]        │
└─────────────────────────────────────────────────┘
```

- Changes are **staged** (not applied until [APPLY]).
- [APPLY] sends a `SET_PARAMS` command.
- If the ESP32 rejects any value, the UI restores the previous value and highlights the rejected field.
- [RESET] restores factory defaults and sends `SET_PARAMS` with defaults.

---

## 6. Parameter Impact Visualization

When the user drags a slider, the UI previews the effect:

- **Max RPM slider:** Updates the gauge max scale in real time.
- **Accel rate slider:** Updates the estimated ramp duration text: `"~X s to reach max RPM"`.
- **Decel rate slider:** Updates: `"~X s to stop from max RPM"`.
- **Dir pause slider:** Updates: `"Direction change takes ~X s total"`.

---

## 7. Acceptance Criteria

- [ ] Default values load on first boot (no NVS data)
- [ ] Modified params persist across power cycle (verified by reboot + param check)
- [ ] `max_rpm > 300` rejected by firmware with `E07_PARAM_INVALID`
- [ ] UI slider for max_rpm physically stops at 300 and defaults to 100
- [ ] Parameter changes take effect on next motor command (not mid-ramp unless safe)
- [ ] Factory reset button in UI triggers `resetToDefaults()` and reloads UI
