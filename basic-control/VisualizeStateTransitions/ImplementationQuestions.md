# BMP-Visualisierungs-Engine: Konzept & Architektur

Dieses Dokument beschreibt den Zweck und die Architektur der State-Machine-BMP-Visualisierungs-Engine. Es dient als konzeptionelle Referenz, nicht als Implementierungsanleitung. Alle konkreten Werte, Formeln und Code-Details leben in den Modulen unter `basic-control/docs/js/`.

## 1. Zweck

Die Engine analysiert das zeitliche und physikalische Verhalten der Motor-State-Machine und exportiert die Zustandsübergänge als pixelgenaue 1:1-Bitmap (BMP). Jede Pixelspalte repräsentiert einen Simulationsschritt, jede Zeile eine Drehzahlstufe. Das BMP-Format ist bewusst roh und unkomprimiert — es dient als mathematisch exaktes Diagnose-Werkzeug zur schnellen visuellen Erkennung von Logikfehlern, Edge-Cases und Timing-Problemen.

## 2. Architektur-Entscheidungen

### 2.1 Technologie: JavaScript ES-Module in der bestehenden Vue-3-Dokumentation

Die Engine ist Teil der interaktiven Dokumentation (`basic-control/docs/`), die als Zero-Build-Vue-3-App mit ES-Modulen läuft. Die State-Machine-Logik (`honey_state_machine.js`) ist bereits als Zeile-für-Zeile-verifiziertes JS-Mirror des C++-Codes vorhanden. Ein Neuaufbau in anderer Sprache würde diese Verifikationsarbeit entwerten.

### 2.2 State Machine: Echte Instanz, nicht Mock

Die Engine verwendet eine **eigene, zweite Instanz** der echten `HoneyStateMachine` (nicht die Vue-reaktive aus `useSimulation`). Diese Instanz läuft headless in einer engen Simulations-Schleife mit virtuellem Taktgeber und schreibt ihre Zustände Tick-für-Tick in ein 2D-Array.

**Begründung:**
- Die Rampenberechnung (`scaleTimeByDelta`, asymmetrische Bremsrampen, proportionale Abbruche) ist in `honey_state_machine.js` vollständig und verifiziert implementiert.
- Ein vereinfachter Mock würde die tatsächlichen Timing-Effekte nicht korrekt abbilden und wäre als Diagnose-Werkzeug wertlos.
- Die C++-Konfiguration (`config.h` + `speed_dataset.cpp`) ist 1:1 in `honey_config.js` gespiegelt — die echten Hardware-Parameter sind die Single Source of Truth.

**Zukunftssicherheit:** Falls später eine C++-Anbindung (WebAssembly, WebSerial) gewünscht ist, muss nur die Simulations-Loop eine andere `tick()`-Quelle bekommen — die BMP-Schreiblogik und Matrix-Arithmetik bleiben unverändert.

### 2.3 Skalierung: BMP 1:1, Canvas skaliert

- **BMP-Datei:** Immer native 1:1-Auflösung (X = Anzahl Ticks, Y = Drehzahl-Stufen + 1 Event-Zeile). Kein Upscaling im BMP selbst — hält die Datei klein und mathematisch exakt.
- **Canvas-Vorschau:** Rendert das BMP mit `imageSmoothingEnabled = false` (scharfe Pixel) und konfigurierbarem `displayScale` (Slider 1×–12×).
- **Export:** Download-Button erzeugt einen Blob-Download des 1:1-BMPs.

## 3. Datenfluss

```
honey_config.js (Parameter)
        │
        ▼
┌─────────────────────┐
│  useBmpSimulation   │  ← Headless, KEIN Vue-Reactivity-Overhead
│  (Batch-Simulator)   │
│                     │
│  1. Erzeugt eigene  │
│     HoneyStateMachine│
│  2. Virtuelle Uhr    │
│  3. Tick-Schleife    │
│  4. Schreibt 2D-     │
│     Matrix[][]       │
└────────┬────────────┘
         │  { matrix, width, height }
         ▼
┌─────────────────────┐
│  bmpWriter.js       │  ← Pure function: matrix → ArrayBuffer
│  (BMP-Byte-Writer)  │     BMP Header (54 bytes)
│                     │     + Pixel Data (BGR, Row-Padded)
└────────┬────────────┘
         │  ArrayBuffer
         ▼
┌─────────────────────┐
│  BmpGenerator /      │  ← Vue-Komponente / Standalone-Page
│  SequenzeVisualizer  │
│                     │
│  • <canvas> Preview │
│  • Zoom-Slider      │
│  • Szenario-Selector│
│  • Download-Button  │
│  • Farb-Legende     │
└─────────────────────┘
```

## 4. Modul-Verantwortlichkeiten

| Modul | Pfad | Verantwortung | Warum separat? |
|---|---|---|---|
| `simulationScenarios.js` | `docs/js/lib/` | Szenario-Definitionen + BMP-Farbpalette | Daten von Logik trennen. Neue Szenarien ohne Code-Änderung hinzufügbar. |
| `hardwareFaultScenarios.js` | `docs/js/lib/` | Hardware-Fehlerinjektions-Szenarien (H1–H13) | Fehlerszenarien getrennt von normalen Szenarien. |
| `hardware_fault_injector.js` | `docs/js/lib/` | Relay-Fehlermodell (STUCK_AT, GLITCH, CROSSTALK, …) | Unabhängige Fehlersimulation, kein Eingriff in State-Machine-Logik. |
| `bmpWriter.js` | `docs/js/lib/` | Reiner BMP-Byte-Writer | Pure Function, kein DOM. Unit-testbar. Auch serverseitig (Node.js) verwendbar. |
| `useBmpSimulation.js` | `docs/js/composables/` | Headless Batch-Simulation | Kein Vue-Overhead. Austauschbar gegen C++/WebSerial-Backend. |
| `SequenzeVisualizer.html` | `VisualizeStateTransitions/` | Einzel-Szenario UI (Vue + Canvas) | Dünne Präsentationsschicht — importiert nur aus den Modulen. |
| `CompareAllSzenarios.html` | `VisualizeStateTransitions/` | Snapshot-Viewer: dichte 1:1-Tabelle | Lädt index.json → zeigt alle BMPs eines Snapshots. Zukunftsbereit für Side-by-Side-Diff. |
| `generate_all_bmps.js` | `VisualizeStateTransitions/` | npm run snapshot: Batch-Generator | Node.js (CommonJS + dynamic import). Liest git SHA, erstellt versionierten Ordner, schreibt BMPs + Manifeste. |

## 5. Konfigurations-Parameter (konzeptionell)

Alle physikalischen und zeitlichen Werte stammen aus `honey_config.js` (JS-Mirror von `config.h` + `speed_dataset.cpp`). Die Engine enthält **keine** hartcodierten Zahlenwerte für:

- **Maximaldrehzahl:** `rampReferenceMaxRpm` (Referenz für Y-Achsen-Skalierung)
- **Rampenzeiten:** `accelerationMs` / `decelerationMs` pro Dataset, skaliert via `scaleTimeByDelta(targetRpm / rampReferenceMaxRpm)`
- **Sicherheitspause:** `safetyPauseMs` (Haltezeit vor Richtungswechsel)
- **Zieldrehzahlen:** `targetRpm` pro Dataset (`DATASET_0`, `DATASET_2`, `DATASET_4`, `DATASET_6`)

Visualisierungs-Parameter (Y-Auflösung, Standard-Tick-Dauer) sind als Defaults in den Modulen definiert und pro Szenario überschreibbar.

## 6. BMP-Format (24-Bit RGB, unkomprimiert)

- **Header:** 14 Byte BITMAPFILEHEADER + 40 Byte BITMAPINFOHEADER
- **Pixel-Daten:** Bottom-Up (unterste Zeile zuerst), BGR-Byte-Reihenfolge, jede Zeile auf 4-Byte-Grenze gepadded
- **Y-Achse:** Unterste Zeile = Event-Marker (rot bei Trigger), Zeilen darüber = Drehzahl (Nulllinie in der Mitte)
- **X-Achse:** Eine Spalte pro Simulations-Tick

## 7. Zustands-Farbpalette (BMP-Pixel)

Die Farben sind auf visuelle Unterscheidbarkeit in der BMP-Diagnose optimiert (nicht identisch mit den UI-Farben der Vue-Komponenten). Exakte RGB-Werte siehe `simulationScenarios.js`.

| Zustand | Bedeutung |
|---|---|
| `STANDBY` | Stillstand / Hintergrund |
| `ACCELERATING` | Beschleunigungsrampe |
| `RUNNING_CW` | Konstantfahrt Uhrzeigersinn |
| `RUNNING_CCW` | Konstantfahrt Gegenuhrzeigersinn |
| `DECELERATING` | Bremsrampe |
| `WAITING` | Sicherheitspause vor Richtungswechsel |

## 8. Szenario-System

Jedes Szenario definiert eine Abfolge von getimten Events, die während der Batch-Simulation auf die State Machine einwirken. Events entsprechen den physischen Folientaster-Eingaben (`dirLeft`, `dirRight`, `start`, `stop`). Die Tick-Nummern codieren den Zeitpunkt, nicht absolute Zeit — Multiplikation mit `tickDurationMs` ergibt die virtuelle Zeit in Millisekunden.

Szenarien decken ab:
- Normalfahrt mit regulärem Stop
- Richtungswechsel bei Konstantfahrt
- Frühzeitiger Abbruch während Beschleunigung (proportionale Bremsrampe)
- Richtungswechsel während Beschleunigung
- Start-Trigger in Bremsphase (Unterbrechung der Verzögerung)
- Stop-Trigger in Sicherheitspause (Abbruch des automatischen Richtungswechsels)
- Signal-Prellen (schnelle Start/Stop-Wechsel)

## 9. Verwandte Dateien

- `../docs/honey_config.js` — Hardware-Parameter (Source of Truth)
- `../docs/honey_state_machine.js` — State Machine (JS-Mirror des C++-Codes)
- `../docs/js/composables/useSimulation.js` — Vue-Composable für Echtzeit-UI (interaktiver Modus)
- `../docs/js/composables/useBmpSimulation.js` — Headless Batch-Simulator (BMP-Modus)
- `../docs/js/lib/bmpWriter.js` — BMP-Byte-Writer
- `../docs/js/lib/simulationScenarios.js` — Szenarien + BMP-Farbpalette
- `../docs/js/lib/hardwareFaultScenarios.js` — Hardware-Fehlerinjektions-Szenarien
- `../docs/js/lib/hardware_fault_injector.js` — Relay-Fehlermodell
- `SequenzeVisualizer.html` — Einzel-Szenario BMP-Generator (Vue 3 + Canvas)
- `CompareAllSzenarios.html` — Snapshot-Viewer: dichte 1:1-Tabelle aller Szenarien
- `generate_all_bmps.js` — npm run snapshot: headless Batch-Generator → bmp_snapshots/

## 10. Snapshot-System

### Übersicht
Das Snapshot-System ermöglicht pixelgenaue Vorher/Nachher-Vergleiche zwischen Firmware-Versionen. Es generiert alle 41 Szenarien als BMP-Dateien in einem versionierten Ordner und stellt sie in einer dichten 1:1-Tabelle dar.

### Workflow
```
npm run snapshot    # Liest git SHA → erstellt bmp_snapshots/<sha>/
                    # Generiert 41 BMPs + manifest.json
                    # Aktualisiert bmp_snapshots/index.json

npm run docs        # Serve static files
                    # → Tab "📋 Szenario Snapshots" zeigt alle BMPs
```

### Generierte Struktur
```
bmp_snapshots/
├── index.json              # Liste aller Snapshots (SHA, Datum, Anzahl)
└── <sha>/
    ├── manifest.json       # Pro-Szenario: id, name, bmpWidth, bmpHeight, hasHardwareFaults
    ├── normal_cw.bmp       # Szenario-ID als Dateiname
    ├── direction_reversal.bmp
    ├── ... (41 BMPs)
    └── hw_preset_cycle_crosstalk_glitch_combo.bmp
```

### Technische Details
- `generate_all_bmps.js` ist ein CommonJS-Node-Script, das per `import()` die existierenden ES-Module lädt
- Die Simulation verwendet die **echte** `HoneyStateMachine`-Instanz (kein Mock)
- BMPs sind 24-bit unkomprimiert, 42–43 Pixel hoch (41 RPM-Zeilen + Event-Zeile + optionale HW-Fehler-Zeile)
- Breite variiert pro Szenario (60–380 px, abhängig von `totalTicks`)
- `bmp_snapshots/` ist via `.gitignore` von Versionierung ausgeschlossen
