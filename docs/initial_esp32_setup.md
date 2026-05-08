# Initial ESP32 Setup (Blank Board)

This guide applies only when flashing a **brand-new or wiped ESP32** for the first time.  
If you received a board with firmware already installed → go back to the [README](../README.md).

---

## What You Need

| Item | Detail |
|---|---|
| Micro-USB cable | Data cable – not a charge-only cable |
| [CP2102 USB driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers) | Silicon Labs – required for Windows/macOS |
| [VS Code](https://code.visualstudio.com/) + [PlatformIO extension](https://platformio.org/install/ide?install=vscode) | Installs `pio` CLI automatically |
| Node.js | For `tests/selfcheck.js` |

---

## Step 1 – Configure Wi-Fi Credentials

Create `src/secrets.h` (this file is git-ignored, never committed):

```cpp
#define WIFI_SSID     "your-network-name"
#define WIFI_PASSWORD "your-password"
```

> Use a **2.4 GHz** network. The ESP32 does not support 5 GHz.

---

## Step 2 – Install Test Dependencies

```bash
cd tests && npm install
```

---

## Step 3 – First Flash via USB

> **This board has no auto-reset transistor.** Manual boot mode is required every time you flash via USB.

**Procedure:**
1. Hold the `BOOT` button on the board
2. Press and release the `EN` (Reset) button
3. Keep holding `BOOT`, then start the upload in VS Code (PlatformIO: Upload) or run:
   ```bash
   pio run --target upload
   ```
4. Release `BOOT` once you see `Writing at 0x00010000...` in the terminal

**Confirm success** – open the Serial Monitor at `115200 baud` and wait for:

```
[READY] ESP32 ist bereit.
[VERSION] Firmware v1.0.0
[INFO] IP-Adresse: 192.168.178.64
[HEARTBEAT] ESP32 läuft stabil - OTA & WebSerial aktiv.
```

Note down the IP address printed on the `[INFO]` line.

---

## Step 4 – Set the Board IP in platformio.ini

Edit `platformio.ini` and set `upload_port` to the IP from the serial output:

```ini
upload_protocol = espota
upload_port = 192.168.178.64   ; ← replace with your board's IP
```

> **Tip:** Configure a static DHCP lease in your router for the board's MAC address so the IP never changes. Board MAC: `24:6f:28:15:7a:54`

---

## Step 5 – Windows Firewall (OTA Port 3232)

OTA uploads use TCP + UDP port `3232`. If uploads time out, add a firewall rule:

```
Windows Defender Firewall → Inbound Rules → New Rule
  Type: Port | TCP+UDP | Port 3232 | Allow | All profiles
  Name: ESP32 OTA
```

---

## Step 6 – Verify

Once the board is running and the IP is set, run the self-check:

```bash
node tests/selfcheck.js <board-ip>
```

Expected:
```
[SELFCHECK PASSED] IP: 192.168.178.64
```

All future firmware updates go over Wi-Fi – no USB cable needed. See the [README](../README.md) for the normal development workflow.

---

## Board Reference

| Property | Value |
|---|---|
| Chip | ESP32-D0WDQ6 Rev 1.0 |
| Clock | 240 MHz |
| Flash | 4 MB |
| USB-Serial | Silicon Labs CP2102 |
| MAC Address | `24:6f:28:15:7a:54` |
| OTA Hostname | `esp32-motor-control` (`esp32-motor-control.local` via mDNS) |
