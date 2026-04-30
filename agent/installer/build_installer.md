# Building the P1 Rig Agent Installer

This guide walks the P1 team through producing `P1-Rig-Agent-Setup.exe` using the free Inno Setup Compiler.

---

## Prerequisites

| Tool | Where to get it |
|------|----------------|
| **Inno Setup 6** (free) | https://jrsoftware.org/isinfo.php — download "innosetup-6.x.x.exe" |
| **Python 3.11 embeddable (64-bit)** | https://www.python.org/downloads/windows/ → "Windows embeddable package (64-bit)" |
| **pip packages** (offline bundle) | Run `build_packages.bat` (see below) on any machine with Python 3.11 + internet |

---

## Folder layout before building

The `installer/` folder must look like this before you open the compiler:

```
installer/
├── P1Agent.iss              ← the Inno Setup script (already in repo)
├── LICENSE.txt              ← plain-text licence shown in wizard (create/edit as needed)
├── p1_icon.ico              ← app icon (16×16 + 32×32 + 48×48 ICO)
├── python/                  ← contents of the Python embeddable ZIP (extracted here)
│   ├── pythonw.exe
│   ├── python311.zip
│   ├── python311._pth       ← you will edit this (see step 3)
│   └── ...
└── site-packages/           ← offline pip packages (built by build_packages.bat)
    ├── requests/
    ├── psutil/
    └── ...
```

---

## Step-by-step

### Step 1 — Install Inno Setup

Download and run the installer from https://jrsoftware.org/isinfo.php.  
Accept all defaults. No extra plugins are needed.

---

### Step 2 — Extract the Python embeddable distribution

1. Download `python-3.11.x-embed-amd64.zip` from python.org.
2. Extract the ZIP directly into `installer/python/` so that `pythonw.exe` is at `installer/python/pythonw.exe`.

---

### Step 3 — Enable `site-packages` in the embeddable Python

The embeddable distribution disables `site` by default. You must enable it:

1. Open `installer/python/python311._pth` in Notepad.
2. Find the line that says `#import site` and remove the `#` so it reads:
   ```
   import site
   ```
3. Save and close.

---

### Step 4 — Bundle pip packages (offline)

Create `installer/build_packages.bat` with the following content (or run the commands manually):

```bat
@echo off
pip download ^
  requests psutil pywin32 wmi win10toast irsdk ^
  --dest installer\wheels\ ^
  --platform win_amd64 --python-version 311 --only-binary=:all:

pip install ^
  requests psutil pywin32 wmi win10toast irsdk ^
  --target installer\site-packages\ ^
  --no-index --find-links installer\wheels\
```

Run it from the repo root:

```
build_packages.bat
```

This populates `installer/site-packages/` with all packages the agent needs. The installer script copies this folder into the bundled Python's `Lib\site-packages` directory at install time.

> **Note:** `irsdk` may require a manual wheel if it is not on PyPI with a binary release. In that case, download the `.whl` from the project's GitHub releases and add it to `installer/wheels/` before running the second pip command.

---

### Step 5 — Add LICENSE.txt and icon

- **LICENSE.txt** — Create a plain-text file at `installer/LICENSE.txt`. The wizard displays it during installation. Minimum content:
  ```
  Copyright (c) 2024 Podium 1 Racing. All rights reserved.
  This software is provided for use by licensed Podium 1 Racing customers only.
  ```
- **p1_icon.ico** — Place a multi-resolution `.ico` file at `installer/p1_icon.ico`.  
  Free converter: https://icoconvert.com (upload a PNG, export as ICO with 16/32/48 px sizes).

---

### Step 6 — Open and compile with Inno Setup

1. Launch **Inno Setup Compiler** (Start menu → Inno Setup 6 → Inno Setup Compiler).
2. Click **File → Open** and select `installer/P1Agent.iss`.
3. Click **Build → Compile** (or press **F9**).
4. The compiler will report any missing files in the Messages pane.  
   Fix any errors (usually a missing file in `python/` or `site-packages/`) and compile again.
5. On success, the output file is written to:
   ```
   installer/dist/P1-Rig-Agent-Setup.exe
   ```

---

### Step 7 — Test the installer

1. Run `P1-Rig-Agent-Setup.exe` on a clean Windows 10/11 machine (or a VM).
2. Complete the wizard — enter a test email and name on the **Your Details** page.
3. Confirm:
   - Agent installs to `C:\Program Files\Podium1Racing\Agent\`
   - `agent_local.json` is created with the email/name you entered.
   - `pythonw.exe main.py` starts without errors (check `p1_agent.log`).
   - The system tray / taskbar shows no Python error dialogs.
   - Startup registry key is present (if task was selected):  
     `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` → `P1RacingAgent`

---

## Distributing the installer

Upload `P1-Rig-Agent-Setup.exe` to a public URL (e.g. a Vercel static asset, GitHub Release, or S3 bucket) and update the download link in `public/index.html`:

```js
// In RigPage component — update this href:
href="https://your-cdn.example.com/P1-Rig-Agent-Setup.exe"
```

---

## Re-building after code changes

Whenever agent Python files change:

1. Update `#define MyAppVersion` in `P1Agent.iss` (e.g. `"1.0.1"`).
2. Re-run `build_packages.bat` only if dependencies changed.
3. Compile again (Step 6). The new `.exe` is self-contained — customers run the new installer over the old one (the old agent is killed automatically by `[UninstallRun]`).
