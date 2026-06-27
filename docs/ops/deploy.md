# Deploy Workflow

**Parent:** [Ops README](./README.md) | [ARCHITECTURE.md](../../ARCHITECTURE.md)

> ⚠️ **OTA is NOT available** on Arduino Uno R4 WiFi via PlatformIO renesas-ra. Flash exclusively via USB.

---

## Mandatory Workflow (every firmware change)

### Step 1 — Compile Check

```bash
npm run build
```

Compiles without flashing. Fix all compiler errors before proceeding. Never skip this step.

### Step 2 — Code Review Checklist

Before flashing, scan the changed files for:
- [ ] Magic numbers replaced with named constants
- [ ] Null-checks on pointers used in hot path
- [ ] No `String` objects in hot path (use `const char*`)
- [ ] No blocking calls > 1 ms inside `loop()`
- [ ] SRAM budget: new buffers should stay within 32 KB total

### Step 3 — Flash + Selfcheck

```bash
npm run deploy
```

`deploy.js` executes:
1. `pio run -e r4wifi` — compile
2. `pio run -e r4wifi --target upload --upload-port COM4` — USB flash
3. Wait 12 s (board reboot)
4. `node tests/selfcheck.js 192.168.178.70` — HTTP + WebSocket check

**Custom port/IP:**
```bash
node deploy.js COM5
node deploy.js COM5 192.168.1.99
```

### Step 4 — Interpret Result

| Selfcheck output | Meaning | Action |
|---|---|---|
| `[SELFCHECK PASSED]` | Everything OK | Done ✅ |
| HTTP FAIL + WS FAIL | Board not booted / no WiFi | Open Serial Monitor, wait for `[BOOT]` |
| HTTP OK + WS FAIL | HTTP up, WebSocket route missing | Check `web_api.cpp` WS handler |
| HTTP OK + WS TIMEOUT | WS connects, board sends nothing | Check `webApi.tick()` in `loop()` |
| Upload FAILED | COM port wrong / board not connected | Check `device manager`, try `COM5` |

### Step 5 — Summary Output

Always report:
```
[DEPLOY RESULT] Upload: OK | /status: OK | WebSocket: OK | IP: 192.168.178.70
```

---

## First Flash (new board or recovery)

1. Connect board via USB.
2. Press the white RESET button twice rapidly → board enters bootloader (orange LED breathes).
3. Run `npm run deploy`.
4. If upload fails: check Device Manager for the COM port number.
