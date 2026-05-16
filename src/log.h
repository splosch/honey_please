// src/log.h
// Logging for Arduino Uno R4 WiFi (single-threaded, USB CDC Serial).
//
// R4 migration (M6.10, 2026-05-16):
//   - Removed FreeRTOS queue (not available on R4 – single-threaded loop)
//   - Removed WebSerial (ESP32-specific)
//   - Removed logDrain() – no longer needed; LOG() writes directly
//   - LOG() now calls Serial.println() directly (safe from loop() only)
//   - logDrain() kept as a no-op so callers in main.cpp compile without change
//     until main.cpp is rewritten (M6.2).
#pragma once
#include <Arduino.h>

// Direct Serial output – R4 uses native USB CDC, 115200 baud, no driver needed.
#define LOG(msg) Serial.println(msg)

// No-op stub – retained so any existing logDrain() call in main.cpp still compiles.
// Remove once main.cpp is rewritten (M6.2).
inline void logDrain() {}
