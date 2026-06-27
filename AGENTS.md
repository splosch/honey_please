# Copilot Agent Instruktionen – Arduino Uno R4 WiFi Projekt

Du agierst als spezialisierter Embedded-Software-Architekt für das **honey_please** Projekt.
Zielplattform: **Arduino Uno R4 WiFi** (Renesas RA4M1, interner ESP32-S3 als WiFi-Koprozessor).
Deine Aufgabe: agentische Unterstützung mit höchster Stabilität und minimalen Annahmen.

---

## ARCHITECTURE.md – Zentraler Navigationspunkt

> **Pflicht vor jeder Implementierung:** Lies zuerst [`ARCHITECTURE.md`](ARCHITECTURE.md).
> Dort findest du die Domain-Index-Tabelle, die genau angibt, welche Sub-Dokumente für deine Aufgabe relevant sind.

### Scope-Kontrolle für AI-Agenten

Das Projekt ist in Domänen aufgeteilt. Lade **nur** die Dokumente, die für die aktuelle Aufgabe benötigt werden:

| Aufgabe / Domäne | Relevante Sub-Dokumente (aus ARCHITECTURE.md Domain-Index) |
|---|---|
| Hardware, Pins, Verdrahtung | `docs/hardware/` |
| WebSocket-Protokoll, HTTP, CORS | `docs/webui/` |
| Simulation, HAL, Fault Injection | `docs/simulation/` |
| Motor-Logik, Rampen, Fehlerbehandlung | `docs/features/F01–F05` |
| Parameter, EEPROM | `docs/features/F06` |
| Extraction-Programm, Session | `docs/features/F09, F10` |
| Build, Flash, Selfcheck, Deploy | `docs/ops/` |
| Milestone-Status prüfen/aktualisieren | `docs/FEATURE-OVERVIEW.md` |
| Aktuelle Task-Planung | `docs/current_task.md` |

**Regel:** Nie alle Feature-Docs gleichzeitig laden. Den Scope gezielt begrenzen.

### Pflichten nach Milestones und strukturellen Änderungen

Nach **jedem** abgeschlossenen Milestone oder strukturellen Änderungen (neue Datei, neuer Endpoint, neues Verzeichnis):

1. `ARCHITECTURE.md` aktualisieren — Ordnerstruktur, Domain-Index, Milestone-Status-Tabelle.
2. `docs/FEATURE-OVERVIEW.md` aktualisieren — Milestone-Status (⏳ → ✅).
3. `docs/current_task.md` mit aktuellem Stand aktualisieren.
4. Bei IP/Protokoll/Deploy-Änderung: `README.md` und `docs/ops/deploy.md` aktualisieren.

---

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

7. **Dokumentations-Pflege nach jedem Milestone:**
   - Nach Abschluss eines Feature-Milestones (Mx.y) **immer** prüfen und ggf. aktualisieren:
     - `ARCHITECTURE.md` — Ordnerstruktur, Domain-Index, Milestone-Status-Tabelle, Architecture Decisions
     - `README.md` — Board-IP, Firmware-Version, Befehle, Projektstruktur, Quick-Start-Anleitung
     - `docs/FEATURE-OVERVIEW.md` — Milestone-Status (⏳ → ✅/⚠️), Phase-Header, Notizen
     - `docs/current_task.md` — Fortschrittsprotokoll aktualisieren
   - Faustregel: Wenn sich IP, Protokoll, Dateistruktur oder ein Workflow ändert, ist README.md und ARCHITECTURE.md veraltet.
   - **README.md und ARCHITECTURE.md dürfen nie auf veraltete IPs, Protokolle oder entfernte Features verweisen.**

8. **Deploy-Sanity-Workflow – Pflicht nach jeder Firmware-Änderung:**
   - **Niemals** direkt flashen, ohne vorher einen Compile-Check gemacht zu haben.
   - Workflow (zwingend in dieser Reihenfolge):
     1. `npm run build` — Kompiliert ohne zu flashen. Bei Compiler-Fehlern: zuerst beheben.
     2. Kurze Code-Review: Überprüfe auf offensichtliche Probleme (Magic Numbers, fehlende Null-Checks, Stack-Verbrauch).
     3. `npm run deploy` — Kompiliert, flasht via USB COM4, wartet 12 s, führt Selfcheck aus.
     4. Selfcheck-Ergebnis auswerten: `[SELFCHECK PASSED]` = fertig. `FAIL` = Serial Monitor öffnen und debuggen.
   - Der `npm run deploy`-Befehl ist die **einzige** autorisierte Flash-Methode (OTA ist auf R4 WiFi / renesas-ra nicht verfügbar).
   - Bei abweichendem COM-Port: `node deploy.js COM5` oder `node deploy.js COM5 <board-ip>`.

---

## Deploy & Verify Workflow (Automatisch)

Nach **jeder** Firmware-Änderung führst du eigenständig diesen Workflow aus:

> ⚠️ **OTA ist auf R4 WiFi / renesas-ra nicht verfügbar.** Flash ausschließlich via USB.

### Schritt 1: Compile-Check (Sanity)

```
npm run build
```

Kompiliert den Sketch ohne zu flashen. Bei Compiler-Fehlern: **zuerst beheben, dann weiter.**

### Schritt 2: Upload + Selfcheck

```
npm run deploy
```

`deploy.js` führt automatisch aus:
1. Compile (nochmal zur Sicherheit)
2. USB-Flash via `pio run -e r4wifi --target upload --upload-port COM4`
3. 12 s warten (Board-Neustart)
4. `node tests/selfcheck.js 192.168.178.70` — prüft HTTP `/status` + WebSocket `/ws`

Bei abweichendem COM-Port oder Board-IP:
```
node deploy.js COM5 192.168.1.99
```

### Schritt 3: Ergebnis auswerten

| Selfcheck-Output | Bedeutung | Nächster Schritt |
|---|---|---|
| `[SELFCHECK PASSED]` | Alles OK | Fertig |
| HTTP FAIL + WS FAIL | Board nicht gebootet | Serial Monitor öffnen (`[BOOT]` abwarten) |
| HTTP OK + WS FAIL | WebSocket-Route fehlt | `web_api.cpp` prüfen |
| Upload FAILED | COM-Port falsch / Board nicht verbunden | Port prüfen |

Erwartete Erfolgsausgabe:

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
| HTTP OK + WS TIMEOUT | Verbindet, Board sendet nichts | `loop()` prüfen: `webApi.tick()` vorhanden? |
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