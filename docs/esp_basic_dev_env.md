# Milestone-Plan: ESP32 Motorsteuerung (Phase 1: Setup & OTA)

Dieser Plan führt dich von der Hardware-Initialisierung bis hin zum KI-gestützten Deployment.

> **Legende:** ✅ Erledigt · ☐ Offen · 🔄 In Arbeit · ❓ Offene Frage · 💡 Option

---

## Milestone 1: Die professionelle Werkbank (VS Code + PlatformIO)

**Ziel:** Ein stabiles System, das USB-Kommunikation und Debugging erlaubt.

- ✅ VS Code + PlatformIO IDE installiert
- ✅ PlatformIO Projekt erstellt (`platformio.ini` vorhanden)
- ✅ Board `esp32dev` und Framework `Arduino` konfiguriert
- ✅ `monitor_speed = 115200` gesetzt
- ☐ Hello World auf Hardware geflasht und Serial Output im Monitor bestätigt
  - **Check:** Erscheint `[HEARTBEAT] ESP32 läuft stabil...` alle 5 Sekunden?

### ❓ Offene Fragen – Milestone 1

- ❓ Welches genaue Board-Modell hast du? (`esp32dev` ist generisch – stimmt das mit deiner Hardware überein?)
- ❓ Über welchen COM-Port verbindet sich der ESP32 (Windows Device Manager)?

---

## Milestone 2: Das Fundament für Copilot (Agentic Feedback Loop)

**Ziel:** Den Copilot Agent so instruieren, dass er den Terminal-Output zur Fehlerbehebung nutzen kann.

- ✅ Log-Struktur mit `[STATUS]`, `[ERROR]`, `[HEARTBEAT]`, `[OTA]` definiert (in `example_ota_helloworld.cpp`)
- ☐ Ersten echten Fehler per Copy-Paste an Copilot übergeben und debuggt
- ☐ Workflow etabliert: Serial Output → Copilot Chat → Lösung → Upload

### 💡 Optionen – Log-Ausgabe

- 💡 **Option A (einfach):** `Serial.println("[ERROR] ...")` direkt im Code – kein Overhead
- 💡 **Option B (strukturiert):** Makro `#define LOG_ERROR(msg) Serial.println("[ERROR] " + String(msg))` für sauberere Aufrufe
- ☐ Entscheidung treffen und konsistent umsetzen

---

## Milestone 3: Drahtlose Freiheit (OTA Deployment)

**Ziel:** Code-Updates über WLAN ohne USB-Kabel.

- ✅ `ArduinoOTA.h` in `example_ota_helloworld.cpp` integriert
- ✅ `ArduinoOTA.handle()` im `loop()` vorhanden
- ✅ OTA-Konfiguration in `platformio.ini` vorbereitet (auskommentiert)
- ☐ **WLAN-Credentials in `example_ota_helloworld.cpp` eintragen** (`ssid` / `password`)
- ☐ Code erstmalig per USB flashen und IP-Adresse im Serial Monitor notieren
- ☐ IP-Adresse in `platformio.ini` unter `upload_port` eintragen
- ☐ OTA-Zeilen in `platformio.ini` einkommentieren (`upload_protocol`, `upload_port`)
- ☐ Test: Kleine Änderung deployen und per WLAN übertragen

### ❓ Offene Fragen – Milestone 3

- ❓ Wie sollen WLAN-Credentials sicher gespeichert werden? Hardcoded im Code ist unsicher.
- ❓ Ist dein WLAN 2.4 GHz? (ESP32 unterstützt **kein** 5 GHz)

### 💡 Optionen – Credentials-Handling

- 💡 **Option A (schnell):** Direkt im Code – nur für lokale Entwicklung, nie ins Git!
- 💡 **Option B (sicher):** `secrets.h` Datei anlegen und in `.gitignore` eintragen
- 💡 **Option C (flexibel):** WiFiManager-Library → ESP32 öffnet eigenen Hotspot zur Konfiguration

---

## Milestone 4: Web-Terminal für Remote-Feedback

**Ziel:** Den Monitor-Output im Browser sehen (wichtig, wenn man nicht mehr am USB hängt).

- ☐ WebSerial-Library in `lib_deps` der `platformio.ini` hinzufügen
- ☐ WebSerial in `setup()` initialisieren und im `loop()` pollen
- ☐ Test: Browser öffnen und `[HEARTBEAT]` Output live sehen
- ☐ Copilot-gestützte UI-Verbesserung für Motorsteuerungs-Interface

### ❓ Offene Fragen – Milestone 4

- ❓ Soll das Web-Terminal nur lesen oder auch Befehle senden können (bidirektional)?
- ❓ Authentifizierung gewünscht? (HTTP Basic Auth oder komplett offen im lokalen Netz?)

---

## Nächste Schritte (priorisiert)

| # | Status | Aktion | Hinweis |
|---|--------|--------|---------|
| 1 | ☐ | Hello World per USB flashen & Serial bestätigen | Milestone 1 abschließen |
| 2 | ☐ | Credentials-Strategie wählen (Option A/B/C oben) | Vor OTA entscheiden |
| 3 | ☐ | WLAN-Daten eintragen, IP notieren | Milestone 3 starten |
| 4 | ☐ | OTA-Zeilen in `platformio.ini` aktivieren und testen | Milestone 3 abschließen |
| 5 | ☐ | Board-Typ und COM-Port klären | Offene Frage M1 |

---

## Architektur-Notizen

- **Dateistruktur:** `example_ota_helloworld.cpp` ist eine Referenzimplementierung – für das finale Projekt bitte als `main.cpp` anlegen.
- **Log-Tags:** `[START]`, `[ERROR]`, `[OTA]`, `[READY]`, `[INFO]`, `[HEARTBEAT]` – konsistent halten.
- **OTA Hostname:** `esp32-motor-control` (konfiguriert in `ArduinoOTA.setHostname()`) 