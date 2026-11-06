param(
  [string]$Destino = (Join-Path $env:USERPROFILE "Backups\ControlAsistencia"),
  [int]$RetencionDias = 30
)

$ErrorActionPreference = "Stop"
$contenedor = "asistencia_db"
$marca = Get-Date -Format "yyyyMMdd-HHmmss"
$nombre = "asistencia-$marca.dump"
$temporalRemoto = "/tmp/$nombre"
$verificacionRemota = "/tmp/verificar-$nombre"
$archivoFinal = Join-Path $Destino $nombre
$archivoTemporal = "$archivoFinal.partial"
$log = Join-Path $Destino "respaldo.log"

New-Item -ItemType Directory -Path $Destino -Force | Out-Null

try {
  docker inspect $contenedor *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "No se encontró el contenedor '$contenedor'. Inicia PostgreSQL con docker compose."
  }

  docker exec $contenedor pg_dump -U admin -d asistencia -Fc -f $temporalRemoto
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump no pudo crear el respaldo."
  }

  docker exec $contenedor pg_restore --list $temporalRemoto *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL no pudo verificar el archivo de respaldo."
  }

  docker cp "${contenedor}:$temporalRemoto" $archivoTemporal
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo copiar el respaldo al destino local."
  }

  if ((Get-Item $archivoTemporal).Length -le 0) {
    throw "El archivo de respaldo quedó vacío."
  }

  docker cp $archivoTemporal "${contenedor}:$verificacionRemota"
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo verificar el archivo copiado al destino."
  }
  docker exec $contenedor pg_restore --list $verificacionRemota *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "El archivo copiado no pasó la verificación de PostgreSQL."
  }

  Move-Item -LiteralPath $archivoTemporal -Destination $archivoFinal
  $mensaje = "$(Get-Date -Format o) OK $archivoFinal"
  Add-Content -LiteralPath $log -Value $mensaje
  Write-Output $mensaje

  Get-ChildItem -LiteralPath $Destino -Filter "asistencia-*.dump" -File |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetencionDias) } |
    Remove-Item -Force
}
catch {
  Remove-Item -LiteralPath $archivoTemporal -Force -ErrorAction SilentlyContinue
  $mensaje = "$(Get-Date -Format o) ERROR $($_.Exception.Message)"
  Add-Content -LiteralPath $log -Value $mensaje
  Write-Error $mensaje
  exit 1
}
finally {
  docker exec $contenedor rm -f $temporalRemoto $verificacionRemota *> $null
}
