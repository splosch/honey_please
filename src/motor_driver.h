// src/motor_driver.h
// HAL boundary for all motor output.
//
// IMotorDriver  – pure interface; never call GPIO directly outside of this.
// SimMotorDriver – Phase 1–4: all state in memory, zero GPIO activity.
//                  injectFault() supports F08 fault injection.
// RealMotorDriver – Phase 5: PWM + GPIO (src/real_motor_driver.h, deferred).
//
// Selection in main.cpp:
//   #if defined(REAL_HARDWARE)
//       RealMotorDriver motorDriverImpl;
//   #else
//       SimMotorDriver  motorDriverImpl;
//   #endif
//   IMotorDriver* motorDriver = &motorDriverImpl;
#pragma once
#include <Arduino.h>
#include "log.h"

class IMotorDriver {
public:
    virtual void    begin()                    = 0;
    virtual void    setDutyCycle(uint8_t duty) = 0;  // 0–255
    virtual void    setDirection(bool cw)      = 0;
    virtual void    enable()                   = 0;
    virtual void    disable()                  = 0;
    virtual bool    isFault()                  = 0;  // nFAULT pin or injected
    virtual uint8_t getDutyCycle()       const = 0;
    virtual bool    getDirection()       const = 0;
    virtual bool    isEnabled()          const = 0;
    virtual ~IMotorDriver() {}
};

// SimMotorDriver: no GPIO writes. All methods update in-memory state only.
class SimMotorDriver : public IMotorDriver {
    uint8_t _duty    = 0;
    bool    _cw      = true;
    bool    _enabled = false;
    bool    _fault   = false;
public:
    void    begin()                    override { LOG("[SIM] MotorDriver ready"); }
    void    setDutyCycle(uint8_t duty) override { _duty = duty; }
    void    setDirection(bool cw)      override { _cw = cw; }
    void    enable()                   override { _enabled = true; }
    void    disable()                  override { _enabled = false; _duty = 0; }
    bool    isFault()                  override { return _fault; }
    uint8_t getDutyCycle()       const override { return _duty; }
    bool    getDirection()       const override { return _cw; }
    bool    isEnabled()          const override { return _enabled; }

    // F08 fault injection – call from WebSerial command handler
    void injectFault(bool active) { _fault = active; }
};
