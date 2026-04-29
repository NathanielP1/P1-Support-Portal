"""
Podium 1 Racing — Rig Agent
Entry point. Runs as a background process on the customer's Windows PC.

Startup sequence:
  1. Load local config (customer_email, customer_name, rig) from agent_local.json
  2. Fetch remote config from GET /api/agent
  3. Start telemetry loop at collection_interval_seconds cadence
  4. On each tick: collect all enabled data, POST to /api/agent (type=telemetry)
  5. Any completed laps are POSTed to /api/agent (type=laps) and trigger PB toasts
  6. Remote config is re-fetched every 60 seconds to pick up live changes
  7. New announcements trigger Windows toast notifications (seen IDs stored locally)
"""

import json
import os
import sys
import time
import logging

import requests

from config import BASE_URL, DEFAULT_INTERVAL, LOCAL_CONFIG_PATH, CONFIG_REFRESH_INTERVAL
from notifications import notify_announcement, notify_personal_best, notify_software_update

from collectors.system import get_cpu_temp, get_gpu_temp, get_ram_usage, get_active_game
from collectors.usb import get_usb_devices
from collectors.iracing import get_iracing_data, shutdown as iracing_shutdown
from collectors.simhub import get_simhub_data
from collectors.software import get_software_updates

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("p1_agent.log", encoding="utf-8", delay=True),
    ],
)
log = logging.getLogger("p1_agent")


# ── Local config I/O ─────────────────────────────────────────────────────────

def load_local_config() -> dict:
    """Load customer credentials from agent_local.json."""
    try:
        with open(LOCAL_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        log.error("agent_local.json not found. Run installer/setup.py first.")
        sys.exit(1)
    except Exception as e:
        log.error(f"Failed to read local config: {e}")
        sys.exit(1)


def save_local_config(cfg: dict) -> None:
    """Persist updates to agent_local.json (e.g. seen announcement IDs)."""
    try:
        with open(LOCAL_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        log.warning(f"Could not save local config: {e}")


# ── Remote config ─────────────────────────────────────────────────────────────

def fetch_remote_config() -> dict | None:
    """GET /api/agent and return the config dict, or None on failure."""
    try:
        r = requests.get(f"{BASE_URL}/api/agent", timeout=10)
        if r.status_code == 200:
            return r.json().get("config")
    except Exception as e:
        log.warning(f"Could not fetch remote config: {e}")
    return None


# ── Announcement checker ──────────────────────────────────────────────────────

def check_announcements(remote_config: dict, local_cfg: dict) -> None:
    """Show toast for any announcement the customer hasn't seen yet."""
    announcements = remote_config.get("announcements") or []
    if not announcements:
        return

    seen_ids: list = local_cfg.setdefault("seen_announcement_ids", [])
    changed = False

    for ann in announcements:
        ann_id = ann.get("id") or ann.get("message") or str(ann)
        if ann_id not in seen_ids:
            try:
                notify_announcement(ann)
            except Exception:
                pass
            seen_ids.append(ann_id)
            changed = True

    if changed:
        save_local_config(local_cfg)


# ── Telemetry collection ──────────────────────────────────────────────────────

def collect_and_send(local_cfg: dict, remote_config: dict) -> None:
    """Run one full telemetry tick and POST results to the backend."""
    cfg = remote_config or {}

    # ── System metrics ────────────────────────────────────────────────────────
    cpu_temp = get_cpu_temp()        if cfg.get("collect_cpu_temp", True)  else None
    gpu_temp = get_gpu_temp()        if cfg.get("collect_gpu_temp", True)  else None
    ram_usage = get_ram_usage()      if cfg.get("collect_ram", True)       else None
    game_active = get_active_game()

    # ── USB devices ───────────────────────────────────────────────────────────
    usb_devices, usb_events = [], []
    if cfg.get("collect_usb_devices", True):
        try:
            usb_devices, usb_events = get_usb_devices()
        except Exception as e:
            log.debug(f"USB collector error: {e}")

    # ── Sim telemetry (iRacing has priority; SimHub handles everything else) ──
    fps = None
    completed_laps: list[dict] = []

    if cfg.get("collect_iracing", True):
        try:
            ir_tel, ir_laps = get_iracing_data()
            if ir_tel:
                game_active = ir_tel.get("game_active", game_active)
                fps = ir_tel.get("fps")
            completed_laps.extend(ir_laps)
        except Exception as e:
            log.debug(f"iRacing collector error: {e}")

    if not fps and cfg.get("collect_simhub", True):
        try:
            sh_tel, sh_laps = get_simhub_data()
            if sh_tel:
                game_active = sh_tel.get("game_active", game_active)
                fps = sh_tel.get("fps")
            completed_laps.extend(sh_laps)
        except Exception as e:
            log.debug(f"SimHub collector error: {e}")

    # ── Software update check ─────────────────────────────────────────────────
    software_updates = []
    latest_versions = cfg.get("software_versions") or {}
    if latest_versions:
        try:
            software_updates = get_software_updates(latest_versions)
        except Exception as e:
            log.debug(f"Software collector error: {e}")

    # ── POST telemetry ────────────────────────────────────────────────────────
    payload = {
        "type": "telemetry",
        "customer_email": local_cfg["customer_email"],
        "customer_name": local_cfg.get("customer_name", ""),
        "rig": local_cfg.get("rig", ""),
        "agent_version": cfg.get("version", "1.0.0"),
        "cpu_temp": cpu_temp,
        "gpu_temp": gpu_temp,
        "ram_usage": ram_usage,
        "fps": fps,
        "game_active": game_active,
        "usb_devices": usb_devices,
        "software_updates": software_updates,
        "usb_events": usb_events,
    }
    try:
        r = requests.post(
            f"{BASE_URL}/api/agent",
            json=payload,
            timeout=10,
        )
        if r.status_code not in (200, 201):
            log.warning(f"Telemetry POST returned {r.status_code}")
    except Exception as e:
        log.warning(f"Telemetry POST failed: {e}")

    # ── POST completed laps ───────────────────────────────────────────────────
    for lap in completed_laps:
        send_lap(lap, local_cfg)


def send_lap(lap: dict, local_cfg: dict) -> None:
    """POST a completed lap to /api/agent and trigger PB notification if applicable."""
    lap_payload = {
        "type": "laps",
        "customer_email": local_cfg["customer_email"],
        "customer_name": local_cfg.get("customer_name", ""),
        **lap,
    }
    try:
        r = requests.post(f"{BASE_URL}/api/agent", json=lap_payload, timeout=10)
        if r.status_code in (200, 201):
            data = r.json()
            if data.get("is_personal_best"):
                try:
                    notify_personal_best(lap)
                except Exception:
                    pass
        else:
            log.warning(f"Lap POST returned {r.status_code}")
    except Exception as e:
        log.warning(f"Lap POST failed: {e}")


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    log.info("Podium 1 Racing Rig Agent starting…")

    local_cfg = load_local_config()
    log.info(f"Loaded local config for {local_cfg.get('customer_email')}")

    remote_config = fetch_remote_config()
    if remote_config:
        log.info(f"Remote config loaded (version {remote_config.get('version', '?')})")
    else:
        log.warning("Could not fetch remote config — using defaults")
        remote_config = {}

    interval = int(remote_config.get("collection_interval_seconds") or DEFAULT_INTERVAL)
    last_config_fetch = time.time()

    log.info(f"Collection interval: {interval}s. Running.")

    try:
        while True:
            tick_start = time.time()

            # Re-fetch remote config periodically
            if tick_start - last_config_fetch >= CONFIG_REFRESH_INTERVAL:
                new_cfg = fetch_remote_config()
                if new_cfg:
                    remote_config = new_cfg
                    interval = int(remote_config.get("collection_interval_seconds") or interval)
                last_config_fetch = tick_start

            # Check for new announcements
            try:
                check_announcements(remote_config, local_cfg)
            except Exception as e:
                log.debug(f"Announcement check error: {e}")

            # Collect and send telemetry
            try:
                collect_and_send(local_cfg, remote_config)
            except Exception as e:
                log.error(f"Collection tick error: {e}")

            # Sleep for the remainder of the interval
            elapsed = time.time() - tick_start
            sleep_time = max(0, interval - elapsed)
            time.sleep(sleep_time)

    except KeyboardInterrupt:
        log.info("Agent stopped by user.")
    finally:
        try:
            iracing_shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    main()
