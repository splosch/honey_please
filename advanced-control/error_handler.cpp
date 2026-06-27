// src/error_handler.cpp
#include "error_handler.h"
#include "motor_driver.h"
#include "log.h"

ErrorSeverity ErrorHandler::severityOf(ErrorCode code) {
    switch (code) {
        case ErrorCode::OVERSPEED:
        case ErrorCode::DRIVER_FAULT:
        case ErrorCode::EMERGENCY_STOP:
            return ErrorSeverity::CRITICAL;
        case ErrorCode::RPM_SENSOR_LOST:
            // F05: EMERGENCY_STOP + operator-reset required → treat as CRITICAL
            return ErrorSeverity::CRITICAL;
        case ErrorCode::PARAM_INVALID:
            return ErrorSeverity::ERROR_LVL;
        case ErrorCode::STALL:
        case ErrorCode::RAMP_DEVIATION:
        default:
            return ErrorSeverity::WARNING;
    }
}

void ErrorHandler::trigger(ErrorCode code, const char* message) {
    if (code == ErrorCode::NONE) return;

    // Deduplicate: update timestamp if already active
    for (uint8_t i = 0; i < _count; i++) {
        if (_errors[i].code == code) {
            _errors[i].timestamp_ms = millis();
            return;
        }
    }

    if (_count < MAX_ACTIVE_ERRORS) {
        _errors[_count++] = { code, message, millis() };
    }

    LOG(String("[ERROR] E0") + (uint8_t)code + " – " + message);

    if (severityOf(code) == ErrorSeverity::CRITICAL) {
        _criticalActive = true;
        _driver.setDutyCycle(0);
        _driver.disable();
        LOG("[FAULT_STOP] Motor disabled. Use 'resetfault' to recover.");
    }
}

void ErrorHandler::clear(ErrorCode code) {
    if (severityOf(code) == ErrorSeverity::CRITICAL) {
        LOG("[ERROR] CRITICAL errors require 'resetfault' – use clearAll()");
        return;
    }
    for (uint8_t i = 0; i < _count; i++) {
        if (_errors[i].code == code) {
            // Shift remaining entries left
            for (uint8_t j = i; j < _count - 1; j++) {
                _errors[j] = _errors[j + 1];
            }
            _count--;
            LOG(String("[ERROR] E0") + (uint8_t)code + " cleared");
            return;
        }
    }
}

void ErrorHandler::clearAll() {
    _count          = 0;
    _criticalActive = false;
    LOG("[ERROR] All errors cleared – system ready");
}
