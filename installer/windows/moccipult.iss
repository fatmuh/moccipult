; ── Moccipult Windows Installer (Inno Setup) ──
; Build via GitHub Actions with ISCC compiler

#define AppName "Moccipult"
#define AppVersion "1.0.0"
#define AppPublisher "Moccipult"
#define AppURL "https://github.com/fatmuh/moccipult"
#define AppExeName "moccipult.exe"

[Setup]
AppId={{Moccipult-2024-1.0.0}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
LicenseFile=
OutputDir=output
OutputBaseFilename=moccipult-setup-{#AppVersion}

Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Add to PATH automatically
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "bin\moccipult.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "bin\shorebird.exe"; DestDir: "{app}\bin"; Flags: ignoreversion skipifsourcedoesntexist
Source: "setup-shorebird.bat"; DestDir: "{app}"; Flags: ignoreversion


[Icons]
Name: "{group}\{#AppName} CLI"; Filename: "cmd.exe"; Parameters: "/k ""set PATH={app}\bin;%PATH%"""
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName} Terminal"; Filename: "cmd.exe"; Parameters: "/k ""set PATH={app}\bin;%PATH%"""

[Registry]
; Add to system PATH
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
    ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; \
    Check: NeedsAddPath('{app}\bin')

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[UninstallRun]
; Remove from PATH on uninstall
Filename: "powershell.exe"; \
    Parameters: "-Command ""[Environment]::SetEnvironmentVariable('Path', (([Environment]::GetEnvironmentVariable('Path', 'Machine') -split ';' | Where-Object {{ $_ -ne '{app}\bin' }}) -join ';'), 'Machine')"""; \
    Flags: runhidden

[Code]
function NeedsAddPath(Param: string): boolean;
var
  OldPath: string;
  NewParam: string;
begin
  NewParam := ExpandConstant(Param);
  if not RegQueryStringValue(HKLM, 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment', 'Path', OldPath) then
    Result := True
  else
    Result := Pos(';' + NewParam + ';', ';' + OldPath + ';') = 0;
end;

[Run]
Filename: "cmd.exe"; \
    Parameters: "/c ""echo   ✅ Moccipult installed! Open a NEW terminal and run: moccipult status"""; \
    Flags: postinstall skipifsilent nowait
