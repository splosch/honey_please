#include "program_config.h"

const SchleuderProgram* programById(SchleuderProgramId id) {
    for (size_t i = 0; i < SCHLEUDER_PROGRAM_COUNT; ++i) {
        if (SCHLEUDER_PROGRAMS[i].id == id) {
            return &SCHLEUDER_PROGRAMS[i];
        }
    }
    return nullptr;
}
