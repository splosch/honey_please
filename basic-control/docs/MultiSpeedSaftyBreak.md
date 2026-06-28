# Copilot Context: Honey Extractor Control with Multi-Stage Safety Brake

Technical specification for honey extractor automation using **ESP32/Arduino**, Relays, and **Oriental Motor BLFD120** (BLF Series) in **3-Wire Input Mode**. Features a physical-safe 2-stage deceleration process upon lid release to protect honeycombs and gears.

## 1. System-Architektur & Pin-Mapping

### Hardware-Schnittstellen (ESP32 -> Relais/Sensor -> Treiber)

* **M0**: Fest verdrahtet auf GND (`LOW`)

* **M1 (Relais 1)**: Steuerpin für Geschwindigkeitsstufe / Rampe

* **M2 (Relais 2)**: Steuerpin für Geschwindigkeitsstufe / Rampe

* **START/STOP (X1)**: Motorfreigabe (ON = Run, OFF = Decel Stop)

* **RUN/BRAKE (X2)**: Notstopp/Bremse (ON = Run, OFF = Instant Stop)

* **CW/CCW (X3)**: Drehrichtung (ON = CW, OFF = CCW)

* **LID_SAFETY_PIN**: Eingang für Honigwabenöffnungshubschalter (Sicherheitsschalter).

  * *Logik*: `LOW`/`Closed` = Deckel geschlossen (Sicher) | `HIGH`/`Open` = Deckel geöffnet (Gefahr!)

## 2. Multi-Speed Binär-Mapping (M0 = GND)

| **Datensatz** | **M2 (Relais 2)** | **M1 (Relais 1)** | **M0 (Hardwire)** | **Ziel-Drehzahl (rPM)** | **Beschleunigung (Ac)** | **Bremsrampe (dc)** | **Reale Bremszeit** |
|---|---|---|---|---|---|---|---|
| `dAtA 0` | `LOW` (OFF) | `LOW` (OFF) | `LOW` (GND) | 750 r/min | 15.0 s | **2.5 s** | Für Stufe 1 der Sicherheitsbremsung |
| `dAtA 2` | `LOW` (OFF) | `HIGH` (ON) | `LOW` (GND) | 1500 r/min | 10.0 s | 2.0 s | Normalbetrieb Stufe 1 |
| `dAtA 4` | `HIGH` (ON) | `LOW` (OFF) | `LOW` (GND) | 2500 r/min | 8.0 s | 1.5 s | Normalbetrieb Stufe 2 |
| `dAtA 6` | `HIGH` (ON) | `HIGH` (ON) | `LOW` (GND) | 0 r/min | 0.2 s | **0.2 s** | Für Stufe 2 (End-Lock) |

### Preset-Umschaltung mit nur einem Relais (implementiert in basic-control)

Zur Minimierung von Zwischenzustaenden bei Relais-Umschaltungen verwendet `basic-control`
standardmaessig ein Preset-Paar mit nur **einem** Bitwechsel:

* **Preset 1 (Gelb-1): `dAtA 0`** -> `M1=LOW`, `M2=LOW`
* **Preset 2 (Gelb-2): `dAtA 4`** -> `M1=LOW`, `M2=HIGH`

Damit bleibt `M1` konstant und nur `M2` schaltet. Das reduziert Unsicherheit durch
Relais-Laufzeitdifferenzen/Bounce gegenueber einem 2-Bit-Wechsel (z. B. `dAtA 2 <-> dAtA 4`).

Hinweis:

* Diese Zuordnung ist in `basic-control/config.h` ueber `preset1Dataset` / `preset2Dataset`
    konfigurierbar.
* Falls fuer deinen Prozess andere Ziel-drehzahlen benoetigt werden, die VFD-Parameter in den
    verwendeten dAtA-Slots entsprechend programmieren.

## 3. State Machine & Sicherheits-Bremslogik

```
                 +--------------+
                 |     IDLE     | <--------------------------------------------+
                 +--------------+                                              |
                        | Start-Befehl & Deckel ZU                             |
                        v                                                      |
                 +--------------+                                              |
                 |  SPIN_LOW    | --[Deckel GEÖFFNET]                          |
                 +--------------+                   |                          |
                        |                           |                          |
                        | Timer abgelaufen          |                          |
                        v                           |                          |
                 +--------------+                   |                          |
                 |  SPIN_HIGH   | --[Deckel GEÖFFNET]                          |
                 +--------------+                   |                          |
                        |                           |                          |
                        | Timer abgelaufen          |                          |
                        v                           v                          |
                 +--------------+           +------------------+               |
                 |  DYN_BRAKE   | --------> |  SAFETY_STAGE_1  | (Sachte Bremsung auf 750 r/min)
                 +--------------+           +------------------+               |
                        |                           |                          |
                        | Normaler Stopp            | 1.25 Sek. abgelaufen     |
                        v                           v                          |
                 +--------------+           +------------------+               |
                 |   SHUTDOWN   |           |  SAFETY_STAGE_2  | (Schnellstopp von 750 auf 0 r/min)
                 +--------------+           +------------------+               |
                        |                           |                          |
                        |                           | 0.15 Sek. abgelaufen     |
                        |                           v                          |
                        |                   +------------------+               |
                        |                   |    SAFE_WAIT     |               |
                        |                   +------------------+               |
                        |                           |                          |
                        +---------------------------+--------------------------+
                                  Sicherheits-Reset (Deckel ZU)


```

### Logische Schrittfolge für die 2-stufige Sicherheitsbremsung:

1. **Auslösung (Deckel im Betrieb geöffnet)**:

   * System wechselt sofort von `SPIN_LOW` / `SPIN_HIGH` in `SAFETY_STAGE_1`.

2. **Phase 1: SAFETY_STAGE_1 (Sanftes Abfangen)**:

   * `START/STOP (X1)` bleibt `HIGH`.

   * Relais schalten: `M1` = `LOW`, `M2` = `LOW` (Aktiviert `dAtA 0`).

   * Der Motor verzögert von 2250 r/min auf 750 r/min mit der schonenden `dc = 2.5s` Rampe.

   * *Berechnung*: Delta 1500 r/min bei 2.5s Rampe benötigt exakt **1.25 Sekunden**.

   * Der ESP32 wartet blockierungsfrei genau diese 1250 ms ab.

3. **Phase 2: SAFETY_STAGE_2 (Finaler Lock)**:

   * `START/STOP (X1)` bleibt weiterhin `HIGH`.

   * Relais schalten: `M1` = `HIGH`, `M2` = `HIGH` (Aktiviert `dAtA 6`).

   * Der Motor bremst die verbleibenden 750 r/min mit der aggressiven `dc = 0.2s` Rampe auf 0 herunter.

   * *Berechnung*: Delta 750 r/min bei 0.2s Rampe benötigt **0.05 Sekunden** (Sicherheitszuschlag im Code: 150 ms).

4. **Sperrzustand: SAFE_WAIT (Blockierung)**:

   * Alle Ausgänge aus (`START/STOP` = `LOW`, `M1` = `LOW`, `M2` = `LOW`).

   * Ein Wiederanlauf ist gesperrt, solange `LID_SAFETY_PIN` auf `HIGH` steht.

## 4. ESP32 Code-Referenz (C++ Pseudocode)

```C
enum State { IDLE, SPIN_LOW, SPIN_HIGH, DYN_BRAKE, SAFETY_STAGE_1, SAFETY_STAGE_2, SAFE_WAIT, SHUTDOWN };
State currentState = IDLE;
unsigned long safetyTimer = 0;

void checkSafetySwitch() {
    if (digitalRead(LID_SAFETY_PIN) == HIGH && 
       (currentState == SPIN_LOW || currentState == SPIN_HIGH || currentState == DYN_BRAKE)) {
        currentState = SAFETY_STAGE_1;
        safetyTimer = millis(); // Startzeitpunkt für Stufe 1 sichern
    }
}

void loop() {
    checkSafetySwitch();
    
    switch (currentState) {
        case IDLE:
            break;
            
        case SPIN_LOW:
            // M1=HIGH, M2=LOW, START/STOP=HIGH (Normalbetrieb 1500 r/min)
            break;
            
        case SPIN_HIGH:
            // M1=LOW, M2=HIGH, START/STOP=HIGH (Normalbetrieb 2250 r/min)
            break;
            
        case SAFETY_STAGE_1:
            // STUFE 1: Aktiv dAtA 0 anfordern (Sanftes Bremsen auf 750 r/min)
            digitalWrite(M1_PIN, LOW);
            digitalWrite(M2_PIN, LOW);
            digitalWrite(START_STOP_PIN, HIGH); 
            
            // Nach 1.25s ist die Geschwindigkeit materialschonend abgebaut
            if (millis() - safetyTimer >= 1250) {
                currentState = SAFETY_STAGE_2;
                safetyTimer = millis(); // Timer für Stufe 2 zurücksetzen
            }
            break;
            
        case SAFETY_STAGE_2:
            // STUFE 2: Aktiv dAtA 6 anfordern (Harter End-Lock von 750 auf 0 r/min)
            digitalWrite(M1_PIN, HIGH);
            digitalWrite(M2_PIN, HIGH);
            digitalWrite(START_STOP_PIN, HIGH);
            
            // Nach 150ms steht der Motor absolut still
            if (millis() - safetyTimer >= 150) {
                currentState = SAFE_WAIT;
            }
            break;
            
        case SAFE_WAIT:
            // Alle Signale trennen, Motor stromlos schalten
            digitalWrite(START_STOP_PIN, LOW);
            digitalWrite(M1_PIN, LOW);
            digitalWrite(M2_PIN, LOW);
            
            // Erst wenn Deckel zu ist, zurück in Bereitschaft
            if (digitalRead(LID_SAFETY_PIN) == LOW) {
                currentState = IDLE;
            }
            break;
            
        case SHUTDOWN:
            break;
    }
}


````