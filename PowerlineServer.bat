@echo off
setlocal

:loop
echo Starting Node.js process...
node PowerlineServer.js

if %ERRORLEVEL% NEQ 0 (
    echo Node.js process crashed with exit code %ERRORLEVEL%. Restarting in 5 seconds...
    timeout /t 5
    goto loop
)

endlocal