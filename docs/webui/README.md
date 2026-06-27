# Web UI – Domain Overview

**Parent:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

The Web UI is a single-page application that runs entirely on the **developer's machine** (served by a local static file server). It communicates with the Arduino board via WebSocket and HTTP — cross-origin requests are allowed by CORS headers on the board.

---

## Contents

| Document | Description |
|---|---|
| [websocket-protocol.md](./websocket-protocol.md) | WebSocket message schema, all JSON fields, command reference |

---

## Architecture

```
Browser (localhost:5500 or similar)
  │
  ├─ GET http://<board-ip>/status          ← snapshot on load
  │   Response: JSON, 200 OK + CORS headers
  │
  └─ WS  ws://<board-ip>/ws               ← 10 Hz state stream
      ↕  JSON frames (board → browser)
      ↕  JSON commands (browser → board)
```

**Key points:**
- The board does **not** serve any HTML/CSS/JS files.
- CORS header `Access-Control-Allow-Origin: *` is set on every HTTP response.
- WebSocket upgrade does not trigger a CORS preflight — the handshake is sufficient.
- For any POST endpoint or `OPTIONS` preflight: board replies `200 OK` + CORS headers.

---

## Feature References

| Feature | Doc |
|---|---|
| Schematic view layout, component boxes, sparkline | [F07 – Web UI Schematic View](../features/F07-webui-schematic-view.md) |
| Ramp progress bar, ETA | [F03 – Ramps](../features/F03-acceleration-deceleration-ramps.md) |
| Program step bubbles | [F09 – Multi-Step Program](../features/F09-multistep-program.md) |
| Session record/export UI | [F10 – Extraction Session](../features/F10-extraction-session.md) |
| SIM mode banner | [F08 – Simulation Mode](../features/F08-simulation-mode.md) |
