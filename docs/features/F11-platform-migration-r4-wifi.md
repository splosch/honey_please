# F11 – Platform Migration: Arduino Uno R4 WiFi

**Status:** 🔄 In Planning – Phase 6  
**Decision date:** 2026-05-16  
**Replaces:** ESP32-D0WDQ6 (NodeMCU-32S / LOLIN32 form factor)  
**Referenced by:** [Feature Overview](../FEATURE-OVERVIEW.md)

---

## 1. Why the Switch

| Reason | Detail |
|---|---|
| **5 V GPIO logic** | Motor driver control lines need 5 V signal levels. ESP32 is 3.3 V; driving most motor drivers (L298N, BTS7960, IBT-2) directly required a level-shifter. The R4 outputs 5 V natively on all digital pins. |
| **Cleaner signal chain** | Eliminates one PCB component (level-shifter) and the associated noise / ground-offset problems. |
| **Built-in WiFi** | The R4 WiFi has an ESP32-S3 co-processor for WiFi/BT exposed via `WiFiS3.h` – no separate module needed. |
| **OTA support** | `ArduinoOTA` works on R4 WiFi via the `WiFiS3` stack. |

---

## 2. Hardware Comparison

| Property | ESP32 (old) | Arduino Uno R4 WiFi (new) |
|---|---|---|
| MCU | Xtensa LX6 dual-core @ 240 MHz | Renesas RA4M1 ARM Cortex-M4 @ 48 MHz |
| Flash | 4 MB | 256 KB program flash |
| SRAM | 512 KB | 32 KB |
| GPIO logic | 3.3 V ⚠️ | **5 V** ✅ |
| WiFi | Built-in (ESP32) | Built-in (ESP32-S3 co-processor, via `WiFiS3.h`) |
| OTA | `ArduinoOTA` (espota protocol) | `ArduinoOTA` (WiFiS3 stack) |
| RTOS | FreeRTOS dual-core | None – single-threaded loop |
| Persistent storage | NVS (Preferences) + LittleFS | 8 KB emulated EEPROM; SD card (external) |
| PWM | LEDC (ESP-specific) | `analogWrite()` (standard Arduino) |
| Built-in LED | GPIO 2 (active-LOW on clone boards) | `LED_BUILTIN` = GPIO 13 (active-HIGH) |
| USB serial | CP210x UART bridge | Native USB CDC (no driver needed) |
| Status LED matrix | None | 8×12 LED matrix (bonus, can show status glyphs) |

---

## 3. Impact on the Sketch

### 3.1 What Does NOT Change

The HAL design means the vast majority of the firmware is board-agnostic:

| Module | Change needed |
|---|---|
| `IMotorDriver` / `SimMotorDriver` | None |
| `IRpmSource` / `SimRpmSource` | None |
| `RampController` | None |
| `ErrorHandler` | None |
| `ProgramRunner` (step sequencer) | None |
| All error codes (F05) | None |
| WebSocket JSON protocol (`/ws`) | None |
| Motor control business logic | None |

### 3.2 What Changes

| Component | ESP32 implementation | R4 WiFi implementation | Notes |
|---|---|---|---|
| WiFi library | `WiFi.h` (ESP32) | `WiFiS3.h` | Header swap + same API surface |
| OTA | `ArduinoOTA.h` (espota) | `ArduinoOTA.h` (WiFiS3) | Same library, different transport |
| Web server | `ESPAsyncWebServer` + `AsyncTCP` | `WiFiServer` + `WiFiClient` (sync) | Async TCP not available on R4 |
| WebSerial | `WebSerial` library (ESP-specific) | ❌ Not available → **USB Serial** (native CDC) | `Serial.println()` replaces WebSerial |
| File system | `LittleFS` (3 MB partition) | ❌ Not available → **SD card** (deferred – see §4) | Web UI assets move to SD card |
| NVS params | `Preferences` library | `EEPROM` (8 KB emulated) | Same param struct, different backend |
| FreeRTOS | `SemaphoreHandle_t`, `xQueueCreate` | ❌ Not available | Remove mutex; single-threaded loop is safe |
| LOG macro | Posts to FreeRTOS queue → WebSerial | Posts to `Serial` (USB CDC) | `logDrain()` becomes a no-op or direct print |
| Dual-core guard | `g_mutex` protects Core-0/Core-1 | None needed (single core) | Remove all `xSemaphoreTake/Give` |
| Status LED | GPIO 2 (active-LOW, external LED) | `LED_BUILTIN` (GPIO 13, active-HIGH) + optional LED matrix | Polarity flag removed; `LED_BUILTIN` constant used |
| PWM output | `ledcSetup` / `ledcWrite` | `analogWrite(pin, duty)` | Simpler API |
| Session storage | LittleFS JSONL files | In-memory ring buffer (until SD card added) | No persistence across reboots until M6.SD |

### 3.3 Resource Budget

| Resource | Current ESP32 usage | R4 WiFi budget | Headroom |
|---|---|---|---|
| Flash | ~1010 KB (51.4% of 1966 KB) | 256 KB total | ⚠️ Tight – Web UI assets must move off-board |
| SRAM | ~55.5 KB (17% of 328 KB) | 32 KB total | ⚠️ Tight – session ring buffer must be small |

> **Key constraint:** The current sketch without Web UI assets (`index.html`, `style.css`, `app.js`) compiled for the ESP32 is ~350 KB of C++ object code. On R4 the same logic compiled with the leaner Renesas toolchain is expected to fit within ~200 KB — but this must be verified at M6.1. The Web UI assets (~20–40 KB) **cannot** live in program flash and must be served from an SD card (F11 Phase 2, M6.SD).

---

## 4. Web UI Deferral Plan

> ⚠️ **Web UI development is paused for Phase 6 (R4 migration).** The UI is NOT removed from the project.

### Current state (ESP32)
- `data/index.html`, `data/style.css`, `data/app.js` served from LittleFS.
- WebSocket `/ws` streams 10 Hz JSON state frames.
- WebSerial terminal at `/webserial`.

### R4 WiFi Phase 6 (interim)
- Web assets **not served** – browser UI unavailable.
- WebSocket `/ws` endpoint **retained** – same JSON protocol. The browser UI will reconnect automatically once assets are restored.
- Control via **USB Serial** (`Serial` over native CDC) replacing WebSerial commands.
- A minimal status HTTP endpoint (`GET /status` → JSON) will be available for scripting/`curl`.

### R4 WiFi Phase 7 – SD Card Web UI (M6.SD, future)
- SD card module wired to SPI pins.
- `index.html`, `style.css`, `app.js` copied to SD card root.
- `WiFiServer` serves files from SD via chunked reads.
- WebSerial-equivalent: lightweight in-browser terminal consuming `/ws` messages.
- This milestone **re-enables the full browser UI** without modifying a single line of UI code.

> **Why this is safe:** The WebSocket JSON protocol is the same. The browser UI only needs the web server to serve the static files once; after that it drives entirely via WebSocket. Moving assets to SD changes the transport of the initial page load only.

---

## 5. Hardware Wiring & Board Protection

### 5.0 How the Internal ESP32-S3 Works (do NOT wire around it)

The Arduino Uno R4 WiFi contains **two chips on one board**:

| Chip | Role | Your code |
|---|---|---|
| Renesas RA4M1 (main MCU) | Runs your sketch, drives all GPIO | `setup()` / `loop()` |
| Espressif ESP32-S3 (co-processor) | Handles WiFi / BT | `#include <WiFiS3.h>` |

The RA4M1 and ESP32-S3 communicate over an **internal SPI bridge soldered onto the R4 PCB**. You do not wire anything between them — it is completely transparent. `WiFiS3.h` and `ArduinoOTA.h` handle all of it. There are no exposed co-processor pins for user code.

> ❌ Do NOT try to access the ESP32-S3 directly via serial or SPI from external wires. You will get no response (its UART is locked to the RA4M1 bridge) and risk confusing the firmware update state machine on the co-processor.

---

### 5.1 ⚠️ Board Protection Rules

The R4 WiFi is significantly more expensive than the ESP32 module it replaces. Follow these rules before connecting **anything**:

#### Power rails

| Rule | Why |
|---|---|
| **Never feed external 5 V into the `5V` pin while USB is connected.** | The `5V` pin is an OUTPUT (USB VBUS through a polyfuse). Back-feeding into it pushes current into the USB host port and can blow the host's protection fuse or the board's polyfuse. |
| **Power motor driver logic from a dedicated 5 V rail, not the board's `5V` pin.** | The board's USB polyfuse is rated ~500 mA for the entire board. Motor driver logic inrush easily exceeds this and will cause mid-run brownout, corrupting EEPROM writes and crashing the sketch. |
| **Motor driver power (12–24 V) must be completely isolated from the MCU power rail.** | Share only GND. Use the motor driver's own onboard LDO for its logic supply if it has one (L298N, BTS7960 do). |
| **If powering via VIN (barrel jack), acceptable range is 6–24 V.** | Below 6 V the onboard 5 V LDO drops out. Above 24 V exceeds the LDO's absolute maximum. |

#### GPIO inputs (RPM sensor + nFAULT)

| Rule | Why |
|---|---|
| **GPIO max input voltage = VCC (5 V). Never exceed this.** | The RA4M1 I/O cells are not protected above VCC. Overvoltage causes permanent latch-up or die damage — not immediately obvious but the chip will fail in the field. |
| **If your RPM sensor or Hall probe outputs > 5 V logic (some 12 V industrial sensors do), add a resistor voltage divider before Pin 2.** | e.g. 10 kΩ + 4.7 kΩ → 12 V becomes ≈3.8 V (safe). Verify with a multimeter before connecting the R4. |
| **nFAULT input (Pin A0): add a 10 kΩ pull-up resistor to 5 V.** | Most motor drivers leave nFAULT floating when healthy (open-drain). Without the pull-up the pin reads noise and generates false E06 faults. |
| **Open-collector RPM sensors: add a 4.7 kΩ pull-up to 5 V on Pin 2.** | Same open-drain reason. Many Hall-effect sensors are open-collector. |

#### GPIO outputs (PWM + direction + enable)

| Rule | Why |
|---|---|
| **All digital outputs are 5 V, ≤ 20 mA per pin, ≤ 100 mA total across all pins.** | Only use outputs to drive driver gate inputs, not to directly drive relay coils or LED strings. Add a transistor if you need more than 20 mA from a pin. |
| **Confirm your motor driver's VIH spec before connecting.** | Most drivers (L298N, BTS7960, DRV8825) accept 5 V inputs. Some modern drivers (DRV8833) are 3.3 V devices — check the datasheet. A 5 V signal into a 3.3 V-only driver input may stress its ESD clamps over time. |

---

### 5.2 Motor Driver Pin Mapping (ESP32 → R4 WiFi)

| Signal | ESP32 pin | ESP32 level | R4 WiFi pin | R4 level | Change |
|---|---|---|---|---|---|
| PWM | GPIO 18 | 3.3 V ⚠️ | Pin 9 (PWM) | **5 V** ✅ | Level-shifter **removed** |
| DIR_A | GPIO 19 | 3.3 V ⚠️ | Pin 7 | **5 V** ✅ | Level-shifter **removed** |
| DIR_B | GPIO 21 | 3.3 V ⚠️ | Pin 8 | **5 V** ✅ | Level-shifter **removed** |
| ENABLE | GPIO 22 | 3.3 V ⚠️ | Pin 6 | **5 V** ✅ | Level-shifter **removed** |
| nFAULT (in) | GPIO 35 | 3.3 V input | Pin A0 | 5 V tolerant | Pull-up resistor retained |
| RPM sensor (in) | GPIO 34 | 3.3 V input | Pin 2 (INT0) | 5 V tolerant | Interrupt pin same concept |

> ⚠️ **Verify before wiring:** Check that your specific motor driver's nFAULT and RPM sensor output levels are compatible with 5 V input. If the sensor outputs 3.3 V logic, the R4's 5 V digital threshold (≥3.0 V = HIGH on most R4 pins) should still read it correctly — but confirm with a multimeter.

### 5.3 Power Rail Summary

| Rail | ESP32 setup | R4 WiFi setup |
|---|---|---|
| MCU supply | 5 V → onboard 3.3 V LDO | 5 V USB or VIN → onboard 5 V and 3.3 V |
| Motor driver logic | 3.3 V from ESP32 (⚠️ borderline for most drivers) | **5 V from R4** ✅ direct |
| Motor driver power | Separate 12–24 V supply | Unchanged |
| RPM sensor supply | 3.3 V or 5 V (sensor dependent) | 5 V from R4 `5V` pin |

### 5.4 Status LED

| | ESP32 | R4 WiFi |
|---|---|---|
| Pin | GPIO 2 | `LED_BUILTIN` (GPIO 13) |
| Active level | LOW (clone board) | HIGH (standard) |
| Bonus | — | 8×12 LED matrix can show status glyphs (e.g., `OK`, `E`, wifi icon) |

---

## 6. Retained Constraints (still open from Phase 5)

These questions from Phase 5 remain valid. The platform change does not answer them:

| # | Question | Needed before |
|---|---|---|
| Q1 | Which motor driver chip? | `RealMotorDriver` on R4 |
| Q2 | Motor voltage and rated current? | Driver selection |
| Q3 | RPM sensor type? | `RealRpmSource` on R4 |
| Q4 | Gear ratio? | `GEAR_RATIO` constant |
| Q5 | PWM frequency for your driver? | `motor_config.h` |
| Q6 | Final pin wiring (schematic)? | All `PIN_*` defines |

---

## 7. Phase 6 Milestones

> **Goal:** Arduino Uno R4 WiFi receives the sketch, connects to WiFi, serves OTA updates, and exposes the WebSocket API — with the Web UI deferred to Phase 7 (SD card).

| ID | Milestone | Depends on | Status |
|---|---|---|---|
| M6.1 | `[env:r4wifi]` in `platformio.ini`; sketch compiles for R4 target | — | 🔲 |
| M6.2 | WiFi connection (`WiFiS3.h`) + OTA (`ArduinoOTA`) verified | M6.1 | 🔲 |
| M6.3 | USB Serial command interface (replaces WebSerial): `help`, `status`, `target`, `stop`, `estop`, `resetfault` | M6.2 | 🔲 |
| M6.4 | WebSocket `/ws` endpoint alive (10 Hz JSON state frames) | M6.2 | 🔲 |
| M6.5 | Minimal HTTP status endpoint: `GET /status` → JSON | M6.4 | 🔲 |
| M6.6 | EEPROM params persistence (replaces NVS `Preferences`) | M6.1 | 🔲 |
| M6.7 | In-memory session ring buffer (replaces LittleFS JSONL) | M6.1 | 🔲 |
| M6.8 | Status LED on `LED_BUILTIN` (GPIO 13, active-HIGH) + optional LED matrix glyph | M6.2 | 🔲 |
| M6.9 | `selfcheck.js` updated: R4 IP, no `/webserial` check, `/status` check instead | M6.5 | 🔲 |
| M6.10 | Full simulation run verified on R4 hardware (WebSocket + USB Serial) | M6.3–M6.8 | 🔲 |
| M6.SD | SD card module wired; static files served from SD; full Web UI restored | M6.5 | 🔲 Phase 7 |

---

## 8. `platformio.ini` Status

The `[env:esp32dev]` and `[env:usb]` environments were **removed on 2026-05-16** — hardware swapped, no longer needed.

`[env:r4wifi]` is now the only environment. It contains:
- Full board-protection rules as inline comments
- Pin assignment reference (placeholder until `motor_config.h` is written at real-HW milestone)
- The `-DARDUINO_UNOR4_WIFI` build flag that drives `#ifdef` selection in `main.cpp` / `web_api.cpp`
- OTA upload lines commented out (uncomment after M6.2)

See [platformio.ini](../../platformio.ini) for the authoritative current content.

---

## 9. Migration Approach

1. **R4 WiFi is now the only configured target.** The ESP32 envs have been removed. The sketch in `main.cpp` still contains ESP32-specific code paths (guarded by `#ifndef ARDUINO_UNOR4_WIFI`), kept as reference until M6.10 is verified — then they can be pruned.
2. Use `#ifdef ARDUINO_UNOR4_WIFI` guards to select WiFi/storage/LED backend at compile time within a single `main.cpp`.
3. The HAL (`IMotorDriver`, `IRpmSource`) means all motor control, ramp, error, program, and session logic is **identical** on both boards. Only the platform-specific plumbing in `main.cpp` and `web_api.cpp` changes.
4. After M6.10 is verified, the `#else` (ESP32) branches in `main.cpp` and `web_api.cpp` can be deleted, leaving a clean R4-only sketch.
