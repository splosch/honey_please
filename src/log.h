// src/log.h
// Thread-safe logging for dual-core ESP32.
//
// AsyncTCP callbacks run on Core 0; loop() runs on Core 1.
// Calling WebSerial.println() from Core 0 while Core 1 is also sending
// causes a data race inside the WebSocket send buffer → crash.
//
// Solution: LOG() posts a fixed-size char[] message to a FreeRTOS queue.
// logDrain() must be called at the top of loop() to dequeue and emit.
// Serial.println() is safe from any core; WebSerial.println() is only
// ever called from Core 1 (loop) via logDrain().
//
// Queue depth: 32 entries × 128 bytes = 4 KB. Messages that overflow the
// queue are silently dropped (non-blocking send). Truncation at 127 chars.
#pragma once
#include <Arduino.h>
#include <WebSerial.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

static constexpr size_t LOG_ITEM_LEN   = 128;
static constexpr size_t LOG_QUEUE_DEPTH = 32;

inline QueueHandle_t& _logQueue() {
    static QueueHandle_t q = xQueueCreate(LOG_QUEUE_DEPTH, LOG_ITEM_LEN);
    return q;
}

// Post a message to the log queue from any core/task.
inline void _logPost(const String& msg) {
    char buf[LOG_ITEM_LEN];
    msg.toCharArray(buf, LOG_ITEM_LEN);   // truncates gracefully at 127 chars
    xQueueSend(_logQueue(), buf, 0);      // non-blocking; drop if full
}

// Drain the queue and emit to Serial + WebSerial. Call from loop() only.
inline void logDrain() {
    char buf[LOG_ITEM_LEN];
    while (xQueueReceive(_logQueue(), buf, 0) == pdTRUE) {
        Serial.println(buf);
        WebSerial.println(buf);
    }
}

#define LOG(msg) _logPost(msg)
