#pragma once

#include <Arduino.h>

enum class BinarySpeedDataset {
    DATASET_0,
    DATASET_2,
    DATASET_4,
    DATASET_6
};

struct BinarySpeedRelayProfile {
    BinarySpeedDataset dataset;
    bool m1Enabled;
    bool m2Enabled;
};

struct BinarySpeedDynamicsProfile {
    BinarySpeedDataset dataset;
    unsigned long targetRpm;
    unsigned long accelerationMs;
    unsigned long decelerationMs;
};

// Ramp times in Ac/dc are configured against this maximum VFD speed.
static constexpr unsigned long kRampReferenceMaxRpm = 3000UL;

const BinarySpeedRelayProfile& relayProfileForDataset(BinarySpeedDataset dataset);
const BinarySpeedDynamicsProfile& dynamicsProfileForDataset(BinarySpeedDataset dataset);
const __FlashStringHelper* datasetText(BinarySpeedDataset dataset);
BinarySpeedDataset datasetFromRelayBits(bool m1Enabled, bool m2Enabled);

unsigned long computeAccelerationDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset);

unsigned long computeAccelerationDurationFromStopMs(BinarySpeedDataset toDataset);

unsigned long computeDecelerationDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset);

unsigned long computeDecelerationDurationToStopMs(BinarySpeedDataset fromDataset);

unsigned long computeSwitchDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset);
