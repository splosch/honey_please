# CleanupAdvancedControl.md – Veraltete Referenzen nach Entfernung von `advanced-control/`

**Erstellt:** 2026-07-08  
**Anlass:** Commit `af62435` – `advanced-control/` wurde aus dem Projekt entfernt (gezippt).  
**Zweck:** Analyse aller verbliebenen Dead-Links, Build-Blocker und Dokumentationslücken – mit priorisiertem Cleanup-Plan.  
**Status:** ✅ Alle 12 Punkte abgeschlossen (2026-07-08).

---

## Übersicht der betroffenen Dateien

| # | Datei | Schweregrad | Art des Problems | Status |
|---|---|---|---|---|
| 1 | `platformio.ini` | 🔴 KRITISCH | Build-Blocker | ✅ `src_dir = basic-control` |
| 2 | `.vscode/c_cpp_properties.json` | 🟠 HOCH | IntelliSense-Fehler | ✅ Durch `pio run` regeneriert |
| 3 | `deploy.js` | 🟠 HOCH | Defekter Deploy-Workflow | ✅ Gelöscht |
| 4 | `tests/selfcheck.js` | 🟠 HOCH | Testet nicht mehr existierende Endpunkte | ✅ Gelöscht |
| 5 | `serve.js` | 🟡 MITTEL | Server für gelöschtes `data/`-Verzeichnis | ✅ Gelöscht |
| 6 | `package.json` | 🟡 MITTEL | Tote npm-Scripts + Tippfehler | ✅ Konsolidiert |
| 7 | `README.md` | 🟡 MITTEL | Veraltete Projektstruktur + Doku | ✅ Neu geschrieben |
| 8 | `ARCHITECTURE.md` | 🟡 MITTEL | Tote Pfade in Folder-Map + Domain-Index | ✅ Neu geschrieben |
| 9 | `AGENTS.md` | 🟡 MITTEL | Überholte Agent-Instruktionen | ✅ Neu geschrieben |
| 10 | `.gitignore` | 🟢 NIEDRIG | Toter Eintrag | ✅ Entfernt |
| 11 | `basic-control/config.h` | 🟢 NIEDRIG | Historischer Kommentar-Verweis | ✅ Aktualisiert |
| 12 | `basic_control_flash.js` | 🟢 NIEDRIG | Historischer Kommentar-Verweis | ✅ Aktualisiert |

---

## 1. 🔴 `platformio.ini` – Build-Blocker (KRITISCH)

**Problem:** Zeile 9:
```ini
src_dir = advanced-control
```
PlatformIO sucht beim Build (`pio run -e r4wifi`) nach Sourcen in einem nicht mehr existierenden Verzeichnis. **Jeder `npm run build` / `npm run deploy` scheitert sofort.**

**Vorschlag:**
```ini
src_dir = basic-control
```
Oder die Zeile ganz entfernen, falls die `build_src_filter`-basierten Environments (`r4wifi_basic_control`, `r4wifi_verify`) den Default überschreiben sollen.

**⚠️ Nebeneffekt:** Environment `[env:r4wifi]` (Zeile 62) hat keinen `build_src_filter` und würde dann aus `basic-control/` bauen. Das ist semantisch korrekt (basic-control ist die aktive Chain), aber der `deploy.js`-Workflow braucht dann keine Änderung – siehe Abschnitt 3.

---

## 2. 🟠 `.vscode/c_cpp_properties.json` – IntelliSense-Fehler (HOCH)

**Problem:** Zeilen 11 und 45 enthalten:
```json
"D:/code/honey_please/advanced-control",
```
VS Code IntelliSense meldet einen fehlenden Include-Pfad. Die Datei ist zwar auto-generiert (PlattformIO regeneriert sie bei `pio run`), aber erst nachdem `platformio.ini` korrigiert wurde.

**Vorschlag:** Nach Korrektur von `platformio.ini` einmal `pio run -e r4wifi` ausführen – die Datei wird automatisch neu generiert. Keine manuelle Editierung nötig (die Datei steht selbst in `.gitignore`).

**Aktion:** Abhängig von Fix #1. Kein manueller Eingriff.

---

## 3. 🟠 `deploy.js` – Defekter Deploy-Workflow (HOCH)

**Problem:** Das Skript deployed Environment `r4wifi` (Z. 126, 130), das über `src_dir = advanced-control` keine Sourcen mehr findet. Selbst nach Fix von #1 deployed es dann die basic-control-Firmware – was okay ist, aber das Skript dokumentiert das nicht.

**Fragen zur Entscheidung:**
- Soll `deploy.js` erhalten bleiben und nach Fix von #1 die basic-control-Firmware deployen?
- Oder soll `deploy.js` komplett entfernt werden, da der basic-control-Workflow bereits `basic_control_flash.js` hat?

**Vorschlag:** `deploy.js` entfernen. Der basic-control-Workflow (`npm run basic-control:build` / `npm run basic-control:flash`) deckt Build + Flash bereits ab. Der Selfcheck in `deploy.js` testet zudem Endpunkte, die nur in der advanced-control-Firmware existierten (HTTP /status, WebSocket /ws).

---

## 4. 🟠 `tests/selfcheck.js` – Testet nicht existierende Endpunkte (HOCH)

**Problem:** Das Skript testet:
1. `GET /status` – nur in advanced-control-Firmware vorhanden
2. `WebSocket /ws` – nur in advanced-control-Firmware vorhanden
3. JSON-State-Frames – advanced-control-spezifisches Protokoll

Die basic-control-Firmware hat keinen WiFi-Stack und exponiert keine HTTP/WS-Endpunkte.

**Vorschlag:** Entweder:
- **A)** `tests/selfcheck.js` und `tests/package.json` entfernen (da basic-control keine Netzwerk-Endpunkte hat)
- **B)** Selbstcheck für basic-control neu schreiben (USB-Serial-Konnektivität statt HTTP/WS)

**Empfehlung:** Variante A. Der basic-control-Workflow validiert über USB Serial Monitor – ein Netzwerk-Selbstcheck ist dafür nicht sinnvoll.

---

## 5. 🟡 `serve.js` – Server für gelöschtes `data/`-Verzeichnis (MITTEL)

**Problem:** `serve.js` dient Dateien aus `data/` auf `localhost:5500`. Mit dem Entfernen von `advanced-control/` wurde auch `data/` gelöscht (enthielt `index.html`, `style.css`, `app.js` – die WebUI des advanced-control-Stacks).

**Vorschlag:** Entfernen, da:
- Kein `data/`-Verzeichnis mehr existiert
- Die WebUI nur mit der advanced-control-Firmware sinnvoll war
- basic-control rein über USB-Serial bedient wird

---

## 6. 🟡 `package.json` – Tote npm-Scripts (MITTEL)

**Problem:**
- Zeile 9: `"-- unused scribts below -- "` – Tippfehler („scribts“)
- Zeile 12–14: `build`, `deploy`, `deploy-COM3-left` – targetieren `deploy.js` (s.o.)
- Zeile 10–11: `start`, `serve` – targetieren `serve.js` (s.o.)
- Zeile 15–16: `test`, `selfcheck` – targetieren `tests/selfcheck.js` (s.o.)

**Vorschlag:** Bereinigen auf den aktiven Workflow:
```json
{
  "name": "honey-please",
  "version": "1.6.0",
  "description": "Honigschleuder motor control – basic-control firmware tooling",
  "private": true,
  "scripts": {
    "build": "node basic_control_flash.js --build-only",
    "flash": "node basic_control_flash.js"
  },
  "devDependencies": {
    "ws": "^8.20.0"
  }
}
```
(`ws`-Dependency kann ebenfalls raus, wenn `selfcheck.js` entfernt wird.)

---

## 7. 🟡 `README.md` – Veraltete Projektstruktur + Dokumentation (MITTEL)

**Problem:** Mehrere Abschnitte beschreiben die nicht mehr existierende advanced-control-Chain:

| Zeilen | Inhalt | Aktion |
|---|---|---|
| 7–10 | „Development Chains“ erklärt advanced-control als „future architecture“ | Umschreiben: nur basic-control dokumentieren |
| 65–100 | „Deploying Code Changes“ – `npm run deploy`, `deploy.js`, OTA | Entfernen oder durch basic-control-Workflow ersetzen |
| 128–166 | Projektstruktur-Baum mit voller advanced-control-Struktur | Baum auf aktuellen Stand bringen |
| 170–193 | „Board Endpoints“ – HTTP/WS-API der advanced-control-Firmware | Entfernen (basic-control hat keine Netzwerk-API) |
| 197–233 | Troubleshooting + Architecture Notes – referenzieren advanced-control-Konzepte | Bereinigen |

**Vorschlag:** Komplette README-Überarbeitung mit Fokus auf basic-control. Der Umfang rechtfertigt ein eigenes Dokument – siehe Abschnitt „Empfohlene Vorgehensweise“ am Ende.

---

## 8. 🟡 `ARCHITECTURE.md` – Tote Pfade + Domain-Index (MITTEL)

**Problem:**

| Zeilen | Inhalt | Aktion |
|---|---|---|
| 13–14 | „advanced-control/ is legacy“ | Entfernen – ist jetzt irrelevant |
| 49 | `deploy.js` in Folder-Map | Entfernen (wenn deploy.js gelöscht wird) |
| 63–64 | `advanced-control/` in Folder-Map | Entfernen |
| 70 | `FEATURE-OVERVIEW.md` | Pfad prüfen – `docs/` existiert nicht mehr |
| 83–98 | Domain-Index referenziert `docs/ops/`, `docs/hardware/`, `docs/current_task.md` | Alle diese Pfade sind tot (`docs/` wurde mit advanced-control gelöscht) |
| 108 | „advanced-control/ is legacy“ in Key Decisions | Entfernen |
| 118 | Maintenance Rule 2 referenziert `docs/ops/README.md` | Aktualisieren |

**Vorschlag:** Folder-Map und Domain-Index auf den aktuellen Stand bringen. Alle Verweise auf `docs/`-Unterverzeichnisse prüfen – sie wurden mit `advanced-control/docs/` gelöscht.

---

## 9. 🟡 `AGENTS.md` – Überholte Agent-Instruktionen (MITTEL)

**Problem:**

| Zeilen | Inhalt | Aktion |
|---|---|---|
| 9–10 | „advanced-control ist ausser Betrieb“ | Entfernen – jetzt redundant |
| 36 | „Legacy-Skripte fuer advanced-control Web-Stack“ | Entfernen |
| 42 | `docs/FEATURE-OVERVIEW.md` | Toter Pfad (existiert nicht mehr) |
| 43 | `docs/current_task.md` | Toter Pfad |
| 48 | „unklar zwischen basic-control und advanced-control“ | Entfernen |

**Vorschlag:** AGENTS.md auf den aktuellen Scope (nur basic-control) konsolidieren. Die Dokumentationspfade in Zeilen 41–43 durch existierende Dateien ersetzen.

---

## 10. 🟢 `.gitignore` – Toter Eintrag (NIEDRIG)

**Problem:** Zeile 10:
```gitignore
advanced-control/secrets.h
```
Diese Datei existiert nicht mehr, der Eintrag ist wirkungslos.

**Vorschlag:** Entfernen. Optional: falls basic-control jemals Secrets braucht, einen neuen Eintrag anlegen.

---

## 11. 🟢 `basic-control/config.h` – Historischer Kommentar (NIEDRIG)

**Problem:** Zeile 8:
```cpp
* Quelle: docs/base_honey_extractor_controller.ino (erstellt mit Google Gemini)
```
Die referenzierte Datei (`advanced-control/docs/base_honey_extractor_controller.ino`) existiert nicht mehr.

**Vorschlag:** Kommentar aktualisieren oder entfernen. Der Verweis auf die Gemini-Baseline ist historisch interessant, aber der Pfad ist tot. Optional den Hinweis auf das zip-Archiv umbiegen.

---

## 12. 🟢 `basic_control_flash.js` – Historischer Kommentar (NIEDRIG)

**Problem:** Zeile 5:
```js
 * Source  : basic-control/main.cpp  (from docs/base_honey_extractor_controller.ino)
```
Gleicher toter Pfad wie #11.

**Vorschlag:** Analog zu #11 – Kommentar aktualisieren oder entfernen.

---

## Abhängigkeiten der Fixes

```
platformio.ini (#1)
    └── .vscode/c_cpp_properties.json (#2) – auto-fix durch pio run

deploy.js (#3) – hängt von platformio.ini ab
tests/selfcheck.js (#4) – unabhängig
serve.js (#5) – unabhängig
package.json (#6) – hängt von #3, #4, #5 ab
README.md (#7) – hängt von Struktur-Entscheidungen in #3–#6 ab
ARCHITECTURE.md (#8) – hängt von Struktur-Entscheidungen ab
AGENTS.md (#9) – hängt von #8 ab
.gitignore (#10) – unabhängig
basic-control/config.h (#11) – unabhängig
basic_control_flash.js (#12) – unabhängig
```

---

## Empfohlene Vorgehensweise

### Phase 1: Build-Blocker sofort beheben
1. `platformio.ini`: `src_dir` auf `basic-control` ändern oder entfernen
2. `pio run -e r4wifi` ausführen → regeneriert `c_cpp_properties.json`

### Phase 2: Tote Skripte + Tooling bereinigen
3. `deploy.js` entfernen (oder dokumentieren, dass es jetzt basic-control deployed)
4. `serve.js` entfernen
5. `tests/selfcheck.js` + `tests/package.json` entfernen
6. `package.json` auf minimalen Workflow konsolidieren
7. `npm uninstall ws` (war nur für selfcheck.js nötig), dann `node_modules/` löschen

### Phase 3: Dokumentation aktualisieren
8. `README.md` – Projektstruktur, Development Chains, Deploy-Section, Board Endpoints überarbeiten
9. `ARCHITECTURE.md` – Folder-Map, Domain-Index, Key Decisions aktualisieren
10. `AGENTS.md` – Scope-Deklarationen + Doku-Pfade aktualisieren
11. `.gitignore` – toten `advanced-control/secrets.h`-Eintrag entfernen
12. Kommentare in `basic-control/config.h` + `basic_control_flash.js` glattziehen

### Phase 4: Verifikation
13. `npm run build` muss sauber durchlaufen
14. `npm run flash` muss auf das Board flashen
15. VS Code: keine gelben Wellenlinien in Include-Pfaden
16. `git status` – keine unerwarteten Untracked-Files

---

## Risiken

- **`docs/`-Verzeichnis am Repo-Root:** Falls es vor dem Zip-Vorgang existierte und wichtige Dokumentation enthielt, die nicht aus `advanced-control/docs/` stammte, muss geprüft werden, ob diese Dateien wiederhergestellt werden müssen. Aktuell existiert `docs/` nicht auf Disk.
- **`.pio/`-Cache:** Nach Änderung von `src_dir` einmal `pio run -e r4wifi_basic_control` ausführen, damit der Build-Cache nicht mit alten advanced-control-Pfaden kollidiert.
- **Zip-Archiv:** Das `.zip` mit den advanced-control-Dateien liegt vermutlich im Repo-Root (`.gitignore` hat jetzt `*.zip`). Sicherstellen, dass das Archiv nicht versehentlich committed wird.
