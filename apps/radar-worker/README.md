# Radar Workers (Fase 0)

Módulo de Workers de Cloudflare para el sistema **Radar Varons** de la agencia Varons Media.

## Estructura de Workers

- **`radar-ingest`**: Worker encargado de la ingesta recurrente de fuentes RSS/Atom y HN.
  - Configuración: `wrangler.ingest.jsonc`
  - Cron: `*/30 * * * *` (Modo estrés de Fase 0: 336 muestras en 7 días)
  - Entrada: `src/ingest.ts`
- **`radar-ops`**: Worker de monitoreo, cálculo de métricas vía Cloudflare GraphQL Analytics y reporte diario a Telegram.
  - Configuración: `wrangler.ops.jsonc`
  - Cron: `10 6 * * *` (06:10 UTC diario)
  - Entrada: `src/ops.ts`
- **`src/lib/`**: Lógica pura compartida (autenticación estricta, tipos, etc.).

## Base de Datos (Cloudflare D1)

- **`RADAR_DB`** (`varons_radar_db`): Base de datos de contenido del radar. Enlazada a ambos Workers. Migraciones en `migrations/radar/`.
- **`varons_leads_db`**: Base de datos de leads de clientes. **Por política de seguridad estricta de Fase 0, NO se enlaza a ningún Worker.** Migraciones en `migrations/leads/`.

### Comandos de Migración (Usar Placeholders)

Las migraciones son ejecutadas manualmente por el operador. Nunca expongas UUIDs de producción en documentación pública:

```powershell
# 1. Aplicar migraciones de RADAR_DB (Local para desarrollo/pruebas)
npx wrangler d1 migrations apply varons_radar_db --local --config apps/radar-worker/wrangler.ingest.jsonc

# 2. Aplicar migraciones de RADAR_DB (Remoto en Cloudflare D1)
npx wrangler d1 migrations apply varons_radar_db --remote --config apps/radar-worker/wrangler.ingest.jsonc

# 3. Aplicar migraciones de LEADS_DB (Local)
npx wrangler d1 migrations apply varons_leads_db --local --config apps/radar-worker/wrangler.migrations-leads.jsonc

# 4. Aplicar migraciones de LEADS_DB (Remoto en Cloudflare D1)
npx wrangler d1 migrations apply varons_leads_db --remote --config apps/radar-worker/wrangler.migrations-leads.jsonc
```

> Nota: Las configuraciones `wrangler.*.jsonc` deben contener el `database_id: "<TU_DATABASE_ID>"` correspondiente creado en tu cuenta de Cloudflare.

## Generación de Tipos de Cloudflare Workers

Para generar y actualizar las definiciones de tipos de TypeScript basadas en las configuraciones de Wrangler y los bindings D1, ejecuta:

```powershell
# Para radar-ingest:
npx wrangler types --config apps/radar-worker/wrangler.ingest.jsonc
# o mediante el script npm:
npm run types:ingest

# Para radar-ops:
npx wrangler types --config apps/radar-worker/wrangler.ops.jsonc
# o mediante el script npm:
npm run types:ops
```

Estos comandos utilizan `@cloudflare/workers-types` para generar tipos precisos para los bindings de base de datos (`RADAR_DB`) y variables de entorno.

## Ejecución Manual (Smoke Test)

Ambos Workers exponen un endpoint protegido en `/__run?job=<nombre>`:

- Si el secreto `ADMIN_TOKEN` no está configurado o está vacío, el Worker siempre responde con código `404 Not Found`.
- Para invocar manualmente:
  ```powershell
  curl.exe -H "x-admin-token: TU_ADMIN_TOKEN" "https://TU-WORKER.workers.dev/__run?job=ingest"
  ```
- El token nunca se imprime en los registros de auditoría/logs.
