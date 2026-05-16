# F11 – Platform Migration: Arduino Uno R4 WiFi

**Status:** 🔄 In Progress – Phase 6  
**Decision date:** 2026-05-16  
**Replaces:** ESP32-D0WDQ6 (retired)  
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
| File system | `LittleFS` (3 MB partition) | ❌ Not needed — Web UI served from client | See §4 |  
| NVS params | `Preferences` library | `EEPROM` (8 KB emulated) | Same param struct, different backend |
| FreeRTOS | `SemaphoreHandle_t`, `xQueueCreate` | ❌ Not available | Remove mutex; single-threaded loop is safe |
| LOG macro | Posts to FreeRTOS queue → WebSerial | `Serial.println()` directly (USB CDC) | `logDrain()` removed |  
| Dual-core guard | `g_mutex` protects Core-0/Core-1 | None needed (single core) | Remove all `xSemaphoreTake/Give` |
| Status LED | GPIO 2 (active-LOW, external LED) | `LED_BUILTIN` (GPIO 13, active-HIGH) | Polarity flag removed; `LED_BUILTIN` constant used |
| PWM output | `ledcSetup` / `ledcWrite` | `analogWrite(pin, duty)` | Simpler API |
| Session storage | LittleFS JSONL files | In-memory ring buffer ≤50 entries | No persistence across reboots (acceptable for operator use) |
| CORS | Not needed (same-origin) | **Required** — browser on localhost → board IP | `Access-Control-Allow-Origin: *` on all HTTP responses |

### 3.3 Resource Budget

| Resource | ESP32 usage | R4 WiFi budget | Notes |
|---|---|---|---|
| Flash | ~1010 KB (51.4 % of 1966 KB) | 256 KB total | ⚠️ Tight — C++ sketch + libraries must fit. Web UI assets NOT on board. Verify at M6.2. |
| SRAM | ~55.5 KB (17 % of 328 KB) | 32 KB total | ⚠️ Tight — session ring buffer ≤50 entries, prefer `const char*` over `String`. |

> **The single biggest resource relief:** On the ESP32 the sketch embedded ~20–40 KB of HTML/CSS/JS in LittleFS program flash. On R4 these assets are gone from the board entirely (served from the developer's machine). This is what makes the 256 KB budget viable.

> **Key constraint:** The current sketch without Web UI assets (`index.html`, `style.css`, `app.js`) compiled for the ESP32 is ~350 KB of C++ object code. On R4 the same logic compiled with the leaner Renesas toolchain is expected to fit within ~200 KB — but this must be verified at M6.1. The Web UI assets (~20–40 KB) **cannot** live in program flash and must be served from an SD card (F11 Phase 2, M6.SD).

---

> ⚠️ **The resource constraint is what makes the client-hosted Web UI approach mandatory, not optional.** There is simply not enough flash to embed the UI on the R4.

---

## 4. Web UI Strategy: Client-Hosted

> **SD card is no longer the plan.** The Web UI runs permanently from the developer's machine.

### How it works

```
Developer-PC
  ├── Static file server  (VS Code Live Server, port 5500 or similar)
  │     serves: data/index.html, data/style.css, data/app.js
  │
  └── Browser
        loads Web UI from http://localhost:5500
        ─────────────────────────────────────────────────
        WebSocket  ws://<board-ip>/ws      (10 Hz JSON state)
        HTTP GET   http://<board-ip>/status (JSON snapshot)
```

### Why this works

The Web UI connects to the board via WebSocket after page load. There is no ongoing dependency on the file server — the file server is needed only to load the initial HTML/CSS/JS. After that, all communication is WebSocket-only between the browser and the board.

This is the same model used in professional embedded development tools (e.g., ESP-IDF Web Dashboard, Tasmota, ESPHome).

### CORS requirement

Because the browser loads the page from `http://localhost:5500` (or any `localhost` port) and makes WebSocket/HTTP requests to `http://<board-ip>/...`, the browser enforces the Same-Origin Policy. The board must respond with:

```
Access-Control-Allow-Origin: *
```

on **every** HTTP response. WebSocket upgrade requests do not trigger CORS preflight, but HTTP `GET /status` and any future `POST` endpoints do.

For `OPTIONS` preflight requests:
```cpp
// Respond to OPTIONS with 200 + CORS headers, no body
client.println("HTTP/1.1 200 OK");
client.println("Access-Control-Allow-Origin: *");
client.println("Access-Control-Allow-Methods: GET, POST, OPTIONS");
client.println("Access-Control-Allow-Headers: Content-Type");
client.println("Content-Length: 0");
client.println();
```

### Starting the local dev server

**Option A – VS Code Live Server (recommended for development):**
1. Install the "Live Server" extension in VS Code.
2. Right-click `data/index.html` → "Open with Live Server".
3. Browser opens at `http://localhost:5500/data/index.html` (or similar).

**Option B – Node.js serve (for headless / CI):**
```bash
npx serve data -p 5500
```

**Option C – Python (no install needed):**
```bash
python -m http.server 5500 --directory data
```

### Future: SD card (optional)
An SD card could be added later if the operator needs to run the UI without a connected PC (e.g., in the field without a laptop). This is tracked as a potential future milestone and does not block any current phase.

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

> **Goal:** Arduino Uno R4 WiFi runs the sketch, connects to WiFi, accepts OTA updates, serves the WebSocket API, and supports the Web UI running from the developer's local dev server.

| ID | Milestone | Depends on | Status |
|---|---|---|---|
| ✅ M6.1 | `[env:r4wifi]` only env in `platformio.ini`; ESP32 envs removed | — | Done |
| 🔲 M6.2 | `main.cpp` rewritten for R4: `WiFiS3.h`, ArduinoOTA, no FreeRTOS, USB Serial | M6.1 | Next |
| 🔲 M6.3 | USB Serial command interface: `help`, `status`, `target`, `stop`, `estop`, `resetfault` | M6.2 | |
| 🔲 M6.4 | `web_api.cpp` rewritten: sync `WiFiServer`/`WiFiClient` replaces `ESPAsyncWebServer` | M6.2 | |
| 🔲 M6.5 | WebSocket `/ws` alive on R4 (10 Hz JSON state frames) | M6.4 | |
| 🔲 M6.6 | **CORS** – `Access-Control-Allow-Origin: *` on all HTTP responses + OPTIONS preflight | M6.4 | Critical |
| 🔲 M6.7 | `GET /status` JSON endpoint | M6.4 | |
| 🔲 M6.8 | EEPROM params persistence (replaces NVS `Preferences`) | M6.1 | |
| 🔲 M6.9 | In-memory session ring buffer ≤50 entries (replaces LittleFS JSONL) | M6.1 | |
| 🔲 M6.10 | `log.h` rewritten: direct `Serial.println()`, no FreeRTOS queue, no WebSerial | M6.2 | |
| 🔲 M6.11 | Status LED on `LED_BUILTIN` (GPIO 13, active-HIGH) | M6.2 | |
| 🔲 M6.12 | `selfcheck.js` updated: checks `/status` + `/ws`, no `/webserial` | M6.7 | |
| 🔲 M6.13 | WiFi + OTA verified on real R4 hardware (USB-flash first, then OTA) | M6.2 | |
| 🔲 M6.14 | Full sim run: WebSocket + USB Serial + Web UI from local dev server end-to-end | M6.3–M6.12 | |

---

## 8. `platformio.ini` Status

The `[env:esp32dev]` and `[env:usb]` environments were **removed on 2026-05-16** — hardware swapped, no longer needed.

`[env:r4wifi]` is now the only environment. It contains:
- Full board-protection rules as inline comments
- Pin assignment reference (placeholder until `motor_config.h` at real-HW milestone)
- OTA upload lines commented out (uncomment after M6.13)

See [platformio.ini](../../platformio.ini) for the authoritative current content.

---

## 9. Migration Approach

1. **Single target:** `[env:r4wifi]` is the only build environment. No ESP32 paths remain in `platformio.ini`.
2. **Code rewrite, not ifdef soup:** Rather than guarding everything with `#ifdef ARDUINO_UNOR4_WIFI`, the rewrite replaces the platform-specific plumbing in `main.cpp`, `web_api.cpp`, and `log.h` directly for R4. The old ESP32 code is kept only for historical reference in git, not in the active files.
3. **HAL is unchanged:** `IMotorDriver`, `IRpmSource`, `RampController`, `ErrorHandler`, `ProgramRunner`, and `Session` (business logic) require no modification. Only the platform-specific plumbing changes.
4. **Verify at each milestone:** After each M6.x milestone, run `selfcheck.js` (once updated at M6.12) to confirm the board is still reachable and functional.
5. **Web UI remains on developer machine:** No static files are served from the board. The `data/` folder is served locally by VS Code Live Server or equivalent.
