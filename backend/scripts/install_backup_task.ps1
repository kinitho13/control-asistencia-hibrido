param(
  [string]$Destino = (Join-Path $env:USERPROFILE "Backups\ControlAsistencia")
)

$ErrorActionPreference = "Stop"
$nombreTarea = "ControlAsistencia-RespaldoPostgreSQL"
$scriptRespaldo = Join-Path $PSScriptRoot "backup_postgres.ps1"
$powershell = Join-Path $PSHOME "powershell.exe"
$destinoCompleto = [System.IO.Path]::GetFullPath($Destino)

if (-not (Test-Path $scriptRespaldo -PathType Leaf)) {
  throw "No se encontró el script de respaldo: $scriptRespaldo"
}

New-Item -ItemType Directory -Path $destinoCompleto -Force | Out-Null

if (Get-ScheduledTask -TaskName $nombreTarea -ErrorAction SilentlyContinue) {
  throw "Ya existe la tarea '$nombreTarea'. Revísala en el Programador de tareas antes de reemplazarla."
}

$argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptRespaldo`" -Destino `"$destinoCompleto`""
$accion = New-ScheduledTaskAction -Execute $powershell -Argument $argumentos
$disparador = New-ScheduledTaskTrigger -Daily -At "2:00AM"
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited
$ajustes = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask `
  -TaskName $nombreTarea `
  -Action $accion `
  -Trigger $disparador `
  -Principal $principal `
  -Settings $ajustes `
  -Description "Crea y verifica un respaldo PostgreSQL del sistema de asistencia todos los días a las 2:00 a. m." |
  Out-Null

Write-Output "Tarea diaria instalada para $destinoCompleto."
Write-Output "Se ejecuta con la cuenta interactiva actual; el usuario debe haber iniciado sesión y Docker debe estar activo."
