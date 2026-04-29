"""
Podium 1 Racing — Rig Agent Configuration
"""

BASE_URL = "https://p1-support-portal.vercel.app"

# How often to send telemetry (seconds). Overridden by remote config.
DEFAULT_INTERVAL = 5

# Local config file created by the installer (stores customer_email, customer_name, rig_name)
LOCAL_CONFIG_PATH = "agent_local.json"

# How often to re-fetch the remote config (seconds)
CONFIG_REFRESH_INTERVAL = 60

# Processes we recognise as active simulators
KNOWN_SIM_PROCESSES = {
    "iRacingSim64DX11.exe": "iRacing",
    "acs.exe": "Assetto Corsa",
    "acc.exe": "ACC",
    "AssettoCorsa.exe": "Assetto Corsa",
    "RRRE.exe": "RaceRoom",
    "rf2.exe": "rFactor 2",
    "AMS2AVX.exe": "AMS2",
    "Le Mans Ultimate.exe": "LMU",
    "ProjectCARS2.exe": "PC2",
    "F12023.exe": "F1 2023",
    "F12024.exe": "F1 2024",
    "dirt5.exe": "DiRT 5",
    "WRCGame.exe": "WRC",
}
