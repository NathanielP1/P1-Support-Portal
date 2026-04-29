"""
Podium 1 Racing — Rig Agent Installer
Run once on the customer's PC to configure and register the agent.

Usage:
    python installer/setup.py
"""

import json
import os
import subprocess
import sys

AGENT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOCAL_CONFIG_PATH = os.path.join(AGENT_DIR, "agent_local.json")
MAIN_SCRIPT = os.path.join(AGENT_DIR, "main.py")
REG_KEY = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
REG_VALUE_NAME = "P1RacingAgent"


def install_requirements():
    print("\n[1/4] Installing Python dependencies…")
    req_file = os.path.join(AGENT_DIR, "requirements.txt")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", req_file],
        capture_output=False,
    )
    if result.returncode != 0:
        print("WARNING: Some dependencies may not have installed correctly.")
    else:
        print("       Dependencies installed.")


def collect_customer_info() -> dict:
    print("\n[2/4] Customer configuration")
    print("      Please enter your details (provided by Podium 1 Racing).\n")
    email = input("  Customer email: ").strip()
    while not email or "@" not in email:
        email = input("  Please enter a valid email address: ").strip()

    name = input("  Your name: ").strip()
    rig = input("  Simulator model (e.g. P1-X Ultimate) [optional]: ").strip()

    return {
        "customer_email": email,
        "customer_name": name,
        "rig": rig,
        "seen_announcement_ids": [],
    }


def write_local_config(cfg: dict):
    with open(LOCAL_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    print(f"       Config saved to {LOCAL_CONFIG_PATH}")


def register_startup():
    print("\n[3/4] Registering agent to run at Windows startup…")
    try:
        import winreg
        python_exe = sys.executable
        command = f'"{python_exe}" "{MAIN_SCRIPT}"'
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_KEY, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, REG_VALUE_NAME, 0, winreg.REG_SZ, command)
        winreg.CloseKey(key)
        print(f"       Registered: {command}")
    except ImportError:
        print("       Skipped (winreg not available — not on Windows?).")
    except Exception as e:
        print(f"       WARNING: Could not register startup item: {e}")


def create_desktop_shortcut():
    print("\n[4/4] Creating desktop shortcut…")
    try:
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        shortcut_path = os.path.join(desktop, "P1 Racing Agent.lnk")
        python_exe = sys.executable

        # Use PowerShell to create the .lnk file
        ps_script = f"""
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut('{shortcut_path}')
$sc.TargetPath = '{python_exe}'
$sc.Arguments = '"{MAIN_SCRIPT}"'
$sc.WorkingDirectory = '{AGENT_DIR}'
$sc.Description = 'Podium 1 Racing Rig Agent'
$sc.Save()
"""
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            print(f"       Shortcut created at {shortcut_path}")
        else:
            print(f"       Could not create shortcut: {result.stderr.strip()}")
    except Exception as e:
        print(f"       Could not create shortcut: {e}")


def main():
    print("=" * 60)
    print("  Podium 1 Racing — Rig Agent Setup")
    print("=" * 60)
    print(f"  Agent directory: {AGENT_DIR}")

    install_requirements()
    cfg = collect_customer_info()
    write_local_config(cfg)
    register_startup()
    create_desktop_shortcut()

    print("\n" + "=" * 60)
    print("  Setup complete!")
    print(f"  The agent will start automatically at Windows login.")
    print(f"  To start it now, run:  python \"{MAIN_SCRIPT}\"")
    print("=" * 60)

    input("\nPress Enter to exit…")


if __name__ == "__main__":
    main()
