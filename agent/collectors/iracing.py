"""
iRacing collector — reads live telemetry from iRacing shared memory via irsdk.
Detects lap completions and returns completed lap data for uploading.
"""

import time

try:
    import irsdk
    _ir = irsdk.IRSDK()
    _IRSDK_AVAILABLE = True
except ImportError:
    _ir = None
    _IRSDK_AVAILABLE = False

_last_lap_num: int = -1
_connected: bool = False


def _fmt_ms(seconds: float) -> str:
    """Convert seconds (float) to M:SS.mmm string."""
    if seconds <= 0:
        return "0:00.000"
    total_ms = int(seconds * 1000)
    mins = total_ms // 60000
    secs = (total_ms % 60000) // 1000
    ms = total_ms % 1000
    return f"{mins}:{secs:02d}.{ms:03d}"


def get_iracing_data() -> tuple[dict, list[dict]]:
    """
    Returns (telemetry_data, completed_laps).
    - telemetry_data: dict with fps, game_active, track, car, session_type or empty dict
    - completed_laps: list of completed lap dicts ready to POST to /api/agent
    """
    global _last_lap_num, _connected

    if not _IRSDK_AVAILABLE:
        return {}, []

    try:
        if not _ir.is_initialized or not _ir.is_connected:
            ok = _ir.startup()
            if not ok:
                _last_lap_num = -1
                _connected = False
                return {}, []
        _connected = True
    except Exception:
        _connected = False
        return {}, []

    try:
        _ir.freeze_var_buffer_latest()

        fps = None
        try:
            fps = int(_ir["FrameRate"] or 0) or None
        except Exception:
            pass

        track = None
        try:
            wi = _ir["WeekendInfo"]
            if wi:
                track = wi.get("TrackDisplayName") or wi.get("TrackName")
        except Exception:
            pass

        car = None
        try:
            di = _ir["DriverInfo"]
            if di and di.get("Drivers"):
                my_idx = di.get("DriverCarIdx", 0)
                drivers = di["Drivers"]
                for d in drivers:
                    if d.get("CarIdx") == my_idx:
                        car = d.get("CarScreenNameShort") or d.get("CarPath")
                        break
        except Exception:
            pass

        session_type = None
        try:
            si = _ir["SessionInfo"]
            if si and si.get("Sessions"):
                sess_num = _ir["SessionNum"] or 0
                sessions = si["Sessions"]
                if sess_num < len(sessions):
                    session_type = sessions[sess_num].get("SessionType")
        except Exception:
            pass

        fuel = None
        try:
            fuel = round(float(_ir["FuelLevel"] or 0), 2)
        except Exception:
            pass

        tire_wear = None
        try:
            corners = [
                _ir["LFwearL"], _ir["LFwearM"], _ir["LFwearR"],
                _ir["RFwearL"], _ir["RFwearM"], _ir["RFwearR"],
                _ir["LRwearL"], _ir["LRwearM"], _ir["LRwearR"],
                _ir["RRwearL"], _ir["RRwearM"], _ir["RRwearR"],
            ]
            valid = [c for c in corners if c is not None]
            if valid:
                tire_wear = round(sum(valid) / len(valid) * 100, 1)
        except Exception:
            pass

        telemetry = {
            "game_active": "iRacing",
            "fps": fps,
            "track": track,
            "car": car,
            "session_type": session_type,
        }

        # Lap completion detection
        completed_laps = []
        try:
            current_lap = _ir["Lap"]
            if current_lap is not None and _last_lap_num >= 0 and current_lap > _last_lap_num:
                lap_time_secs = _ir["LapLastLapTime"]
                if lap_time_secs and lap_time_secs > 0:
                    lap_ms = int(lap_time_secs * 1000)
                    completed_laps.append({
                        "game": "iRacing",
                        "track": track,
                        "car": car,
                        "lap_time_ms": lap_ms,
                        "lap_time_formatted": _fmt_ms(lap_time_secs),
                        "session_type": session_type,
                        "fuel_level": fuel,
                        "tire_wear": tire_wear,
                    })
            _last_lap_num = current_lap if current_lap is not None else _last_lap_num
        except Exception:
            pass

        return telemetry, completed_laps

    except Exception:
        return {}, []


def shutdown():
    """Clean up irsdk connection on agent exit."""
    global _connected
    if _IRSDK_AVAILABLE and _ir and _connected:
        try:
            _ir.shutdown()
        except Exception:
            pass
    _connected = False
