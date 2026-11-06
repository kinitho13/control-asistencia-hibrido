# Operacion del sistema

## Desarrollo en la red local

1. Inicia PostgreSQL desde la raiz del proyecto:

   ```powershell
   docker compose up -d postgres
   ```

2. En una terminal, inicia el backend:

   ```powershell
   Set-Location .\backend
   .\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. En otra terminal, inicia el frontend:

   ```powershell
   Set-Location .\frontend
   npm run dev -- --host 0.0.0.0
   ```

4. Los equipos de la misma red abren `http://<IP-LAN-DEL-SERVIDOR>:5173`.
   Permite los puertos TCP 5173 y 8000 en el firewall solo para el perfil de
   red privada. La IP del servidor se puede consultar con `ipconfig`.

No expongas estos puertos directamente a Internet. Para acceso externo se
requiere un despliegue con HTTPS, autenticacion y reglas de red apropiadas.
El modo `--reload` es solo para desarrollo.

## Seguridad del backend

Las rutas de la API requieren una sesión de inicio de sesión, excepto el estado
del servicio, el login, el logout y el alta inicial protegida del administrador.
Las modificaciones de usuarios, restricciones, festivos y cierres requieren
rol de administrador; asistencia, reemplazos y generación de cronograma
requieren rol de administrador o líder. Las solicitudes y notificaciones
también validan que el usuario actúe sobre sus propios registros.

Las marcaciones reales se guardan por separado del cronograma planificado.
Cada persona puede registrar su entrada y salida; administradores y líderes
pueden consultar el pase de lista y corregir registros. Las horas se manejan
con la zona horaria `America/Bogota`.

Las contraseñas nuevas se guardan con hash. Las contraseñas antiguas se migran
al hash cuando su propietario inicia sesión correctamente. Los navegadores con
sesiones antiguas deben iniciar sesión de nuevo para recibir su token.

El endpoint `/crear-admin` solo funciona cuando no existe todavía un
administrador y se han definido `ADMIN_BOOTSTRAP_TOKEN` y
`ADMIN_BOOTSTRAP_PASSWORD` en el entorno del backend. El token se envía en la
cabecera `X-Bootstrap-Token`; la contraseña debe tener al menos 12 caracteres.
Configura estos valores de forma temporal y privada, crea el administrador y
retíralos del entorno inmediatamente después. No reutilices la contraseña del
token ni guardes secretos en el repositorio.

Para un despliegue de producción, configura `APP_ENV=production` y
`CORS_ALLOWED_ORIGINS` con los orígenes HTTPS exactos del frontend, separados
por comas. El backend no inicia en producción si no se configura CORS, y
deshabilita Swagger/OpenAPI. Publica el servicio detrás de HTTPS y no uses
`--reload` en producción.

## Copia de seguridad

Desde la raiz del proyecto, crea un respaldo PostgreSQL en formato comprimido:

```powershell
New-Item -ItemType Directory -Force .\backups | Out-Null
$marca = Get-Date -Format "yyyyMMdd-HHmmss"
cmd /c "docker compose exec -T postgres pg_dump -U admin -d asistencia -Fc > backups\asistencia-$marca.dump"
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la copia de seguridad." }
```

Guarda una copia adicional fuera del equipo que ejecuta Docker, restringe el
acceso a los respaldos y define una retencion acorde a las necesidades de la
organizacion. No agregues copias de bases reales al repositorio.

## Verificar restauracion sin reemplazar la base activa

Primero crea una base separada para la prueba. El comando falla si ya existe
una base con ese nombre; no la elimines sin confirmar que no contiene datos
necesarios.

```powershell
docker compose exec -T postgres createdb -U admin asistencia_restore
cmd /c "docker compose exec -T postgres pg_restore -U admin -d asistencia_restore --no-owner < backups\asistencia-AAAAMMDD-HHMMSS.dump"
if ($LASTEXITCODE -ne 0) { throw "La restauracion de prueba fallo; revisa la salida de pg_restore." }
docker compose exec -T postgres psql -U admin -d asistencia_restore -c "SELECT COUNT(*) FROM usuarios;"
```

Sustituye el nombre del archivo por el respaldo que quieras verificar.
Comprueba tambien tablas y registros de asistencia antes de considerar valida
la copia. No restaures sobre `asistencia` como prueba: esa es la base activa.

## Pruebas del backend

Desde la carpeta `backend`, ejecuta las pruebas unitarias con el entorno virtual:

```powershell
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```
