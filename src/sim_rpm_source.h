// src/sim_rpm_source.h
// Simulation RPM source – Phase 1–4.
// RPM value comes directly from RampController.getCurrent() so the full
// ramp math is exercised without any hardware.
//
// injectSensorLoss(true) causes isHealthy() to return false, which the
// ErrorHandler picks up as E03_RPM_SENSOR_LOST. Used by F08 fault injection.
#pragma once
#include "rpm_source.h"
#include "ramp_controller.h"
#include "log.h"

class SimRpmSource : public IRpmSource {
    const RampController& _ramp;
    bool _healthy = true;

public:
    explicit SimRpmSource(const RampController& ramp) : _ramp(ramp) {}

    void  begin()           override { LOG("[SIM] RpmSource ready"); }
    float getRpm()    const override { return _ramp.getCurrent(); }
    bool  isHealthy()  const override { return _healthy; }

    // F08 fault injection
    void injectSensorLoss(bool lost) { _healthy = !lost; }
};
