"""
Windows toast notifications for the Podium 1 rig agent.
Primary: win10toast. Fallback: ctypes MessageBox (always available on Windows).
"""

APP_NAME = "Podium 1 Racing"

try:
    from win10toast import ToastNotifier
    _toaster = ToastNotifier()
    _WIN10TOAST = True
except Exception:
    _toaster = None
    _WIN10TOAST = False


def show_toast(title: str, message: str, duration: int = 8) -> None:
    """Display a Windows toast notification. Fails silently if notifications are unavailable."""
    if _WIN10TOAST and _toaster:
        try:
            _toaster.show_toast(
                f"{APP_NAME} — {title}",
                message,
                duration=duration,
                threaded=True,
            )
            return
        except Exception:
            pass

    # Fallback: ctypes MessageBox (blocks briefly, but always works on Windows)
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            message,
            f"{APP_NAME} — {title}",
            0x40 | 0x1000,   # MB_ICONINFORMATION | MB_SYSTEMMODAL
        )
    except Exception:
        pass


def notify_announcement(announcement: dict) -> None:
    """Show a toast for a new announcement from the staff portal."""
    message = announcement.get("message") or announcement.get("text") or str(announcement)
    show_toast("New announcement", message)


def notify_personal_best(lap: dict) -> None:
    """Show a toast when the driver sets a new personal best lap."""
    formatted = lap.get("lap_time_formatted") or f"{lap.get('lap_time_ms', 0)}ms"
    track = lap.get("track") or "Unknown track"
    car = lap.get("car") or ""
    body = f"{formatted} at {track}"
    if car:
        body += f" ({car})"
    show_toast("New personal best!", body)


def notify_software_update(app: str, installed: str, latest: str) -> None:
    """Show a toast when a software update is available."""
    show_toast(
        "Software update available",
        f"{app}: {installed} → {latest}\nVisit the P1 portal to download.",
    )
