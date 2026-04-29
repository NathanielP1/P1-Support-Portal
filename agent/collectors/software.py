"""
Software version checker — scans Windows registry for installed simulator
peripherals and compares against the latest versions from agent_config.
"""

from typing import Optional

try:
    import winreg
    _WINREG_AVAILABLE = True
except ImportError:
    _WINREG_AVAILABLE = False

# Map of display-name substrings (lowercase) to our internal app keys
APP_NAME_MAP = {
    "asetek racehub":   "asetek_racehub",
    "racehub":          "asetek_racehub",
    "moza pit house":   "moza_pit_house",
    "pit house":        "moza_pit_house",
    "simucube":         "simucube_tuner",
    "truedrive":        "simucube_tuner",
    "simhub":           "simhub",
    "iracing":          "iracing",
}

REGISTRY_PATHS = [
    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
        if _WINREG_AVAILABLE else (None, None),
    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall")
        if _WINREG_AVAILABLE else (None, None),
    (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
        if _WINREG_AVAILABLE else (None, None),
]


def _version_older(installed: str, latest: str) -> bool:
    """Return True if installed version is strictly older than latest."""
    def to_tuple(v: str):
        try:
            return tuple(int(x) for x in v.strip().lstrip("v").split("."))
        except Exception:
            return (0,)
    return to_tuple(installed) < to_tuple(latest)


def _scan_registry() -> dict[str, str]:
    """Return {app_key: installed_version} for all recognised apps found in the registry."""
    if not _WINREG_AVAILABLE:
        return {}

    found: dict[str, str] = {}

    for hive, path in REGISTRY_PATHS:
        if hive is None:
            continue
        try:
            root = winreg.OpenKey(hive, path)
        except OSError:
            continue

        i = 0
        while True:
            try:
                subkey_name = winreg.EnumKey(root, i)
                i += 1
            except OSError:
                break

            try:
                subkey = winreg.OpenKey(root, subkey_name)
                try:
                    display_name, _ = winreg.QueryValueEx(subkey, "DisplayName")
                    display_name_lower = display_name.lower()
                    for keyword, app_key in APP_NAME_MAP.items():
                        if keyword in display_name_lower and app_key not in found:
                            try:
                                version, _ = winreg.QueryValueEx(subkey, "DisplayVersion")
                                if version:
                                    found[app_key] = version.strip()
                            except OSError:
                                pass
                            break
                except OSError:
                    pass
                finally:
                    winreg.CloseKey(subkey)
            except OSError:
                pass

        winreg.CloseKey(root)

    return found


def get_software_updates(latest_versions: dict) -> list[dict]:
    """
    Compare installed versions against latest_versions dict from agent_config.
    Returns list of {app, installed_version, latest_version} for outdated apps.

    latest_versions example:
        {"asetek_racehub": "2.5.0", "simhub": "9.2.0", ...}
    """
    if not latest_versions:
        return []

    installed = _scan_registry()
    updates = []

    for app_key, latest_ver in latest_versions.items():
        inst_ver = installed.get(app_key)
        if inst_ver is None:
            continue  # not installed — skip
        if _version_older(inst_ver, latest_ver):
            updates.append({
                "app": app_key,
                "installed_version": inst_ver,
                "latest_version": latest_ver,
            })

    return updates
