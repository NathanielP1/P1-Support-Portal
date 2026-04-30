; ============================================================
; Podium 1 Racing — Rig Agent Installer
; Inno Setup 6 script
; Build with: Inno Setup Compiler (free — jrsoftware.org/isinfo.php)
; ============================================================

#define MyAppName      "P1 Racing Agent"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "Podium 1 Racing"
#define MyAppURL       "https://p1-support-portal.vercel.app"
#define MyAppExeName   "pythonw.exe"
#define MyInstallDir   "{commonpf}\Podium1Racing\Agent"

[Setup]
AppId={{A7B3C2D1-E4F5-6789-ABCD-EF0123456789}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={#MyInstallDir}
DefaultGroupName={#MyAppPublisher}
AllowNoIcons=yes
LicenseFile=LICENSE.txt
OutputDir=dist
OutputBaseFilename=P1-Rig-Agent-Setup
SetupIconFile=p1_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardResizable=no
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
UninstallDisplayIcon={app}\python\pythonw.exe
UninstallDisplayName={#MyAppName}
CloseApplications=yes
RestartApplications=no
ArchitecturesInstallIn64BitMode=x64

; Custom wizard pages need Inno Pascal Scripting — see [Code] section below

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked
Name: "startup";    Description: "Start &automatically when Windows starts"; GroupDescription: "Startup:"; Flags: checkedonce

[Files]
; Python embeddable distribution — place python-3.11.x-embed-amd64.zip contents
; in a subfolder called python/ next to this .iss file before building.
Source: "python\*"; DestDir: "{app}\python"; Flags: ignoreversion recursesubdirs createallsubdirs

; Agent source files
Source: "..\main.py";          DestDir: "{app}"; Flags: ignoreversion
Source: "..\config.py";        DestDir: "{app}"; Flags: ignoreversion
Source: "..\notifications.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\requirements.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\collectors\*";     DestDir: "{app}\collectors"; Flags: ignoreversion recursesubdirs

; Pre-installed pip packages — run build_packages.bat first to populate site-packages/
Source: "site-packages\*"; DestDir: "{app}\python\Lib\site-packages"; Flags: ignoreversion recursesubdirs createallsubdirs

; Credential stub (will be written by installer wizard via [Code])
; agent_local.json is created in [Code] section

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\main.py"""; WorkingDir: "{app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\main.py"""; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; Register startup (only if task selected)
Root: HKCU; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "P1RacingAgent"; ValueData: """{app}\python\pythonw.exe"" ""{app}\main.py"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
; Launch immediately after install
Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\main.py"""; WorkingDir: "{app}"; Description: "Start {#MyAppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Kill the agent process before uninstalling
Filename: "taskkill.exe"; Parameters: "/F /IM pythonw.exe"; Flags: runhidden; RunOnceId: "KillAgent"

[Code]
// ── Custom wizard pages for customer credentials ──────────────────────────
var
  CredPage: TWizardPage;
  EmailEdit: TEdit;
  NameEdit:  TEdit;
  EmailLabel: TLabel;
  NameLabel:  TLabel;

procedure InitializeWizard;
begin
  // Create a custom credentials page after the license page
  CredPage := CreateCustomPage(wpLicense, 'Your Details',
    'Enter the email address and name registered with Podium 1 Racing.');

  EmailLabel := TLabel.Create(WizardForm);
  EmailLabel.Parent  := CredPage.Surface;
  EmailLabel.Left    := 0;
  EmailLabel.Top     := 8;
  EmailLabel.Width   := CredPage.SurfaceWidth;
  EmailLabel.Caption := 'Email address *';

  EmailEdit := TEdit.Create(WizardForm);
  EmailEdit.Parent  := CredPage.Surface;
  EmailEdit.Left    := 0;
  EmailEdit.Top     := 26;
  EmailEdit.Width   := CredPage.SurfaceWidth;
  EmailEdit.TabOrder := 0;

  NameLabel := TLabel.Create(WizardForm);
  NameLabel.Parent  := CredPage.Surface;
  NameLabel.Left    := 0;
  NameLabel.Top     := 64;
  NameLabel.Width   := CredPage.SurfaceWidth;
  NameLabel.Caption := 'Your name';

  NameEdit := TEdit.Create(WizardForm);
  NameEdit.Parent   := CredPage.Surface;
  NameEdit.Left     := 0;
  NameEdit.Top      := 82;
  NameEdit.Width    := CredPage.SurfaceWidth;
  NameEdit.TabOrder := 1;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Email, Name: String;
begin
  Result := True;
  if CurPageID = CredPage.ID then begin
    Email := Trim(EmailEdit.Text);
    if (Email = '') or (Pos('@', Email) = 0) then begin
      MsgBox('Please enter a valid email address.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

procedure WriteLocalConfig;
var
  ConfigPath: String;
  Lines: TArrayOfString;
  Email, Name: String;
  Json: String;
begin
  Email := Trim(EmailEdit.Text);
  Name  := Trim(NameEdit.Text);
  // Escape basic JSON characters
  Email := StringChangeEx(Email, '"', '\"', True);
  Name  := StringChangeEx(Name,  '"', '\"', True);

  Json := '{' + #13#10 +
          '  "customer_email": "' + Email + '",' + #13#10 +
          '  "customer_name": "'  + Name  + '",' + #13#10 +
          '  "rig": "",' + #13#10 +
          '  "seen_announcement_ids": []' + #13#10 +
          '}';

  ConfigPath := ExpandConstant('{app}\agent_local.json');
  SaveStringToFile(ConfigPath, Json, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    WriteLocalConfig;
end;
