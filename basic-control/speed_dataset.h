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

const BinarySpeedRelayProfile& relayProfileForDataset(BinarySpeedDataset dataset);
const __FlashStringHelper* datasetText(BinarySpeedDataset dataset);
BinarySpeedDataset datasetFromRelayBits(bool m1Enabled, bool m2Enabled);
