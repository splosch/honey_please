// src/log.h
// Shared logging macro – outputs to USB Serial and WebSerial simultaneously.
// Include this header in every module that needs logging.
// Requires WebSerial to be initialized before the first LOG call.
#pragma once
#include <Arduino.h>
#include <WebSerial.h>

#define LOG(msg) do { Serial.println(msg); WebSerial.println(msg); } while(0)
