"""
System telemetry collector — GPU temp, RAM usage, FPS, active game.
CPU temperature removed: unreliable on Windows without third-party drivers.
All Windows-specific imports are wrapped in try/except for graceful fallback.
"""

import subprocess
import psutil

try:
    import wmi as wmi_module
    _wmi_hw = None
    try:
        _wmi_hw = wmi_module.WMI(namespace=r"root\OpenHardwareMonitor")
    except Exception:
        pass
except Exception:
    _wmi_hw = None

from config import KNOWN_SIM_PROCESSES


def get_gpu_temp() -> float | None:
    """Return GPU temperature in Celsius via nvidia-smi, then OHM WMI."""
    # nvidia-smi (NVIDIA GPUs)
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=3
        )
        if result.returncode == 0:
            val = result.stdout.strip()
            if val.isdigit():
                return float(val)
    except Exception:
        pass

    # Open Hardware Monitor WMI namespace (AMD / Intel via OHM)
    if _wmi_hw:
        try:
            for sensor in _wmi_hw.Sensor():
                if sensor.SensorType == "Temperature" and "gpu" in sensor.Name.lower():
                    return round(float(sensor.Value), 1)
        except Exception:
            pass

    return None


def get_ram_usage() -> float | None:
    """Return RAM usage as a percentage (0–100)."""
    try:
        return round(psutil.virtual_memory().percent, 1)
    except Exception:
        return None


def get_active_game() -> str | None:
    """Return the display name of any known simulator currently running."""
    try:
        for proc in psutil.process_iter(["name"]):
            name = proc.info.get("name") or ""
            if name in KNOWN_SIM_PROCESSES:
                return KNOWN_SIM_PROCESSES[name]
    except Exception:
        pass
    return None


def get_fps() -> int | None:
    """
    FPS is captured by SimHub or iRacing collectors when a game is running.
    This function is a placeholder; return None here and let the sim-specific
    collectors override it.
    """
    return None
