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

const BinarySpeedRelayProfile& relayProfileForDataset(BinarySpeedDataset dataset);
const BinarySpeedDynamicsProfile& dynamicsProfileForDataset(BinarySpeedDataset dataset);
const __FlashStringHelper* datasetText(BinarySpeedDataset dataset);
BinarySpeedDataset datasetFromRelayBits(bool m1Enabled, bool m2Enabled);

unsigned long computeAccelerationDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset);

unsigned long computeDecelerationDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset);

unsigned long computeSwitchDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset);
