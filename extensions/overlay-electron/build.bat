IF '%ERRORLEVEL%' NEQ '0' (
    ECHO Requesting administrative privileges...
    ECHO(
    powershell.exe -Command "Start-Process '%~f0' -Verb RunAs"
    EXIT /B
)

taskkill /IM netsocketoverlay.exe /F
npx @electron/packager . netsocketoverlay --overwrite