#include "speed_dataset.h"

static constexpr BinarySpeedRelayProfile kDatasetProfiles[] = {
    {BinarySpeedDataset::DATASET_0, false, false},
    {BinarySpeedDataset::DATASET_2, true,  false},
    {BinarySpeedDataset::DATASET_4, false, true },
    {BinarySpeedDataset::DATASET_6, true,  true }
};

static constexpr BinarySpeedDynamicsProfile kDynamicsProfiles[] = {
    // BLFD120 3-wire profiles from MultiSpeedSaftyBreak.md.
    // Ac/dc values are configured relative to 3000 rpm max speed.
    // Safety brake is intentionally two-stage:
    // 1) DATASET_0 (dc=2500 ms) for a gentle 2250->750 rpm decel (~1250 ms).
    // 2) DATASET_6 (dc=200 ms) for final lock to 0 rpm (code uses +margin, e.g. 150 ms).
    // Row format: {     dataset,   targetRpm,  accelerationMs, decelerationMs}
    {BinarySpeedDataset::DATASET_0, 750UL,      15000UL,        2500UL},
    {BinarySpeedDataset::DATASET_2, 1250UL,     15000UL,        15000UL},
    {BinarySpeedDataset::DATASET_4, 2500UL,     15000UL,        15000UL},
    {BinarySpeedDataset::DATASET_6, 0UL,        2000UL,         2000UL}
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

const BinarySpeedDynamicsProfile& dynamicsProfileForDataset(BinarySpeedDataset dataset) {
    switch (dataset) {
        case BinarySpeedDataset::DATASET_0: return kDynamicsProfiles[0];
        case BinarySpeedDataset::DATASET_2: return kDynamicsProfiles[1];
        case BinarySpeedDataset::DATASET_4: return kDynamicsProfiles[2];
        case BinarySpeedDataset::DATASET_6: return kDynamicsProfiles[3];
        default:                            return kDynamicsProfiles[0];
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

static unsigned long scaleTimeByDelta(
    unsigned long fullTimeMs,
    unsigned long fullRangeRpm,
    unsigned long deltaRpm) {
    if (deltaRpm == 0UL) {
        return 0UL;
    }

    if (fullRangeRpm == 0UL) {
        return fullTimeMs;
    }

    unsigned long long scaled =
        ((unsigned long long)fullTimeMs * (unsigned long long)deltaRpm)
        / (unsigned long long)fullRangeRpm;

    if (scaled == 0ULL) {
        return 1UL;
    }

    if (scaled > 0xFFFFFFFFULL) {
        return 0xFFFFFFFFUL;
    }

    return (unsigned long)scaled;
}

unsigned long computeAccelerationDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset) {
    const BinarySpeedDynamicsProfile& from = dynamicsProfileForDataset(fromDataset);
    const BinarySpeedDynamicsProfile& to = dynamicsProfileForDataset(toDataset);

    if (to.targetRpm <= from.targetRpm) {
        return 0UL;
    }

    unsigned long deltaRpm = to.targetRpm - from.targetRpm;
    return scaleTimeByDelta(to.accelerationMs, kRampReferenceMaxRpm, deltaRpm);
}

unsigned long computeAccelerationDurationFromStopMs(BinarySpeedDataset toDataset) {
    const BinarySpeedDynamicsProfile& to = dynamicsProfileForDataset(toDataset);
    return scaleTimeByDelta(to.accelerationMs, kRampReferenceMaxRpm, to.targetRpm);
}

unsigned long computeDecelerationDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset) {
    const BinarySpeedDynamicsProfile& from = dynamicsProfileForDataset(fromDataset);
    const BinarySpeedDynamicsProfile& to = dynamicsProfileForDataset(toDataset);

    if (from.targetRpm <= to.targetRpm) {
        return 0UL;
    }

    unsigned long deltaRpm = from.targetRpm - to.targetRpm;
    return scaleTimeByDelta(from.decelerationMs, kRampReferenceMaxRpm, deltaRpm);
}

unsigned long computeDecelerationDurationToStopMs(BinarySpeedDataset fromDataset) {
    const BinarySpeedDynamicsProfile& from = dynamicsProfileForDataset(fromDataset);
    return scaleTimeByDelta(from.decelerationMs, kRampReferenceMaxRpm, from.targetRpm);
}

unsigned long computeSwitchDurationMs(
    BinarySpeedDataset fromDataset,
    BinarySpeedDataset toDataset) {
    if (fromDataset == toDataset) {
        return 0UL;
    }

    const BinarySpeedDynamicsProfile& from = dynamicsProfileForDataset(fromDataset);
    const BinarySpeedDynamicsProfile& to = dynamicsProfileForDataset(toDataset);
    if (to.targetRpm > from.targetRpm) {
        return computeAccelerationDurationMs(fromDataset, toDataset);
    }

    return computeDecelerationDurationMs(fromDataset, toDataset);
}
