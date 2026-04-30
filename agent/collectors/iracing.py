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

    telemetry_data keys:
      game_active, fps, track, car, session_type
      game_telemetry: {
        last_lap_ms, last_lap_formatted,
        best_lap_ms, best_lap_formatted,
        delta_ms, delta_formatted,
        fuel_level, tire_wear_fl, tire_wear_fr, tire_wear_rl, tire_wear_rr,
        track, car, session_type
      }

    completed_laps: list of lap dicts ready to POST to /api/agent
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

        # ── FPS ───────────────────────────────────────────────────────────────
        fps = None
        try:
            fps = int(_ir["FrameRate"] or 0) or None
        except Exception:
            pass

        # ── Track & car ───────────────────────────────────────────────────────
        track, car = None, None
        try:
            wi = _ir["WeekendInfo"]
            if wi:
                track = wi.get("TrackDisplayName") or wi.get("TrackName")
        except Exception:
            pass
        try:
            di = _ir["DriverInfo"]
            if di and di.get("Drivers"):
                my_idx = di.get("DriverCarIdx", 0)
                for d in di["Drivers"]:
                    if d.get("CarIdx") == my_idx:
                        car = d.get("CarScreenNameShort") or d.get("CarPath")
                        break
        except Exception:
            pass

        # ── Session type ──────────────────────────────────────────────────────
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

        # ── Lap times ─────────────────────────────────────────────────────────
        last_lap_secs, best_lap_secs = None, None
        try:
            last_lap_secs = _ir["LapLastLapTime"]
            if last_lap_secs and last_lap_secs <= 0:
                last_lap_secs = None
        except Exception:
            pass
        try:
            best_lap_secs = _ir["LapBestLapTime"]
            if best_lap_secs and best_lap_secs <= 0:
                best_lap_secs = None
        except Exception:
            pass

        last_lap_ms  = int(last_lap_secs * 1000)  if last_lap_secs  else None
        best_lap_ms  = int(best_lap_secs * 1000)  if best_lap_secs  else None
        delta_ms     = (last_lap_ms - best_lap_ms) if (last_lap_ms and best_lap_ms) else None
        delta_fmt    = None
        if delta_ms is not None:
            sign = "+" if delta_ms >= 0 else "-"
            delta_fmt = f"{sign}{_fmt_ms(abs(delta_ms) / 1000)}"

        # ── Fuel ──────────────────────────────────────────────────────────────
        fuel = None
        try:
            raw = _ir["FuelLevel"]
            if raw is not None and raw >= 0:
                # Convert to percentage of fuel tank capacity
                capacity = _ir["FuelLevelPct"]
                if capacity is not None and capacity > 0:
                    fuel = round(capacity * 100, 1)
                else:
                    fuel = round(float(raw), 1)
        except Exception:
            pass

        # ── Tire wear (each corner, 0–100%) ───────────────────────────────────
        tw = {"fl": None, "fr": None, "rl": None, "rr": None}
        try:
            tw_map = {
                "fl": ["LFwearL", "LFwearM", "LFwearR"],
                "fr": ["RFwearL", "RFwearM", "RFwearR"],
                "rl": ["LRwearL", "LRwearM", "LRwearR"],
                "rr": ["RRwearL", "RRwearM", "RRwearR"],
            }
            for corner, keys in tw_map.items():
                vals = [_ir[k] for k in keys if _ir[k] is not None]
                if vals:
                    # iRacing wear values are 0–1 (1 = new), convert to worn %
                    avg_remaining = sum(vals) / len(vals)
                    tw[corner] = round((1 - avg_remaining) * 100, 1)
        except Exception:
            pass

        game_telemetry = {
            "last_lap_ms":       last_lap_ms,
            "last_lap_formatted": _fmt_ms(last_lap_secs) if last_lap_secs else None,
            "best_lap_ms":       best_lap_ms,
            "best_lap_formatted": _fmt_ms(best_lap_secs) if best_lap_secs else None,
            "delta_ms":          delta_ms,
            "delta_formatted":   delta_fmt,
            "fuel_level":        fuel,
            "tire_wear_fl":      tw["fl"],
            "tire_wear_fr":      tw["fr"],
            "tire_wear_rl":      tw["rl"],
            "tire_wear_rr":      tw["rr"],
            "track":             track,
            "car":               car,
            "session_type":      session_type,
        }

        telemetry = {
            "game_active": "iRacing",
            "fps": fps,
            "track": track,
            "car": car,
            "session_type": session_type,
            "game_telemetry": game_telemetry,
        }

        # ── Lap completion detection ───────────────────────────────────────────
        completed_laps = []
        try:
            current_lap = _ir["Lap"]
            if current_lap is not None and _last_lap_num >= 0 and current_lap > _last_lap_num:
                if last_lap_secs:
                    lap_ms = int(last_lap_secs * 1000)
                    completed_laps.append({
                        "game":            "iRacing",
                        "track":           track,
                        "car":             car,
                        "lap_time_ms":     lap_ms,
                        "lap_time_formatted": _fmt_ms(last_lap_secs),
                        "session_type":    session_type,
                        "fuel_level":      fuel,
                        "tire_wear":       round(sum(v for v in tw.values() if v is not None) / max(1, sum(1 for v in tw.values() if v is not None)), 1),
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
