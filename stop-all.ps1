# Stop backend (uvicorn) and frontend (npm) processes started by start-all.ps1
$procs = Get-Process | Where-Object { $_.Path -and ($_.Path -like '*pwsh*' -or $_.Path -like '*powershell*') }
foreach ($p in $procs) {
    try {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine
        if ($cmd -match 'uvicorn|main:app' -or $cmd -match 'npm start') {
            Write-Host "Stopping PID $($p.Id): $cmd"
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # ignore
    }
}

# fallback: try to stop uvicorn/python processes
Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*python*' } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Write-Host "Stop attempts completed."