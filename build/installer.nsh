!macro customInit
  ; Check if the application is running during installation
  ${nsProcess::FindProcess} "Vishel.exe" $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Vishel is currently running. Please close the application before continuing the installation." IDOK tryAgain IDCANCEL cancel
    tryAgain:
      ${nsProcess::FindProcess} "Vishel.exe" $R0
      ${If} $R0 == 0
        Goto tryAgain
      ${EndIf}
      Goto done
    cancel:
      Abort
    done:
  ${EndIf}
  ${nsProcess::Unload}
!macroend

!macro customUnInit
  ; Check if the application is running during uninstallation
  ${nsProcess::FindProcess} "Vishel.exe" $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Vishel is currently running. Please close the application before continuing the uninstallation." IDOK tryAgainUninst IDCANCEL cancelUninst
    tryAgainUninst:
      ${nsProcess::FindProcess} "Vishel.exe" $R0
      ${If} $R0 == 0
        Goto tryAgainUninst
      ${EndIf}
      Goto doneUninst
    cancelUninst:
      Abort
    doneUninst:
  ${EndIf}
  ${nsProcess::Unload}
!macroend
