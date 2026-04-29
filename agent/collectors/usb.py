"""
USB device collector — enumerates connected USB devices and detects dropouts.
Uses WMI Win32_PnPEntity. All imports wrapped for graceful fallback.
"""

import time
from typing import Optional

try:
    import wmi as wmi_module
    _wmi = wmi_module.WMI()
except Exception:
    _wmi = None

# Snapshot of device IDs seen on the previous tick {device_id: timestamp_seen}
_prev_devices: dict[str, dict] = {}
_pending_dropout: dict[str, dict] = {}   # devices that disappeared; key=device_id, value={device, time_lost}
DROPOUT_WINDOW_SECS = 30


def _get_usb_devices_raw() -> list[dict]:
    """Return all USB-connected PnP entities as raw dicts."""
    if not _wmi:
        return []
    try:
        devices = []
        for entity in _wmi.Win32_PnPEntity():
            dev_id = entity.DeviceID or ""
            if "USB" not in dev_id.upper():
                continue
            name = entity.Name or entity.Description or "Unknown USB Device"
            # Extract VID/PID from DeviceID string e.g. USB\VID_046D&PID_C52B\...
            vid, pid = "", ""
            parts = dev_id.upper().split("\\")
            for part in parts:
                if "VID_" in part:
                    for segment in part.split("&"):
                        if segment.startswith("VID_"):
                            vid = segment[4:]
                        elif segment.startswith("PID_"):
                            pid = segment[4:]
            devices.append({
                "device_id": dev_id,
                "name": name,
                "vid": vid,
                "pid": pid,
                "status": entity.Status or "OK",
            })
        return devices
    except Exception:
        return []


def get_usb_devices() -> tuple[list[dict], list[dict]]:
    """
    Returns (devices, usb_events).
    - devices: list of currently connected USB devices (name, vid, pid, status)
    - usb_events: list of dropout events detected this tick
    """
    global _prev_devices, _pending_dropout

    raw = _get_usb_devices_raw()
    now = time.time()

    current_ids = {d["device_id"]: d for d in raw}
    usb_events = []

    # Detect devices that just disappeared → potential dropout
    for dev_id, dev in _prev_devices.items():
        if dev_id not in current_ids:
            _pending_dropout[dev_id] = {"device": dev, "time_lost": now}

    # Detect devices that reappeared within DROPOUT_WINDOW_SECS → confirmed dropout
    resolved_ids = []
    for dev_id, info in _pending_dropout.items():
        if dev_id in current_ids:
            duration_ms = int((now - info["time_lost"]) * 1000)
            usb_events.append({
                "event_type": "dropout",
                "device_name": info["device"]["name"],
                "device_id": dev_id,
                "vid": info["device"].get("vid", ""),
                "pid": info["device"].get("pid", ""),
                "duration_ms": duration_ms,
                "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(info["time_lost"])),
            })
            resolved_ids.append(dev_id)
        elif now - info["time_lost"] > DROPOUT_WINDOW_SECS:
            # Device is truly gone (not a dropout), stop tracking
            resolved_ids.append(dev_id)

    for dev_id in resolved_ids:
        _pending_dropout.pop(dev_id, None)

    _prev_devices = current_ids

    # Return clean device list (drop device_id from public payload)
    clean_devices = [
        {"name": d["name"], "vid": d["vid"], "pid": d["pid"], "status": d["status"]}
        for d in raw
    ]
    return clean_devices, usb_events
