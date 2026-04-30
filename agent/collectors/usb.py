"""
USB device collector — enumerates connected USB devices and detects dropouts.
Uses WMI Win32_PnPEntity. Generic Windows placeholder names are replaced with
real device names via a VID/PID lookup table covering common sim racing hardware.
"""

import time
from typing import Optional

try:
    import wmi as wmi_module
    _wmi = wmi_module.WMI()
except Exception:
    _wmi = None

# ── VID/PID lookup table ──────────────────────────────────────────────────────
# Format: (VID_hex_upper, PID_hex_upper_or_None) -> "Manufacturer Product"
# If PID is None it matches any PID for that VID.
_USB_ID_MAP: dict[tuple[str, str | None], str] = {
    # Asetek SimSports / RaceHub
    ("0483", None):      "STMicroelectronics Device",   # generic STM — override below
    ("0483", "A355"):    "Asetek SimSports Wheelbase",
    ("0483", "A356"):    "Asetek SimSports Wheelbase",
    ("0483", "A35A"):    "Asetek SimSports Wheelbase",
    ("0483", "5750"):    "Asetek SimSports Pedals",
    # Simucube / Granite Devices
    ("16D0", None):      "Simucube Device",
    ("16D0", "0D5A"):    "Simucube 2 Pro Wheelbase",
    ("16D0", "0D60"):    "Simucube 2 Sport Wheelbase",
    ("16D0", "0D61"):    "Simucube 2 Ultimate Wheelbase",
    ("16D0", "0D3A"):    "Simucube 1 Wheelbase",
    # Heusinkveld
    ("16C0", None):      "Heusinkveld Device",
    ("16C0", "0486"):    "Heusinkveld Sprint Pedals",
    ("16C0", "0487"):    "Heusinkveld Ultimate Pedals",
    ("16C0", "05DC"):    "Heusinkveld Handbrake",
    # MOZA Racing
    ("346E", None):      "MOZA Racing Device",
    ("346E", "0005"):    "MOZA R9 Wheelbase",
    ("346E", "0006"):    "MOZA R16 Wheelbase",
    ("346E", "0007"):    "MOZA R21 Wheelbase",
    ("346E", "0011"):    "MOZA ES Steering Wheel",
    ("346E", "0013"):    "MOZA GS Steering Wheel",
    ("346E", "0020"):    "MOZA SR-P Pedals",
    ("346E", "0030"):    "MOZA HBP Handbrake",
    # Fanatec
    ("0EB7", None):      "Fanatec Device",
    ("0EB7", "0001"):    "Fanatec CSW Wheelbase",
    ("0EB7", "0005"):    "Fanatec DD Pro Wheelbase",
    ("0EB7", "0020"):    "Fanatec CSL Pedals",
    # Logitech
    ("046D", None):      "Logitech Device",
    ("046D", "C29B"):    "Logitech G29 Wheel",
    ("046D", "C260"):    "Logitech G920 Wheel",
    ("046D", "C262"):    "Logitech G923 Wheel",
    ("046D", "C24F"):    "Logitech G25 Wheel",
    ("046D", "C293"):    "Logitech Driving Force GT",
    ("046D", "C52B"):    "Logitech Unifying Receiver",
    ("046D", "C548"):    "Logitech Bolt Receiver",
    # Thrustmaster
    ("044F", None):      "Thrustmaster Device",
    ("044F", "B66E"):    "Thrustmaster T300RS Wheel",
    ("044F", "B696"):    "Thrustmaster T-GT II Wheel",
    ("044F", "B66D"):    "Thrustmaster T300RS GT Wheel",
    ("044F", "B65D"):    "Thrustmaster T500RS Wheel",
    # Corsair
    ("1B1C", None):      "Corsair Device",
    ("1B1C", "0A34"):    "Corsair HS80 RGB Wireless Receiver",
    ("1B1C", "0A14"):    "Corsair Void Pro Wireless Receiver",
    ("1B1C", "1B77"):    "Corsair K95 Keyboard",
    # Razer
    ("1532", None):      "Razer Device",
    ("1532", "0067"):    "Razer BlackWidow Chroma",
    ("1532", "005C"):    "Razer DeathAdder Elite",
    # Microsoft
    ("045E", None):      "Microsoft Device",
    ("045E", "028E"):    "Microsoft Xbox 360 Controller",
    ("045E", "02D1"):    "Microsoft Xbox One Controller",
    ("045E", "02EA"):    "Microsoft Xbox One S Controller",
    ("045E", "0B12"):    "Microsoft Xbox Series Controller",
    # USB Hubs (common chipsets — show chipmaker rather than "Generic USB Hub")
    ("05E3", None):      "Genesys Logic USB Hub",
    ("2109", None):      "VIA Labs USB Hub",
    ("0451", None):      "Texas Instruments USB Hub",
    ("0BDA", None):      "Realtek USB Device",
    ("0BDA", "8153"):    "Realtek USB Ethernet Adapter",
    ("0BDA", "5411"):    "Realtek USB Hub",
    # Arduino / Teensy (popular for DIY button boxes)
    ("2341", None):      "Arduino Device",
    ("16C0", "0478"):    "Teensy USB Controller",
    # Generic audio
    ("0D8C", None):      "USB Audio Device",
    ("0D8C", "0012"):    "USB Headset",
    ("0D8C", "000C"):    "USB Audio Adapter",
}

# Windows placeholder names we consider unreliable
_GENERIC_NAMES = {
    "generic usb hub",
    "usb composite device",
    "usb root hub",
    "usb root hub (usb 3.0)",
    "usb root hub (xhci)",
    "usb input device",
    "unknown device",
    "usb device",
    "usb2.0 hub",
    "usb3.0 hub",
    "usb2 hub",
    "usb3 hub",
}

# Snapshot of device IDs seen on the previous tick {device_id: device_dict}
_prev_devices: dict[str, dict] = {}
_pending_dropout: dict[str, dict] = {}   # devices that disappeared; key=device_id
DROPOUT_WINDOW_SECS = 30


def _lookup_name(vid: str, pid: str, windows_name: str) -> str:
    """
    Return the best available device name.
    Priority: exact VID+PID match > VID-only match > Windows name (if not generic)
    """
    vid_u = vid.upper()
    pid_u = pid.upper()

    # Exact VID+PID match
    exact = _USB_ID_MAP.get((vid_u, pid_u))
    if exact:
        return exact

    # VID-only match (PID=None wildcard), but only if windows name is generic
    if windows_name.lower().strip() in _GENERIC_NAMES:
        vid_only = _USB_ID_MAP.get((vid_u, None))
        if vid_only:
            return vid_only
        # Still generic and no lookup hit — show VID/PID so it's at least informative
        if vid_u:
            return f"USB Device (VID:{vid_u} PID:{pid_u})" if pid_u else f"USB Device (VID:{vid_u})"

    return windows_name


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
            raw_name = entity.Name or entity.Description or "USB Device"

            # Extract VID/PID from DeviceID e.g. USB\VID_046D&PID_C52B\...
            vid, pid = "", ""
            for part in dev_id.upper().split("\\"):
                for segment in part.split("&"):
                    if segment.startswith("VID_"):
                        vid = segment[4:]
                    elif segment.startswith("PID_"):
                        pid = segment[4:]

            friendly_name = _lookup_name(vid, pid, raw_name)

            devices.append({
                "device_id": dev_id,
                "name": friendly_name,
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
        if dev_id not in current_ids and dev_id not in _pending_dropout:
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
                "duration_ms": duration_ms,
                "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(info["time_lost"])),
            })
            resolved_ids.append(dev_id)
        elif now - info["time_lost"] > DROPOUT_WINDOW_SECS:
            # Device truly gone (not a dropout), stop tracking
            resolved_ids.append(dev_id)

    for dev_id in resolved_ids:
        _pending_dropout.pop(dev_id, None)

    _prev_devices = current_ids

    # Return clean device list (strip internal device_id from payload)
    clean_devices = [
        {"name": d["name"], "vid": d["vid"], "pid": d["pid"], "status": d["status"]}
        for d in raw
    ]
    return clean_devices, usb_events
