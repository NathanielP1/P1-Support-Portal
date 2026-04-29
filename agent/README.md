# Podium 1 Racing — Rig Agent

A lightweight background agent that runs on the customer's Windows PC and sends live telemetry (CPU/GPU temps, RAM, FPS, USB devices) and lap times to the Podium 1 staff portal.

---

## Requirements

- Windows 10 or Windows 11
- Python 3.10 or newer — [python.org/downloads](https://www.python.org/downloads/)
- Internet connection (HTTPS to `p1-support-portal.vercel.app`)

---

## Installation

1. **Copy the `agent/` folder** to a permanent location on the customer PC (e.g. `C:\P1Racing\agent`).

2. **Run the installer** (opens a console wizard):
   ```
   python installer\setup.py
   ```
   The installer will:
   - Install all Python dependencies automatically
   - Ask for the customer's email address, name, and simulator model
   - Register the agent to start automatically at Windows login
   - Create a desktop shortcut

3. **First launch** — either use the desktop shortcut or run:
   ```
   python main.py
   ```
   The agent starts silently in the background. A log file `p1_agent.log` is created in the agent folder.

---

## What the agent collects

| Data | Source |
|------|--------|
| CPU temperature | WMI `MSAcpi_ThermalZoneTemperature` |
| GPU temperature | `nvidia-smi` / OpenHardwareMonitor WMI |
| RAM usage | psutil |
| Active game | Process list scan |
| FPS | iRacing shared memory / SimHub REST API |
| USB devices | WMI `Win32_PnPEntity` |
| USB dropout events | Snapshot diff between ticks |
| Lap times | iRacing shared memory (irsdk) |
| Lap times (other sims) | SimHub REST API on `localhost:8888` |
| Software update checks | Windows registry vs. remote config |

All collection flags can be toggled remotely from the staff portal — no reinstall required.

---

## Configuration

The agent reads its settings from two places:

### Local config (`agent_local.json`)
Created by the installer. Contains:
```json
{
  "customer_email": "customer@example.com",
  "customer_name": "Jane Smith",
  "rig": "P1-X Ultimate",
  "seen_announcement_ids": []
}
```
To update your details, edit this file or run the installer again.

### Remote config (Supabase → staff portal)
Collection interval, which sensors to enable, software version targets, and customer announcements are all set from the staff portal Rig Dashboard. The agent re-fetches these every 60 seconds, so changes take effect without restarting.

---

## Supported simulators

| Simulator | Source |
|-----------|--------|
| iRacing | irsdk shared memory |
| Assetto Corsa | SimHub |
| Assetto Corsa Competizione | SimHub |
| AMS2 | SimHub |
| rFactor 2 | SimHub |
| Le Mans Ultimate | SimHub |
| RaceRoom | SimHub |
| F1 (2023/2024) | Process detection |

SimHub must be running for non-iRacing titles. iRacing works independently.

---

## Log file

The agent writes to `p1_agent.log` in the agent folder. Errors are logged but never crash the agent — if a collector fails, the rest continue normally.

---

## Uninstalling

1. **Remove the startup entry** (run in PowerShell):
   ```powershell
   Remove-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -Name "P1RacingAgent"
   ```

2. **Delete the agent folder** and the desktop shortcut.

3. **Uninstall Python dependencies** (optional):
   ```
   pip uninstall psutil pywin32 wmi requests irsdk websocket-client win10toast
   ```
