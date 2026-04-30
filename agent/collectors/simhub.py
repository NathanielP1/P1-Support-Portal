"""
SimHub collector — reads live game data from SimHub's local REST API (port 8888).
Handles ACC, AMS2, Assetto Corsa, LMU, rFactor 2, and any other SimHub title.
"""

import time

try:
    import requests as _requests
    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False

SIMHUB_BASE = "http://localhost:8888"
SIMHUB_TIMEOUT = 1.0   # keep short so we don't stall the 1-second main loop

_last_lap_num: int = -1
_last_lap_time: float = -1.0


def _fmt_ms(ms: int) -> str:
    """Convert milliseconds to M:SS.mmm string."""
    if ms <= 0:
        return "0:00.000"
    mins = ms // 60000
    secs = (ms % 60000) // 1000
    millis = ms % 1000
    return f"{mins}:{secs:02d}.{millis:03d}"


def _get(path: str) -> dict | None:
    """GET a SimHub API endpoint. Returns parsed JSON or None on any error."""
    if not _REQUESTS_AVAILABLE:
        return None
    try:
        r = _requests.get(f"{SIMHUB_BASE}{path}", timeout=SIMHUB_TIMEOUT)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


def get_simhub_data() -> tuple[dict, list[dict]]:
    """
    Returns (telemetry_data, completed_laps).

    telemetry_data keys:
      game_active, fps, track, car, session_type
      game_telemetry: {
        last_lap_ms, last_lap_formatted,
        best_lap_ms, best_lap_formatted,
        delta_ms, delta_formatted,
        fuel_level,
        tire_wear_fl, tire_wear_fr, tire_wear_rl, tire_wear_rr,
        track, car, session_type
      }

    completed_laps: list of lap dicts ready to POST to /api/agent
    """
    global _last_lap_num, _last_lap_time

    game_info = _get("/api/game")
    if not game_info or not game_info.get("IsRunning"):
        _last_lap_num = -1
        return {}, []

    game_name = game_info.get("Name") or game_info.get("GameName") or "Unknown"

    data = _get("/api/datasources/jokerdata") or {}
    props = data.get("Properties") or data

    def prop(key: str, default=None):
        if isinstance(props, dict):
            return props.get(key, default)
        return default

    track = prop("DataCorePlugin.GameRawData.TrackName") or prop("TrackName") or prop("track")
    car   = prop("DataCorePlugin.GameRawData.CarModel")  or prop("CarModel")  or prop("car")
    session_type = prop("DataCorePlugin.GameRawData.SessionType") or prop("SessionType")

    fps = None
    try:
        fps_raw = prop("DataCorePlugin.GameData.FramesPerSecond") or prop("FramesPerSecond")
        if fps_raw is not None:
            fps = int(float(fps_raw))
    except Exception:
        pass

    # ── Lap times ─────────────────────────────────────────────────────────────
    def _to_ms(raw) -> int | None:
        if raw is None:
            return None
        val = float(raw)
        if val <= 0:
            return None
        return int(val * 1000) if val < 3600 else int(val)   # <3600 → seconds, else ms

    last_lap_ms = _to_ms(
        prop("DataCorePlugin.GameData.LastLapTime") or prop("LastLapTime")
    )
    best_lap_ms = _to_ms(
        prop("DataCorePlugin.GameData.BestLapTime") or prop("BestLapTime")
    )
    delta_ms = (last_lap_ms - best_lap_ms) if (last_lap_ms and best_lap_ms) else None
    delta_fmt = None
    if delta_ms is not None:
        sign = "+" if delta_ms >= 0 else "-"
        delta_fmt = f"{sign}{_fmt_ms(abs(delta_ms))}"

    # ── Fuel ──────────────────────────────────────────────────────────────────
    fuel = None
    try:
        fuel_raw = prop("DataCorePlugin.GameData.Fuel") or prop("Fuel")
        if fuel_raw is not None:
            fuel = round(float(fuel_raw), 1)
            # If SimHub gives 0-1 range, convert to percentage
            if 0 < fuel <= 1:
                fuel = round(fuel * 100, 1)
    except Exception:
        pass

    # ── Tire wear (per corner, 0–100%) ────────────────────────────────────────
    def _tyre(key_suffix: str) -> float | None:
        val = prop(f"DataCorePlugin.GameData.Tyrewear{key_suffix}") or prop(f"Tyrewear{key_suffix}")
        if val is None:
            return None
        try:
            v = float(val)
            return round(v * 100 if v <= 1 else v, 1)
        except Exception:
            return None

    tw_fl = _tyre("FrontLeft")
    tw_fr = _tyre("FrontRight")
    tw_rl = _tyre("RearLeft")
    tw_rr = _tyre("RearRight")

    game_telemetry = {
        "last_lap_ms":        last_lap_ms,
        "last_lap_formatted": _fmt_ms(last_lap_ms) if last_lap_ms else None,
        "best_lap_ms":        best_lap_ms,
        "best_lap_formatted": _fmt_ms(best_lap_ms) if best_lap_ms else None,
        "delta_ms":           delta_ms,
        "delta_formatted":    delta_fmt,
        "fuel_level":         fuel,
        "tire_wear_fl":       tw_fl,
        "tire_wear_fr":       tw_fr,
        "tire_wear_rl":       tw_rl,
        "tire_wear_rr":       tw_rr,
        "track":              track,
        "car":                car,
        "session_type":       session_type,
    }

    telemetry = {
        "game_active": game_name,
        "fps":         fps,
        "track":       track,
        "car":         car,
        "session_type": session_type,
        "game_telemetry": game_telemetry,
    }

    # ── Lap completion detection ───────────────────────────────────────────────
    completed_laps = []
    try:
        lap_num_raw = prop("DataCorePlugin.GameData.CurrentLap") or prop("CurrentLap")
        current_lap = int(lap_num_raw) if lap_num_raw is not None else None

        if (current_lap is not None and _last_lap_num >= 0
                and current_lap > _last_lap_num
                and last_lap_ms and last_lap_ms > 0
                and last_lap_ms != _last_lap_time):

            tw_vals = [v for v in (tw_fl, tw_fr, tw_rl, tw_rr) if v is not None]
            avg_wear = round(sum(tw_vals) / len(tw_vals), 1) if tw_vals else None

            completed_laps.append({
                "game":               game_name,
                "track":              track,
                "car":                car,
                "lap_time_ms":        last_lap_ms,
                "lap_time_formatted": _fmt_ms(last_lap_ms),
                "session_type":       session_type,
                "fuel_level":         fuel,
                "tire_wear":          avg_wear,
            })
            _last_lap_time = last_lap_ms

        if current_lap is not None:
            _last_lap_num = current_lap
    except Exception:
        pass

    return telemetry, completed_laps
