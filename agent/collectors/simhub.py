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
SIMHUB_TIMEOUT = 1.5   # seconds — short so we don't stall the main loop

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
    - telemetry_data: dict with game_active, fps, track, car, session_type or empty dict
    - completed_laps: list of completed lap dicts ready to POST to /api/agent
    """
    global _last_lap_num, _last_lap_time

    # Quick check: is SimHub running and is a game active?
    game_info = _get("/api/game")
    if not game_info or not game_info.get("IsRunning"):
        _last_lap_num = -1
        return {}, []

    game_name = game_info.get("Name") or game_info.get("GameName") or "Unknown"

    # Fetch detailed session data
    data = _get("/api/datasources/jokerdata") or {}
    props = data.get("Properties") or data  # SimHub nests values differently by version

    def prop(key: str, default=None):
        """Safely pull a value from props, handling both flat and nested layouts."""
        if isinstance(props, dict):
            return props.get(key, default)
        return default

    track = prop("DataCorePlugin.GameRawData.TrackName") or prop("TrackName") or prop("track")
    car = prop("DataCorePlugin.GameRawData.CarModel") or prop("CarModel") or prop("car")
    session_type = prop("DataCorePlugin.GameRawData.SessionType") or prop("SessionType")
    fps = None
    try:
        fps_raw = prop("DataCorePlugin.GameData.FramesPerSecond") or prop("FramesPerSecond")
        if fps_raw is not None:
            fps = int(float(fps_raw))
    except Exception:
        pass

    fuel = None
    try:
        fuel_raw = prop("DataCorePlugin.GameData.Fuel") or prop("Fuel")
        if fuel_raw is not None:
            fuel = round(float(fuel_raw), 2)
    except Exception:
        pass

    # Tire wear — SimHub reports per-tyre wear 0–1
    tire_wear = None
    try:
        corners = []
        for key in ("TyrewearFrontLeft", "TyrewearFrontRight", "TyrewearRearLeft", "TyrewearRearRight"):
            val = prop(f"DataCorePlugin.GameData.{key}") or prop(key)
            if val is not None:
                corners.append(float(val))
        if corners:
            tire_wear = round(sum(corners) / len(corners) * 100, 1)
    except Exception:
        pass

    telemetry = {
        "game_active": game_name,
        "fps": fps,
        "track": track,
        "car": car,
        "session_type": session_type,
    }

    # Lap completion detection
    completed_laps = []
    try:
        lap_num_raw = prop("DataCorePlugin.GameData.CurrentLap") or prop("CurrentLap")
        lap_time_raw = prop("DataCorePlugin.GameData.LastLapTime") or prop("LastLapTime")

        current_lap = int(lap_num_raw) if lap_num_raw is not None else None
        last_lap_ms = None
        if lap_time_raw is not None:
            # SimHub may give seconds (float) or milliseconds (int); detect by magnitude
            val = float(lap_time_raw)
            last_lap_ms = int(val * 1000) if val < 3600 else int(val)  # <3600 → seconds

        if (current_lap is not None and _last_lap_num >= 0
                and current_lap > _last_lap_num
                and last_lap_ms and last_lap_ms > 0
                and last_lap_ms != _last_lap_time):
            completed_laps.append({
                "game": game_name,
                "track": track,
                "car": car,
                "lap_time_ms": last_lap_ms,
                "lap_time_formatted": _fmt_ms(last_lap_ms),
                "session_type": session_type,
                "fuel_level": fuel,
                "tire_wear": tire_wear,
            })
            _last_lap_time = last_lap_ms

        if current_lap is not None:
            _last_lap_num = current_lap
    except Exception:
        pass

    return telemetry, completed_laps
