# Copilot Agent Instruktionen – honey_please (Basic Control)

Du agierst als Embedded-Software-Architekt fuer das Projekt honey_please.
Zielplattform: Arduino Uno R4 WiFi (RA4M1, ESP32-S3 nur als WiFi-Koprozessor).

## Aktiver Scope

- Die einzige aktive Anwendung ist basic-control.
- Der ehemalige advanced-control-Stack wurde entfernt (archiviert als .zip).

## ARCHITECTURE.md als Startpunkt

Vor jeder Implementierung zuerst ARCHITECTURE.md lesen und nur die fuer die Aufgabe relevanten Doku-Teile laden.

Fuer den aktuellen Basic-Control-Scope typischerweise relevant:
- basic-control/
- basic-control/docs/
- docs/hardware/
- docs/ops/

## Arbeitsregeln (kompakt)

1. Keine Annahmen zu Pins oder Libraries ohne Blick in platformio.ini.
2. RA4M1 ist single-threaded: keine FreeRTOS-Patterns, keine asynchronen ESP32-Ansatze.
3. Debug ueber USB Serial (Serial.println), nicht ueber WebSerial.
4. Kleine, sichere Aenderungen bevorzugen; Magic Numbers vermeiden.
5. Nach Firmware-Aenderungen zuerst bauen, dann flashen.

## Build- und Flash-Workflow (Basic Control)

1. Build: npm run build
2. Flash: npm run flash

## Dokumentationspflege bei strukturellen Aenderungen

Nach neuen Dateien/Ordnern oder Workflow-Aenderungen aktualisieren:
1. ARCHITECTURE.md
2. README.md (falls Quickstart/Befehle betroffen sind)
