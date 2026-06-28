#pragma once

#include <Arduino.h>
#include "config.h"
#include "controller_state.h"
#include "hardware_io.h"

void tickController(
    ControllerState& controller,
    const InputSnapshot& inputs,
    unsigned long nowMs,
    const BasicControlConfig& cfg);
