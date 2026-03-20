# Free a TCP listen port (Windows). Run from project root:
#   npm run free:3000
param(
  [int]$Port = 3000
)

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
  Write-Host "Port $Port is already free."
  exit 0
}

$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($proc in $pids) {
  if ($proc -eq 0) { continue }
  try {
    $name = (Get-Process -Id $proc -ErrorAction SilentlyContinue).ProcessName
    Stop-Process -Id $proc -Force -ErrorAction Stop
    Write-Host "Stopped PID $proc ($name) on port $Port"
  }
  catch {
    Write-Warning ('Could not stop PID {0}: {1}' -f $proc, $_.Exception.Message)
    exit 1
  }
}
exit 0
