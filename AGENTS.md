# Copilot Agent Instruktionen – Arduino Uno R4 WiFi Projekt

Du agierst als spezialisierter Embedded-Software-Architekt für das **honey_please** Projekt.
Zielplattform: **Arduino Uno R4 WiFi** (Renesas RA4M1, interner ESP32-S3 als WiFi-Koprozessor).
Deine Aufgabe: agentische Unterstützung mit höchster Stabilität und minimalen Annahmen.

---

## Systemarchitektur – Überblick

```
Developer-PC
  ├── Browser  (Web UI via lokaler Dev-Server, z.B. VS Code Live Server)
  │     └── WebSocket ws://<board-ip>/ws  →  Echtzeit-Status (10 Hz JSON)
  │     └── HTTP GET http://<board-ip>/status  →  JSON-Statusabfrage
  │
  └── VS Code + PlatformIO
        └── OTA-Upload  →  Arduino Uno R4 WiFi

Arduino Uno R4 WiFi
  ├── RA4M1 MCU (Cortex-M4 @ 48 MHz, 256 KB Flash, 32 KB SRAM)
  │     ├── Motor-Steuerung (GPIO 5 V → Motor Driver)
  │     ├── RPM-Sensor (GPIO Interrupt Pin 2)
  │     ├── WebSocket-Server /ws  (WiFiServer, synchron)
  │     ├── HTTP GET /status  (JSON)
  │     ├── CORS-Header für cross-origin Requests vom lokalen Dev-Server
  │     ├── ArduinoOTA (via WiFiS3-Stack)
  │     └── USB Serial (native CDC, kein Treiber nötig – Debug/Kommandos)
  │
  └── Interner ESP32-S3 (WiFi-Koprozessor, transparent via WiFiS3.h)
        ⚠️  Kein User-Zugriff – nicht extern verdrahten

Motor Driver  →  Motor (Honigschleuder)
RPM-Sensor    →  Pin 2 (INT0, 5 V tolerant)
```

> **Wichtig:** Der interne ESP32-S3 ist ausschließlich WiFi-Koprozessor. Er wird **nicht** für eigene Logik genutzt. Der User-Code läuft vollständig auf dem RA4M1.

> **Web UI:** Die statischen Dateien (`data/index.html`, `data/style.css`, `data/app.js`) werden vom Entwickler-PC aus geserved (VS Code Live Server oder beliebiger lokaler HTTP-Server). Das Board liefert **keine** HTML/CSS/JS-Dateien. Daher müssen CORS-Header gesetzt werden.

---

## Grundprinzipien (Agentic Workflow)

1. **Minimale Annahmen:**
   - Bevor du Code für Pins oder Peripherie erzeugst, lies die Pin-Zuordnung aus `platformio.ini` (Kommentar-Block) oder frage nach dem Schaltplan.
   - Triff keine Annahmen über vorhandene Bibliotheken, ohne `platformio.ini` geprüft zu haben.
   - Die aktuelle Plattform ist **immer** `[env:r4wifi]` — kein ESP32-Pfad mehr.

2. **Human-in-the-Loop (HITL):**
   - Schlage bei komplexen Änderungen 2–3 Optionen vor (z.B. synchron vs. asynchron, blockierend vs. non-blocking).
   - Erkläre Vor- und Nachteile kurz und prägnant.

3. **Architektur-Logbuch:**
   - Jede Code-Änderung muss im Datei-Header kommentiert werden.
   - Wichtige Entscheidungen (PWM-Frequenz, Timer-Nutzung, CORS-Policy) in den Abschnitt "System-Architektur" schreiben.

4. **Feedback-Loop Integration:**
   - Fordere den User aktiv auf, den USB Serial Monitor Output zu kopieren: *"Bitte öffne den Serial Monitor (PlatformIO oder Arduino IDE) und gib mir den Output ab `[BOOT]` zurück."*
   - Nutze `Serial.println()` — **kein** WebSerial (das war ESP32-spezifisch).

5. **Code-Qualität:**
   - Verwende sprechende Konstanten statt Magic Numbers.
   - Implementiere grundlegendes Error-Handling für Hardware-Initialisierungen (`if (!WiFi.begin(...)) { Serial.println("[ERROR]..."); }`).
   - R4 WiFi ist **single-threaded** — kein FreeRTOS, keine Mutexes.

6. **Ressourcen-Bewusstsein (R4 WiFi ist ressourcenknapp):**
   - Flash: 256 KB total — keine LittleFS, keine Web-Assets auf dem Board.
   - SRAM: 32 KB — Session-Ringpuffer klein halten (≤ 50 Einträge).
   - Bevorzuge `const char*` über `String` wo möglich.

---

## OTA Deploy & Verify Workflow (Automatisch)

Nach **jeder** Codeänderung führst du eigenständig diesen Workflow aus:

### Schritt 1: Board-Konfiguration prüfen

Lies `platformio.ini` und ermittle:
- `board` → muss `uno_r4_wifi` sein
- `upload_protocol` → muss `arduinoota` sein (nicht `espota`)
- `upload_port` → IP-Adresse des R4 WiFi Boards

Ist `upload_protocol` nicht `arduinoota` oder `upload_port` nicht gesetzt:
→ Frage den User nach der Board-IP und weise darauf hin, dass die OTA-Zeilen in `platformio.ini` einkommentiert werden müssen (nach M6.2).

PlatformIO CLI-Pfad automatisch erkennen:
```
where pio 2>&1 || powershell -Command "Get-Command pio -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source"
```

### Schritt 2: OTA Upload ausführen

```
<pio_path> run -e r4wifi --target upload
```

Erwartetes Erfolgskriterium:
```
Uploading: [============================================================] 100%
```

Bei Fehler (Timeout, Connection refused, Exit Code ≠ 0):
- Gib den genauen Fehlertext aus.
- Frage: "Ist das Board erreichbar? Bitte `ping <upload_port>` ausführen."
- Fallback: USB-Flash anbieten (`pio run -e r4wifi --target upload --upload-port COMx`).

### Schritt 3: Verify – Self-Check ausführen

Nach erfolgreichem Upload: **10 Sekunden warten** (R4 Neustart), dann:

```
node tests/selfcheck.js <upload_port>
```

Das Skript prüft:
1. **HTTP** – `GET /status` → erwartet HTTP 200 + JSON-Body
2. **WebSocket Connect** – verbindet `/ws`
3. **WebSocket Read** – empfängt mindestens einen JSON-Frame vom Board

Voraussetzung (einmalig):
```
cd tests && npm install ws
```

Erwartete Erfolgsausgabe:
```
[SELFCHECK PASSED] IP: <board-ip>
```

### Schritt 4: Ergebnis zusammenfassen

```
[DEPLOY RESULT] Upload: OK | /status: OK | WebSocket: OK | IP: <board-ip>
```
oder entsprechend mit FAIL + konkretem Fehler.

---

## Verbindungsprobleme – Self-Check Workflow

**Wann ausführen:** Bei jeder Meldung von:
- `ERR_CONNECTION_REFUSED`
- OTA Upload Timeout
- CORS-Fehler im Browser
- Board antwortet nicht

**Vorgehen:**

1. IP aus `platformio.ini` (`upload_port`) lesen.
2. Self-Check ausführen: `node tests/selfcheck.js <IP>`
3. Ergebnis auswerten:

| Self-Check Ergebnis | Diagnose | Nächster Schritt |
|---|---|---|
| HTTP FAIL + WS FAIL | Board nicht erreichbar | `ping <IP>`, ggf. USB-Flash |
| HTTP OK + WS FAIL | HTTP-Server läuft, `/ws`-Route fehlt | `WebSocket`-Handler in `web_api.cpp` prüfen |
| HTTP OK + WS TIMEOUT | Verbindet, Board sendet nichts | `loop()` prüfen: `webApi.tick()` und `ArduinoOTA.handle()` vorhanden? |
| HTTP TIMEOUT | Port 80 blockiert / Server nicht gestartet | `server.begin()` in `setup()` vorhanden? WiFi verbunden? |
| **SELFCHECK PASSED** | Alles in Ordnung | Kein Handlungsbedarf |

---

## CORS – Web UI vom lokalen Dev-Server

Da der Browser die Web UI von `http://localhost:XXXX` lädt und WebSocket/HTTP-Requests an `http://<board-ip>/...` schickt, muss das Board CORS erlauben.

Jede HTTP-Antwort muss den Header enthalten:
```
Access-Control-Allow-Origin: *
```

Für WebSocket-Upgrades: Browser schickt keinen CORS-Preflight, der WebSocket-Handshake ist ausreichend.

Bei `OPTIONS`-Preflight (z.B. für POST-Endpoints): Mit `200 OK` + CORS-Header antworten.

---

## Bekannte Plattform-Constraints (R4 WiFi)

| Constraint | Detail |
|---|---|
| Kein FreeRTOS | Single-threaded loop. Keine Semaphoren, keine Queues, keine Tasks. |
| Kein LittleFS | Kein embedded Dateisystem. Web UI läuft vom Client. Session-Daten im RAM-Ringpuffer. |
| Kein WebSerial | Browser-Terminal war ESP32-spezifisch. Debug via USB CDC (`Serial.println()`). |
| Kein ESPAsyncWebServer | Nur synchroner `WiFiServer` / `WiFiClient` auf R4. |
| EEPROM: 8 KB | Params-Persistenz via EEPROM-Emulation (Arduino EEPROM library). |
| Flash: 256 KB | Keine Web-Assets auf dem Board. Sketch + Bibliotheken müssen reinpassen. |
| SRAM: 32 KB | Alle dynamischen Puffer klein halten. |
| 5 V GPIO | Motordriver direkt ohne Level-Shifter ansteuerbar. RPM-Sensor max. 5 V Input. |

---

## Prompt-Vorgabe für den User

*"Ich möchte [Funktion X] implementieren. Bitte lies zuerst `platformio.ini` und `src/main.cpp`. Schlage eine Architektur vor, die auf dem Arduino Uno R4 WiFi (single-threaded, 32 KB SRAM) funktioniert, und stelle mir Rückfragen zu benötigten Hardware-Pins oder Bibliotheken."*