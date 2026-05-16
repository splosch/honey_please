# F03 – Acceleration / Deceleration Ramps

**Status:** Planning  
**Depends on:** [F01 – Motor Control Architecture](./F01-motor-control-architecture.md), [F02 – RPM Monitoring](./F02-rpm-monitoring.md), [F06 – RPM Limits & Params](./F06-rpm-limits-and-params.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md), [F04 – Direction Control](./F04-direction-control.md), [F09 – Multi-Step Program](./F09-multistep-program.md)

---

## 1. Goal

Protect the mechanical system and honey by never changing motor speed instantaneously. All speed changes follow a configurable linear ramp. The Web UI must visualize the ramp in real time so the operator can judge if the motor is behaving as expected.

---

## 2. Ramp Parameters

Stored persistently via `EEPROM` (8 KB emulated flash on R4 WiFi). Adjustable via Web UI and REST API.

| Parameter | Default | Min | Max | Unit | Description |
|---|---|---|---|---|---|
| `accel_rate` | 10 | 1 | 50 | RPM/s | Speed increase per second during ramp-up |
| `decel_rate` | 15 | 1 | 50 | RPM/s | Speed decrease per second during ramp-down |
| `max_rpm` | 100 | 10 | 300 | RPM | Commanded speed ceiling (F06) |
| `dir_change_pause_ms` | 2000 | 500 | 10000 | ms | Pause at 0 RPM before reversing direction |

---

## 3. Ramp Algorithm

The ramp runs inside a periodic timer task (every 50 ms = 20 Hz update rate).

```
// Each tick (dt = 50 ms):
float step = accel_rate * (dt / 1000.0f);   // RPM to add per tick

if (current_rpm < target_rpm)
    current_rpm = min(current_rpm + step_accel, target_rpm);
else if (current_rpm > target_rpm)
    current_rpm = max(current_rpm - step_decel, target_rpm);

pwm_duty = rpmToDuty(current_rpm);
setMotorPwm(pwm_duty);
```

`rpmToDuty()` maps RPM linearly to 0–255 PWM duty cycle. Calibrate with actual motor load.

---

## 4. Ramp States & Transitions

| From → To | Trigger | Ramp used |
|---|---|---|
| 0 → target_rpm | SET_SPEED or START_SESSION step | Accel ramp |
| target_rpm → 0 | STOP | Decel ramp |
| target_rpm_A → target_rpm_B (B > A) | Speed step increase | Accel ramp from current speed |
| target_rpm_A → target_rpm_B (B < A) | Speed step decrease | Decel ramp from current speed |
| any → 0 → (direction flip) → target_rpm | Direction change (F04) | Decel + pause + accel |
| any → 0 (immediate) | EMERGENCY_STOP | No ramp – PWM cut immediately |

---

## 5. Ramp Duration Estimates

```
Time to ramp from 0 → 100 RPM with accel_rate = 10 RPM/s:
    100 / 10 = 10 seconds

Time to ramp from 100 → 0 RPM with decel_rate = 15 RPM/s:
    100 / 15 ≈ 6.7 seconds

Direction change total (100 → 0 → 100 RPM):
    6.7 s + 2 s pause + 10 s = 18.7 s
```

These durations are always shown as a countdown on the Web UI.

---

## 6. Web UI Visualization

### Ramp Progress Bar

A horizontal bar spanning the full width of the motor component box:

```
Current RPM   ████████████████░░░░░░░░  Target RPM
    45 RPM   [===========================] 100 RPM
             ▲ RAMPING UP  ~5.5 s remaining
```

Color:
- Ramping up → Blue fill
- Ramping down → Orange fill
- At target → Green fill
- Pausing → Gray fill (pulse animation)

### Ramp Curve Overlay (in session timeline)

A thin projected line overlaid on the RPM sparkline showing where the ramp is expected to go. When the actual RPM deviates from the projection by > 10 RPM for > 2 seconds, the deviation area is highlighted in red.

---

## 7. Firmware Module: `ramp_controller.h/cpp`

```cpp
class RampController {
public:
    void setTarget(float rpm);
    void tick();                   // call every 50 ms from timer ISR
    float getCurrent() const;
    RampState getState() const;    // IDLE, RAMPING_UP, RUNNING, RAMPING_DOWN, PAUSED
    float getEtaSeconds() const;   // estimated seconds to reach target
};
```

---

## 8. Acceptance Criteria

- [ ] Speed change from any value to any other value follows the configured ramp (no step)
- [ ] `accel_rate` and `decel_rate` independently configurable via UI
- [ ] EMERGENCY_STOP bypasses ramp and cuts PWM within one loop cycle
- [ ] ETA countdown on UI updates every second
- [ ] Ramp deviation alert triggers when actual RPM differs > 10 RPM from projected for > 2 s
- [ ] Parameters persist across power cycles (NVS)
