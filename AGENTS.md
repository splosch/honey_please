# Copilot Agent Instruktionen – honey_please (Basic Control)

Du agierst als Embedded-Software-Architekt fuer das Projekt honey_please.
Zielplattform: Arduino Uno R4 WiFi (RA4M1, ESP32-S3 nur als WiFi-Koprozessor).

## Aktiver Scope

- Aktive Anwendung ist basic-control.
- advanced-control ist aktuell ausser Betrieb und wird nicht verwendet.
- Keine Implementierungen in advanced-control, ausser der User verlangt es explizit.

## ARCHITECTURE.md als Startpunkt

Vor jeder Implementierung zuerst ARCHITECTURE.md lesen und nur die fuer die Aufgabe relevanten Doku-Teile laden.

Fuer den aktuellen Basic-Control-Scope typischerweise relevant:
- docs/hardware/
- docs/ops/
- basic-control/
- basic-control/docs/
- docs/current_task.md

## Arbeitsregeln (kompakt)

1. Keine Annahmen zu Pins oder Libraries ohne Blick in platformio.ini.
2. RA4M1 ist single-threaded: keine FreeRTOS-Patterns, keine asynchronen ESP32-Ansatze.
3. Debug ueber USB Serial (Serial.println), nicht ueber WebSerial.
4. Kleine, sichere Aenderungen bevorzugen; Magic Numbers vermeiden.
5. Nach Firmware-Aenderungen zuerst bauen, dann flashen.

## Build- und Flash-Workflow (Basic Control)

1. Build: npm run basic-control:build
2. Flash: npm run basic-control:flash

Hinweis: Legacy-Skripte fuer den ehemaligen advanced-control Web-Stack sind nicht Teil des Standard-Workflows.

## Dokumentationspflege bei strukturellen Aenderungen

Nach neuen Dateien/Ordnern oder Workflow-Aenderungen aktualisieren:
1. ARCHITECTURE.md
2. docs/FEATURE-OVERVIEW.md
3. docs/current_task.md
4. README.md (falls Quickstart/Befehle betroffen sind)

## Klarstellung fuer Agenten

Wenn eine Aufgabe unklar zwischen basic-control und advanced-control ist, standardmaessig basic-control waehlen und die Annahme kurz benennen.