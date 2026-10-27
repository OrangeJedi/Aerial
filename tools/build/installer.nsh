!macro customUnInstall
  ${ifNot} ${isUpdated}
    InitPluginsDir
    File /oname=$PLUGINSDIR\cleanup.ps1 "${BUILD_RESOURCES_DIR}\cleanup.ps1"
    File /oname=$PLUGINSDIR\videos.json "${BUILD_RESOURCES_DIR}\..\..\videos.json"
    # ONE_CLICK sets Silent internally, so inspect the original /S argument.
    StrCpy $R2 ""
    ClearErrors
    ${GetParameters} $R0
    ${GetOptions} $R0 "/S" $R1
    ${ifNot} ${Errors}
      StrCpy $R2 "-Silent"
    ${endif}
    SetShellVarContext current
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup.ps1" -DataDirectory "$APPDATA\Aerial" -Catalog "$PLUGINSDIR\videos.json" $R2'
    Pop $R0
    ${if} $R0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "Aerial could not finish removing cached videos. Your settings were retained so you can retry uninstalling." /SD IDOK
      Abort
    ${endif}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Aerial"
  ${endif}
!macroend
