#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include "secrets.h"

// --- KONFIGURATION ---
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

void setup() {
  Serial.begin(115200);
  Serial.println("[START] Initialisiere ESP32...");

  // WLAN Verbindung
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  while (WiFi.waitForConnectResult() != WL_CONNECTED) {
    Serial.println("[ERROR] Verbindung fehlgeschlagen! Neustart...");
    delay(5000);
    ESP.restart();
  }

  // OTA Setup
  ArduinoOTA.setHostname("esp32-motor-control");
  
  ArduinoOTA.onStart([]() {
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
    Serial.println("[OTA] Start Update " + type);
  });
  
  ArduinoOTA.onEnd([]() { Serial.println("\n[OTA] Erfolg!"); });
  
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Fehler [%u]\n", error);
  });

  ArduinoOTA.begin();

  Serial.println("[READY] ESP32 ist bereit.");
  Serial.print("[INFO] IP-Adresse: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  ArduinoOTA.handle();

  // Dein Hello World Feedback
  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 5000) {
    lastMsg = millis();
    Serial.println("[HEARTBEAT] ESP32 läuft stabil - Bereit für Copilot Instruktionen.");
  }
}