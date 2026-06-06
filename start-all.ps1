# Start backend and frontend in two new PowerShell windows (Windows-only)
# Usage: Right-click -> Run with PowerShell, or execute in an elevated PowerShell session

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendScript = Join-Path $env:TEMP 'epson-qc-backend-start.ps1'
$frontendScript = Join-Path $env:TEMP 'epson-qc-frontend-start.ps1'

$backendContent = @"
Set-Location "$root"
$env:POSTGRES_PORT='5433'
$env:DETECTION_MODEL_PATH='best.pt'
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
"@

$frontendContent = @"
Set-Location "$root\frontend"
$env:REACT_APP_API_URL='http://localhost:8000'
npm start
"@

$backendContent | Set-Content -Path $backendScript -Encoding UTF8
$frontendContent | Set-Content -Path $frontendScript -Encoding UTF8

$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCmd) {
    $shellPath = $pwshCmd.Source
} else {
    $powershellCmd = Get-Command powershell -ErrorAction SilentlyContinue
    if ($powershellCmd) {
        $shellPath = $powershellCmd.Source
    } else {
        throw "Cannot find pwsh or powershell executable on this machine."
    }
}

Start-Process -FilePath $shellPath -ArgumentList ('-NoExit', '-File', $backendScript)
Start-Process -FilePath $shellPath -ArgumentList ('-NoExit', '-File', $frontendScript)
