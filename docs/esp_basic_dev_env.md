# Milestone-Plan: ESP32 Motorsteuerung (Phase 1: Setup & OTA)

Dieser Plan führt dich von der Hardware-Initialisierung bis hin zum KI-gestützten Deployment.

## Milestone 1: Die professionelle Werkbank (VS Code + PlatformIO)

**Ziel:** Ein stabiles System, das USB-Kommunikation und Debugging erlaubt.

1. **Installation:**

   * VS Code öffnen -> Extensions -> Suche nach **"PlatformIO IDE"** -> Installieren.

   * PlatformIO Home öffnen -> "New Project".

   * **Board:** Wähle dein spezifisches Board (z.B. `Espressif ESP32 Dev Module`).

   * **Framework:** `Arduino`.

2. **USB-Handshake:**

   * ESP32 per USB anschließen.

   * In der `platformio.ini` die `monitor_speed = 115200` setzen.

   * **Hello World:** Erstelle ein Programm, das alle 2 Sekunden "ESP32 bereit für Befehle" über `Serial.println()` ausgibt.

   * **Check:** Erscheint der Output im PlatformIO Serial Monitor?

## Milestone 2: Das Fundament für Copilot (Agentic Feedback Loop)

**Ziel:** Den Copilot Agent so instruieren, dass er den Terminal-Output zur Fehlerbehebung nutzen kann.

1. **Log-Struktur:** Nutze strukturierte Log-Ausgaben (z.B. `[STATUS]`, `[ERROR]`, `[MOTOR]`), damit die KI Muster erkennt.

2. **Copilot Workflow:**

   * Kopiere Fehlermeldungen aus dem Terminal direkt in den Copilot Chat.

   * Instruktion: *"Analysiere diesen ESP32 Serial Output. Warum schlägt die Initialisierung fehl?"*

## Milestone 3: Drahtlose Freiheit (OTA Deployment)

**Ziel:** Code-Updates über WLAN ohne USB-Kabel.

1. **ArduinoOTA Integration:**

   * Integriere die `ArduinoOTA.h` Library.

   * Initialisiere WLAN im `setup()`.

   * Wichtig: `ArduinoOTA.handle();` muss im `loop()` stehen.

2. **Konfiguration:**

   * Ergänze die `platformio.ini` um:

     ```
     upload_protocol = espota
     upload_port = [IP-ADRESSE_DEINES_ESP]
     ```

3. **Check:** Ändere die LED-Blinkfrequenz und deploye per WLAN.

## Milestone 4: Web-Terminal für Remote-Feedback

**Ziel:** Den Monitor-Output im Browser sehen (wichtig, wenn man nicht mehr am USB hängt).

1. **WebSerial:** Nutze Bibliotheken wie `WebSerial`, um den `Serial.print` Output auf einer kleinen Webseite zu spiegeln, die der ESP32 hostet.

2. **Copilot Integration:** Du kannst den HTML-Source des Web-Terminals an Copilot geben, um UI-Verbesserungen für deine Motorsteuerung vorzuschlagen.

## Zusammenfassung der nächsten Schritte

| Schritt | Aktion | Tool | 
| ----- | ----- | ----- | 
| **1** | PlatformIO Projekt erstellen | VS Code | 
| **2** | USB-Blinken & Serial Output | main.cpp | 
| **3** | WLAN Credentials hinterlegen | Secrets | 
| **4** | OTA Upload testen | WiFi | 