#include "speed_dataset.h"

static constexpr BinarySpeedRelayProfile kDatasetProfiles[] = {
    {BinarySpeedDataset::DATASET_0, false, false},
    {BinarySpeedDataset::DATASET_2, true,  false},
    {BinarySpeedDataset::DATASET_4, false, true },
    {BinarySpeedDataset::DATASET_6, true,  true }
};

const BinarySpeedRelayProfile& relayProfileForDataset(BinarySpeedDataset dataset) {
    switch (dataset) {
        case BinarySpeedDataset::DATASET_0: return kDatasetProfiles[0];
        case BinarySpeedDataset::DATASET_2: return kDatasetProfiles[1];
        case BinarySpeedDataset::DATASET_4: return kDatasetProfiles[2];
        case BinarySpeedDataset::DATASET_6: return kDatasetProfiles[3];
        default:                            return kDatasetProfiles[0];
    }
}

const __FlashStringHelper* datasetText(BinarySpeedDataset dataset) {
    switch (dataset) {
        case BinarySpeedDataset::DATASET_0: return F("dAtA 0");
        case BinarySpeedDataset::DATASET_2: return F("dAtA 2");
        case BinarySpeedDataset::DATASET_4: return F("dAtA 4");
        case BinarySpeedDataset::DATASET_6: return F("dAtA 6");
        default:                            return F("dAtA ?");
    }
}

BinarySpeedDataset datasetFromRelayBits(bool m1Enabled, bool m2Enabled) {
    if (!m1Enabled && !m2Enabled) return BinarySpeedDataset::DATASET_0;
    if ( m1Enabled && !m2Enabled) return BinarySpeedDataset::DATASET_2;
    if (!m1Enabled &&  m2Enabled) return BinarySpeedDataset::DATASET_4;
    return BinarySpeedDataset::DATASET_6;
}
