# Current Task – Architecture Documentation & Structural Wiring

**Status:** ✅ COMPLETE  
**Started:** 2026-05-26  
**Finished:** 2026-05-26  
**Requested by:** User prompt  

---

## Goal

Create a high-level `ARCHITECTURE.md` that acts as the navigation map for the entire project.
Wire it into `AGENTS.md` so every AI agent prompt can consult the architecture map and pick only the relevant sub-documents — keeping context load bounded.

---

## Subgoals

| # | Subgoal | Status |
|---|---|---|
| 1 | Explore existing project structure and docs | ✅ Done |
| 2 | Create this planning document (`docs/current_task.md`) | ✅ Done |
| 3 | Create `docs/hardware/` subdirectory with index + subdocs | ✅ Done |
| 4 | Create `docs/webui/` subdirectory with index + subdocs | ✅ Done |
| 5 | Create `docs/simulation/` subdirectory with index | ✅ Done |
| 6 | Create `docs/ops/` subdirectory with index + deploy/selfcheck | ✅ Done |
| 7 | Create root `ARCHITECTURE.md` with full project map | ✅ Done |
| 8 | Update `AGENTS.md` — add architecture wiring rules | ✅ Done |
| 9 | Verify all links and cross-references | ✅ Done (30/30 links OK) |

---

## Design Decisions

### Why sub-document domains?

GitHub Copilot and other AI agents have bounded context windows. When a user asks about "the WebSocket protocol", the agent should load only `docs/webui/websocket-protocol.md` — not all 11 feature docs. `ARCHITECTURE.md` is the dispatch map that lets the agent pick the right slice.

### Proposed docs/ structure

```
docs/
  ARCHITECTURE.md               ← ROOT MAP (in project root, not docs/)
  FEATURE-OVERVIEW.md           ← milestone tracker (existing)
  r4wifi_onboarding.md          ← board setup (existing)
  ErsteInbetriebnahmeMotorundSteuerung.html  ← interactive wiring (existing)
  base_honey_extractor_controller.ino        ← legacy reference (existing)
  current_task.md               ← this file
  features/                     ← feature specs F01–F11 (existing)
  hardware/                     ← NEW
    README.md                   ← hardware overview index
    pin-assignments.md          ← all PIN_* defines and rationale
    motor-driver.md             ← motor driver, wiring, BLF spec
  webui/                        ← NEW
    README.md                   ← web UI architecture
    websocket-protocol.md       ← WS message schema and fields
  simulation/                   ← NEW
    README.md                   ← simulation mode guide
  ops/                          ← NEW
    README.md                   ← operations overview
    deploy.md                   ← full deploy workflow
    selfcheck.md                ← selfcheck interpretation guide
```

### AGENTS.md wiring rules (to be added)

1. **Before planning any implementation task:** Read `ARCHITECTURE.md` first. It lists which sub-documents are relevant for each domain.
2. **Scope control:** Load only the sub-documents listed under the relevant domain section in `ARCHITECTURE.md`. Do NOT pre-load all feature docs.
3. **After any milestone:** Update both `ARCHITECTURE.md` (structure/links) and `docs/FEATURE-OVERVIEW.md` (milestone status).

---

## Progress Log

| Date | Step | Notes |
|---|---|---|
| 2026-05-26 | Steps 1–2 | Project explored, plan created |
| 2026-05-26 | Steps 3–6 | docs/ substructure created |
| 2026-05-26 | Step 7 | ARCHITECTURE.md created |
| 2026-05-26 | Step 8 | AGENTS.md updated |
| 2026-05-26 | Step 9 | Links verified |
| 2026-06-27 | Structural cleanup | Renamed `demo/` → `basic-control/`, `src/` → `advanced-control/`; updated build scripts and architecture docs |
