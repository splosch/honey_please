/**
 * @file base_honey_extractor_controller.ino
 * @brief Steuerung für eine Honigschleuder (Selbstwendeschleuder) mit dem Arduino Uno R4 Wi-Fi.
 * * Verwendet den Oriental Motor Treiber im 3-Wire-Modus.
 * Bietet mechanische Schonung durch eine softwarebasierte Zustandsmaschine, 
 * die einen direkten Richtungswechsel blockiert, bis der Motor komplett ausgedreht ist.
 */

// --- PIN DEFINITIONEN ---
const int PIN_RELAY_START = 2;   // Relais 1 (X1 am Treiber) - START/STOP
const int PIN_RELAY_DIR   = 3;   // Relais 2 (X3 am Treiber) - CW/CCW

// Folientaster 1: Richtung (3-Pin)
const int PIN_KEY_LINKS   = 4;   // Button Links (CCW)
const int PIN_KEY_RECHTS  = 5;   // Button Rechts (CW)

// Folientaster 2: Steuerung (5-Pin)
const int PIN_KEY_STOP    = 6;   // Button Rot: Stopp
const int PIN_KEY_YEL1    = 7;   // Button Gelb 1: Programm 1 / Preset 1
const int PIN_KEY_YEL2    = 8;   // Button Gelb 2: Programm 2 / Preset 2
const int PIN_KEY_START   = 9;   // Button Grün: Start

// --- EINSTELLBARE ZEITEN (MECHANISCHER SCHUTZ) ---
// Stellen Sie diese Zeiten passend zu den Werten Ihres Treibers (z.B. dEc2) ein!
const unsigned long BREMSRAMPEN_ZEIT = 5000; // Zeit in Millisekunden, die der Motor zum Auslaufen braucht (z.B. 5 Sek)
const unsigned long SICHERHEITS_PAUSE = 1500; // Zusätzliche Wartezeit zur absoluten Beruhigung der Mechanik (z.B. 1.5 Sek)

const unsigned long GESAMT_STOPP_ZEIT = BREMSRAMPEN_ZEIT + SICHERHEITS_PAUSE;

// --- SYSTEM ZUSTÄNDE (STATE MACHINE) ---
enum SystemState {
  STATE_STANDBY,        // Schleuder steht, wartet auf Start
  STATE_RUNNING_CW,     // Dreht nach Rechts (CW)
  STATE_RUNNING_CCW,    // Dreht nach Links (CCW)
  STATE_DECELERATING,   // Motor bremst ab, Eingaben gesperrt
  STATE_WAITING         // Motor steht still, Sicherheitszeit läuft ab
};

SystemState currentState = STATE_STANDBY;
bool targetDirectionCCW = false; // false = CW (Rechts), true = CCW (Links)

// Zeitmanagement-Variablen
unsigned long stateTimerStart = 0;

void setup() {
  Serial.begin(115200);
  Serial.println(F("=== Honigschleuder-Steuerung initialisiert ==="));

  // Relais-Pins als Ausgänge konfigurieren
  pinMode(PIN_RELAY_START, OUTPUT);
  pinMode(PIN_RELAY_DIR, OUTPUT);

  // Initialer Zustand: Beide Relais aus (Sicherer Zustand)
  digitalWrite(PIN_RELAY_START, LOW);
  digitalWrite(PIN_RELAY_DIR, LOW);

  // Eingänge für Folientaster als INPUT_PULLUP (aktiv LOW beim Drücken)
  pinMode(PIN_KEY_LINKS, INPUT_PULLUP);
  pinMode(PIN_KEY_RECHTS, INPUT_PULLUP);
  pinMode(PIN_KEY_STOP, INPUT_PULLUP);
  pinMode(PIN_KEY_YEL1, INPUT_PULLUP);
  pinMode(PIN_KEY_YEL2, INPUT_PULLUP);
  pinMode(PIN_KEY_START, INPUT_PULLUP);
}

void loop() {
  unsigned long currentMillis = millis();

  // --- ZUSTANDSMASCHINE ---
  switch (currentState) {

    case STATE_STANDBY:
      // Im Standby kann die Richtung jederzeit umgeschaltet werden (da der Motor steht)
      if (digitalRead(PIN_KEY_LINKS) == LOW) {
        targetDirectionCCW = true;
        digitalWrite(PIN_RELAY_DIR, HIGH); // Relais zieht an für CCW
        Serial.println(F("Richtung gewählt: LINKS (CCW)"));
        delay(150); // Einfaches Debouncing
      }
      else if (digitalRead(PIN_KEY_RECHTS) == LOW) {
        targetDirectionCCW = false;
        digitalWrite(PIN_RELAY_DIR, LOW); // Relais fällt ab für CW
        Serial.println(F("Richtung gewählt: RECHTS (CW)"));
        delay(150);
      }

      // Motor starten
      if (digitalRead(PIN_KEY_START) == LOW) {
        Serial.println(F("Schleuder startet..."));
        digitalWrite(PIN_RELAY_START, HIGH); // Start-Relais zieht an
        
        if (targetDirectionCCW) {
          currentState = STATE_RUNNING_CCW;
          Serial.println(F("Zustand: LÄUFT LINKS (CCW)"));
        } else {
          currentState = STATE_RUNNING_CW;
          Serial.println(F("Zustand: LÄUFT RECHTS (CW)"));
        }
        delay(200);
      }
      break;

    case STATE_RUNNING_CW:
    case STATE_RUNNING_CCW:
      // Laufender Betrieb. Richtungs-Eingaben werden hier ignoriert!
      // Nur die STOP-Taste beendet den Zustand.
      if (digitalRead(PIN_KEY_STOP) == LOW) {
        Serial.println(F("Stopp-Signal erhalten! Leite Bremsrampe ein..."));
        digitalWrite(PIN_RELAY_START, LOW); // Relais 1 trennt -> Motor bremst per Rampe ab
        
        stateTimerStart = currentMillis;
        currentState = STATE_DECELERATING;
        Serial.println(F("Zustand: ABBREMSEN (Eingaben gesperrt)"));
        delay(200);
      }
      break;

    case STATE_DECELERATING:
      // Der Motor bremst ab. Alle Tastendrücke sind gesperrt, um mechanische Schocks zu vermeiden.
      if (currentMillis - stateTimerStart >= BREMSRAMPEN_ZEIT) {
        Serial.println(F("Bremsrampe abgelaufen. Starte mechanische Ruhephase..."));
        stateTimerStart = currentMillis;
        currentState = STATE_WAITING;
      }
      break;

    case STATE_WAITING:
      // Der Motor steht still, aber wir warten noch eine kleine Sicherheitszeit ab
      if (currentMillis - stateTimerStart >= SICHERHEITS_PAUSE) {
        Serial.println(F("Sicherheitszeit abgelaufen. Schleuder ist wieder bereit."));
        currentState = STATE_STANDBY;
        Serial.println(F("Zustand: STANDBY"));
      }
      break;
  }

  // --- ERWEITERTE FUNKTIONEN (GELBE TASTEN) ---
  // Diese können später für automatische Programmzyklen oder Drehzahlprofile genutzt werden.
  if (currentState == STATE_STANDBY) {
    if (digitalRead(PIN_KEY_YEL1) == LOW) {
      Serial.println(F("Preset 1 gedrückt (Noch nicht zugewiesen)"));
      delay(200);
    }
    if (digitalRead(PIN_KEY_YEL2) == LOW) {
      Serial.println(F("Preset 2 gedrückt (Noch nicht zugewiesen)"));
      delay(200);
    }
  }
}