# F09 – Multi-Step Extraction Program

**Status:** ✅ Implemented (v1.4.0)  
**Depends on:** [F03 – Ramps](./F03-acceleration-deceleration-ramps.md), [F04 – Direction Control](./F04-direction-control.md), [F06 – Params](./F06-rpm-limits-and-params.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md), [F10 – Extraction Session](./F10-extraction-session.md)

---

## 1. Goal

Run a standardized multi-step extraction sequence that gradually increases speed and alternates direction. This breaks honey loose from the cells progressively, protecting the honeycomb from centrifugal damage at high speed.

---

## 2. Default Step Sequence

| Step | Direction | Speed Tier | Target RPM* | Duration |
|---|---|---|---|---|
| 1 | Left (CCW) | Slow | 30 % of max_rpm | 60 s |
| 2 | Right (CW) | Slow | 30 % of max_rpm | 60 s |
| 3 | Left (CCW) | Mid | 60 % of max_rpm | 90 s |
| 4 | Right (CW) | Mid | 60 % of max_rpm | 90 s |
| 5 | Left (CCW) | Fast | 100 % of max_rpm | 120 s |
| 6 | Right (CW) | Fast | 100 % of max_rpm | 120 s |

*Target RPM is a percentage of the currently configured `max_rpm` (F06). With default max_rpm = 100:  
Slow = 30 RPM, Mid = 60 RPM, Fast = 100 RPM.

---

## 3. Step Configuration (Customizable)

All step parameters are configurable per-step via the UI:

```json
{
  "steps": [
    { "id": 1, "dir": "CCW", "rpm_pct": 30, "duration_s": 60 },
    { "id": 2, "dir": "CW",  "rpm_pct": 30, "duration_s": 60 },
    { "id": 3, "dir": "CCW", "rpm_pct": 60, "duration_s": 90 },
    { "id": 4, "dir": "CW",  "rpm_pct": 60, "duration_s": 90 },
    { "id": 5, "dir": "CCW", "rpm_pct": 100, "duration_s": 120 },
    { "id": 6, "dir": "CW",  "rpm_pct": 100, "duration_s": 120 }
  ]
}
```

Steps are stored in **EEPROM** as a packed array after the `MotorParams` struct (see F06 for layout). The UI currently shows steps as read-only bubbles. Planned but not yet implemented:
- Editing RPM percentage or duration per step in the UI
- Adding/removing steps in the UI
- Reordering steps via drag-and-drop

All step configuration changes can be done by modifying NVS directly (or via future UI panel).

---

## 4. Step Execution Flow

```
[START PROGRAM]
      │
      ▼ Step 1: CCW, 30 RPM, 60 s
   ┌──────────────────────────────┐
   │ 1. Set direction (if needed) │  → may trigger F04 direction change sequence
   │ 2. Ramp to target RPM        │  → F03 ramp-up
   │ 3. Hold for duration         │  → countdown timer, RPM maintained
   │ 4. Check: next step needed?  │
   └──────────────────────────────┘
         │ Yes → transition to next step
         │       (direction change if dir differs → F04)
         ▼
   [Repeat for each step]
         │
         ▼ All steps done
   Ramp to 0 → IDLE
   Session auto-stops → F10
```

### Step Timing

The step duration timer starts only when the target RPM is reached (not when the ramp begins). The ramp time is **additional** time on top of the step duration.

---

## 5. Web UI – Program View

A dedicated section (accessible from the top bar `[PROGRAM]`) shows the full step sequence:

```
┌─────────────────────────────────────────────────────────┐
│ 🔄 EXTRACTION PROGRAM                   [START] [EDIT]  │
├─────────────────────────────────────────────────────────┤
│  ● Step 1  ◄ LEFT   SLOW   30 RPM   60 s  [DONE ✓]    │
│  ► Step 2  ► RIGHT  SLOW   30 RPM   60 s  [ACTIVE ●]  │
│            ──────────────────────────────              │
│            Step timer: 00:00:42 / 01:00                │
│            RPM: 30 ████████████████████ 30             │
│  ○ Step 3  ◄ LEFT   MID    60 RPM   90 s  [pending]   │
│  ○ Step 4  ► RIGHT  MID    60 RPM   90 s  [pending]   │
│  ○ Step 5  ◄ LEFT   FAST  100 RPM  120 s  [pending]   │
│  ○ Step 6  ► RIGHT  FAST  100 RPM  120 s  [pending]   │
├─────────────────────────────────────────────────────────┤
│ Total remaining: 06:28                                  │
│ [SKIP STEP]   [PAUSE]   [ABORT PROGRAM]                │
└─────────────────────────────────────────────────────────┘
```

### During Active Step

The **Honigschleuder** component box (F07) reflects the current step:
- Rotation direction and speed follow the step
- Step info badge: `"Step 2/6 – RIGHT SLOW"`

---

## 6. Program Controls

| Control | Behavior |
|---|---|
| [START PROGRAM] | Begins from Step 1 (or first non-done step after a resume) |
| [SKIP STEP] | Ramps to 0, performs direction change if needed, starts next step |
| [PAUSE PROGRAM] | Ramps to 0, saves current step position and remaining time |
| [RESUME PROGRAM] | Continues from saved position (remaining time of paused step) |
| [ABORT PROGRAM] | Ramps to 0 → IDLE. Logs abort event with step number |
| [RESTART PROGRAM] | Resets all steps to pending, starts from Step 1 |

---

## 7. Integration with Session Protocol (F10)

Each step transition generates a session log entry:

```
[T+00:00] PROGRAM START  – 6 steps, max_rpm=100
[T+01:12] STEP 1 DONE    – CCW 30 RPM, avg=29.8 RPM, duration=72 s (incl. ramp)
[T+01:12] DIR CHANGE     – CCW → CW
[T+01:18] STEP 2 START   – CW 30 RPM
[T+02:20] STEP 2 DONE    – CW 30 RPM, avg=30.1 RPM
...
[T+09:44] PROGRAM COMPLETE – total duration=584 s
```

---

## 8. Acceptance Criteria

- [x] Default 6-step sequence runs end-to-end in SIM mode without manual intervention
- [x] Step timer starts only after target RPM is reached
- [x] Direction change between steps uses the full F04 safe sequence
- [x] PAUSE saves step position + remaining time; RESUME continues correctly
- [x] SKIP STEP works from any step including first and last
- [x] Custom step configuration persists across power cycles (NVS)
- [x] All step events logged to session protocol with timestamps
- [x] Total program duration estimate shown before start and updated live
- [ ] Step editing UI (RPM%, duration, add/remove steps) – Phase 4+ deferred
