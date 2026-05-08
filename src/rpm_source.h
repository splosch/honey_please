// src/rpm_source.h
// HAL boundary for RPM measurement.
//
// IRpmSource    – pure interface; every consumer uses only this.
// SimRpmSource  – Phase 1–4: reads RampController.getCurrent() (src/sim_rpm_source.h)
// RealRpmSource – Phase 5: GPIO interrupt ISR (src/real_rpm_source.h, deferred)
#pragma once

class IRpmSource {
public:
    virtual void  begin()           = 0;
    virtual float getRpm()    const = 0;  // Current basket RPM (gear-ratio corrected in Phase 5)
    virtual bool  isHealthy()  const = 0;  // false → triggers E03_RPM_SENSOR_LOST
    virtual ~IRpmSource() {}
};
