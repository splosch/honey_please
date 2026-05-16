# Milestone-Plan: ESP32 Motorsteuerung (Phase 1: Setup & OTA)

> ⚠️ **LEGACY DOCUMENT – ESP32 board retired 2026-05-16.**  
> Milestones 1–4 documented here were completed on the ESP32 platform and are preserved as a historical record.  
> The active platform is the **Arduino Uno R4 WiFi**. See [FEATURE-OVERVIEW.md](./FEATURE-OVERVIEW.md) and [R4 WiFi Onboarding](./r4wifi_onboarding.md) for the current plan.

---

Dieser Plan führte von der Hardware-Initialisierung bis hin zum KI-gestützten Deployment auf dem ESP32-Board.

---

## Milestone 1: Die professionelle Werkbank (VS Code + PlatformIO)

**Ziel:** Ein stabiles System, das USB-Kommunikation und Debugging erlaubt.

- ✅ VS Code + PlatformIO IDE installiert
- ✅ PlatformIO Projekt erstellt (`platformio.ini` vorhanden)
- ✅ Board `esp32dev` und Framework `Arduino` konfiguriert
- ✅ `monitor_speed = 115200` gesetzt
- ✅ CP2102 USB-Treiber installiert (Silicon Labs, COM3)
- ✅ `src/main.cpp` erstellt (aus `example_ota_helloworld.cpp`)
- ✅ Firmware erfolgreich kompiliert (RAM 14.9%, Flash 59.9%)
- ✅ **Erster Flash via USB erfolgreich** – `[HEARTBEAT]` im Serial Monitor bestätigt ✓

### ⚠️ Wichtig: Flash-Prozedur für dieses Board

Dieses Board hat keinen Auto-Reset-Transistor für esptool. **Manueller Download-Modus nötig:**
1. `BOOT`-Taste gedrückt halten
2. `EN`-Taste kurz drücken und loslassen
3. Upload-Befehl starten (mit `--before no_reset`)
4. `BOOT` loslassen sobald `Writing at 0x00010000` erscheint

```
python esptool.py --chip esp32 --port COM3 --baud 460800 --before no_reset --after hard_reset write_flash -z --flash_mode dio --flash_freq 40m --flash_size 4MB 0x1000 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin
```

### ✅ Gelöste Fragen – Milestone 1

- ✅ Board: **ESP32-D0WDQ6** Rev 1.0, 240MHz, 4MB Flash, MAC: `24:6f:28:15:7a:54`
- ✅ COM-Port: **COM3** (Silicon Labs CP210x)

---

## Milestone 2: Das Fundament für Copilot (Agentic Feedback Loop)

**Ziel:** Den Copilot Agent so instruieren, dass er den Terminal-Output zur Fehlerbehebung nutzen kann.

- ✅ Log-Struktur mit `[START]`, `[ERROR]`, `[HEARTBEAT]`, `[OTA]`, `[READY]`, `[INFO]` definiert und live bestätigt
- ✅ Erster echter Debugging-Loop: CP2102-Treiberfehler (Code 28) → Copilot → gelöst
- ✅ Workflow etabliert: Serial Output → Copilot Chat → Lösung → Upload
- ☐ Log-Makro-Entscheidung treffen

### 💡 Optionen – Log-Ausgabe

- 💡 **Option A (einfach):** `Serial.println("[ERROR] ...")` direkt im Code – kein Overhead ← *aktuell genutzt*
- 💡 **Option B (strukturiert):** Makro `#define LOG_ERROR(msg) Serial.println("[ERROR] " + String(msg))` für sauberere Aufrufe
- ☐ Entscheidung für spätere Motorsteuerungs-Phase treffen

---

## Milestone 3: Drahtlose Freiheit (OTA Deployment)

**Ziel:** Code-Updates über WLAN ohne USB-Kabel.

- ✅ `ArduinoOTA.h` in `src/main.cpp` integriert
- ✅ `ArduinoOTA.handle()` im `loop()` vorhanden
- ✅ OTA-Konfiguration in `platformio.ini` vorbereitet (auskommentiert)
- ✅ `src/secrets.h` mit WLAN-Credentials angelegt (in `.gitignore` eingetragen)
- ✅ Code per USB geflasht, `[HEARTBEAT]` bestätigt
- ✅ **WLAN-Verbindung erfolgreich** – FRITZ!Box 6690 WI, IP: `192.168.178.64`
- ✅ IP-Adresse im Serial Monitor abgelesen: `192.168.178.64`
- ✅ IP-Adresse in `platformio.ini` unter `upload_port` eingetragen
- ✅ OTA-Zeilen in `platformio.ini` aktiviert (`upload_protocol = espota`)
- ✅ Test: OTA-Deploy erfolgreich – `[HEARTBEAT] OTA aktiv. Bereit für Motorsteuerung.` bestätigt

### ✅ Gelöste Fragen – Milestone 3

- ✅ Credentials-Strategie: **Option B** (`src/secrets.h` + `.gitignore`) – umgesetzt
- ✅ WLAN-Typ: 2.4 GHz (Hotspot `Galaxy A21s11BE`) – kompatibel

---

## Milestone 4: Web-Terminal für Remote-Feedback

**Ziel:** Den Monitor-Output im Browser sehen (wichtig, wenn man nicht mehr am USB hängt).

- ✅ `ayushsharma82/WebSerial @ ^2.1.2` + `me-no-dev/ESPAsyncWebServer` + `AsyncTCP` in `lib_deps` eingetragen
- ✅ `AsyncWebServer server(80)` erstellt, `WebSerial.begin(&server)` in `setup()` aufgerufen
- ✅ `LOG()`-Makro: Alle Ausgaben gleichzeitig auf USB-Serial und Web-Terminal
- ✅ `WebSerial.onMessage()` Callback für bidirektionale Befehle aus dem Browser
- ✅ Test: `[HEARTBEAT]` live im Browser sehen unter `http://192.168.178.64/webserial`
- ✅ Befehle-Platzhalter `[CMD]` für spätere Motorsteuerung vorbereitet

### ✅ Entscheidungen – Milestone 4

- ✅ **Bidirektional** – Browser kann Befehle an ESP32 senden (`[CMD]`-Tag)
- ✅ **Offen** (kein Passwort) – nur im lokalen Netzwerk erreichbar

---

## Nächste Schritte (priorisiert)

| # | Status | Aktion | Hinweis |
|---|--------|--------|---------|
| 1 | ✅ | Hello World per USB flashen & Serial bestätigen | `[HEARTBEAT]` live gesehen |
| 2 | ✅ | Credentials-Strategie: `secrets.h` + `.gitignore` | Milestone 3 vorbereitet |
| 3 | ✅ | WLAN-Verbindung testen & IP notieren | IP: `192.168.178.64` (FRITZ!Box 6690 WI) |
| 4 | ✅ | OTA-Zeilen in `platformio.ini` aktivieren und testen | OTA-Deploy erfolgreich bestätigt |
| 5 | ✅ | Board-Typ und COM-Port klären | ESP32-D0WDQ6 / COM3 |
| 6 | ✅ | WebSerial (bidirektional) deployen | Browser-Terminal unter `http://192.168.178.64/webserial` |

---

## Architektur-Notizen

- **Dateistruktur:** `src/main.cpp` ist der aktive Code. `example_ota_helloworld.cpp` bleibt als Referenz im Root.
- **Log-Tags:** `[START]`, `[ERROR]`, `[OTA]`, `[READY]`, `[INFO]`, `[HEARTBEAT]`, `[CMD]` – konsistent halten.
- **LOG()-Makro:** Schreibt gleichzeitig auf USB-Serial und Web-Terminal. Alle neuen Ausgaben über `LOG()` statt `Serial.println()`.
- **WebSerial URL:** `http://192.168.178.64/webserial` – im lokalen Netz ohne Passwort erreichbar.
- **WebSerial Port:** HTTP auf Port 80. OTA auf Port 3232 (UDP/TCP). Kein Konflikt.
- **OTA Hostname:** `esp32-motor-control` (konfiguriert in `ArduinoOTA.setHostname()`)
- **OTA IP:** `192.168.178.64` – FRITZ!Box 6690 WI (Heimnetz). Bei Netzwechsel IP in `platformio.ini` aktualisieren.
- **Firewall:** Windows-Firewall-Regel "ESP32 OTA" für TCP+UDP Port 3232 eingerichtet (Admin-Rechte benötigt).
- **Flash-Workaround:** Board hat keinen Auto-Reset → manuell BOOT+EN drücken, Upload mit `--before no_reset`. Baudrate 460800 stabil nach Stub-Start.
- **upload_speed:** `115200` in `platformio.ini` gesetzt (CP2102 stabiler bei niedrigerer Baud im Init-Phase) 