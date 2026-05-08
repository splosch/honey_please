// src/error_handler.h
// Error state registry and CRITICAL response.
//
// Severity policy:
//   CRITICAL  → immediate PWM cut + driver disable (FAULT_STOP).
//               Cannot be cleared without explicit operator reset.
//   ERROR_LVL → motor may keep running; UI highlights affected component.
//   WARNING   → informational; motor unaffected.
//
// ErrorCode values match the E0x display codes (E03–E09).
#pragma once
#include <Arduino.h>

// Forward declaration – avoids pulling motor_driver.h into every consumer
class IMotorDriver;

enum class ErrorCode : uint8_t {
    NONE            = 0,
    RPM_SENSOR_LOST = 3,   // E03 – no pulse while powered
    OVERSPEED       = 4,   // E04 – measured RPM > PHYSICAL_MAX_RPM
    STALL           = 5,   // E05 – powered but RPM < stall_rpm_min for stall_detect_s
    DRIVER_FAULT    = 6,   // E06 – nFAULT pin LOW (or injected)
    PARAM_INVALID   = 7,   // E07 – incoming param out of range
    RAMP_DEVIATION  = 8,   // E08 – actual RPM deviates > 10 from projected for > 2 s
    EMERGENCY_STOP  = 9    // E09 – operator-triggered or auto-triggered
};

enum class ErrorSeverity : uint8_t { WARNING, ERROR_LVL, CRITICAL };

struct ActiveError {
    ErrorCode   code;
    const char* message;
    uint32_t    timestamp_ms;
};

static constexpr uint8_t MAX_ACTIVE_ERRORS = 8;

class ErrorHandler {
    IMotorDriver& _driver;
    ActiveError   _errors[MAX_ACTIVE_ERRORS];
    uint8_t       _count          = 0;
    bool          _criticalActive = false;

    static ErrorSeverity severityOf(ErrorCode code);

public:
    explicit ErrorHandler(IMotorDriver& driver) : _driver(driver) {}

    // Trigger an error. CRITICAL errors cut PWM immediately.
    // Duplicate codes are deduplicated (timestamp updated).
    void trigger(ErrorCode code, const char* message);

    // Clear a WARNING or ERROR_LVL error (CRITICAL errors are ignored here).
    void clear(ErrorCode code);

    // Clear all errors – only call after explicit operator reset gesture.
    void clearAll();

    bool           hasCritical() const { return _criticalActive; }
    uint8_t        count()       const { return _count; }
    const ActiveError* errors()  const { return _errors; }
};
