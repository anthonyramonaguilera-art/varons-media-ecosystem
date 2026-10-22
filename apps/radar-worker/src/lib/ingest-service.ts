import { fetchFeedWithLimit } from "./stream";
import { parseFeedContent } from "./parser";
import { normalizeUrl, sha256Hex, generateTitleFingerprint, buildRawFactsJson } from "./normalization";
import type {
  Env,
  SourceRecord,
  CandidateItem,
  IngestJobSummary,
  SourceCategory,
} from "./types";

export const MAX_D1_STATEMENTS = 15;
export const MAX_PARAMS_PER_QUERY = 100;
export const MAX_ITEMS_PER_INSERT = 7; // 7 filas * 13 columnas = 91 parámetros (<= 100)
export const DAILY_QUOTA_D1_WRITES = 50000;

/**
 * Rastreador en memoria del presupuesto estricto de sentencias D1 (máximo 15 por ejecución).
 */
export class D1StatementTracker {
  private count = 0;
  private readonly max: number;

  constructor(maxStatements: number = MAX_D1_STATEMENTS) {
    this.max = maxStatements;
  }

  public increment(by: number = 1): void {
    this.count += by;
    if (this.count > this.max) {
      throw new Error("D1_STATEMENT_BUDGET_EXCEEDED");
    }
  }

  public get total(): number {
    return this.count;
  }
}

/**
 * Obtiene la clave de mes (YYYY-MM) y la fecha del día (YYYY-MM-DD).
 */
export function getYearMonthAndDate(date: Date = new Date()): { yearMonth: string; today: string } {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return {
    yearMonth: `${year}-${month}`,
    today: `${year}-${month}-${day}`,
  };
}

export interface IngestRunOptions {
  dryRun?: boolean;
  fetchFn?: typeof fetch;
  customNowMs?: number;
}

/**
 * Ejecutor principal del Job de Ingesta para Cloudflare Workers con presupuesto D1 ultralimitado.
 */
export async function runIngestJob(
  env: Env,
  options: IngestRunOptions = {}
): Promise<IngestJobSummary> {
  const startedAtMs = options.customNowMs ?? Date.now();
  const jobId = crypto.randomUUID();
  const tracker = new D1StatementTracker(MAX_D1_STATEMENTS);
  const { yearMonth, today } = getYearMonthAndDate(new Date(startedAtMs));

  let itemsSeen = 0;
  let itemsNew = 0;
  let rowsWritten = 0;
  let sourcesProcessed = 0;

  try {
    // --------------------------------------------------------------------------
    // SENTENCIA 1: Consultar presupuesto y cortafuegos diario
    // --------------------------------------------------------------------------
    tracker.increment(1);
    const ledgerRow = await env.RADAR_DB.prepare(
      "SELECT year_month, d1_writes_today, d1_writes_date FROM system_budget_ledger WHERE year_month = ?"
    )
      .bind(yearMonth)
      .first<{ year_month: string; d1_writes_today: number; d1_writes_date: string }>();

    // Cortafuegos: Si hoy superamos 50.000 escrituras, abortar corrida inmediatamente
    if (ledgerRow && ledgerRow.d1_writes_date === today && ledgerRow.d1_writes_today >= DAILY_QUOTA_D1_WRITES) {
      tracker.increment(1);
      await env.RADAR_DB.prepare(
        "INSERT INTO job_runs (id, job, started_at_ms, status, items_seen, items_new, d1_statements, rows_written, error) VALUES (?, 'ingest', ?, 'SKIPPED_QUOTA', 0, 0, ?, 0, NULL)"
      )
        .bind(jobId, startedAtMs, tracker.total)
        .run();

      return {
        ok: true,
        jobId,
        status: "SKIPPED_QUOTA",
        sourcesProcessed: 0,
        itemsSeen: 0,
        itemsNew: 0,
        d1Statements: tracker.total,
        rowsWritten: 0,
      };
    }

    // --------------------------------------------------------------------------
    // SENTENCIA 2: Seleccionar hasta 3 fuentes activas más antiguas
    // --------------------------------------------------------------------------
    tracker.increment(1);
    const sourcesResult = await env.RADAR_DB.prepare(
      "SELECT id, name, category, feed_url, feed_type, consecutive_failures, last_fetched_at_ms, is_active FROM sources_registry WHERE is_active = 1 ORDER BY last_fetched_at_ms ASC LIMIT 3"
    ).all<SourceRecord>();

    const sources = sourcesResult.results ?? [];
    if (sources.length === 0) {
      tracker.increment(1);
      await env.RADAR_DB.prepare(
        "INSERT INTO job_runs (id, job, started_at_ms, status, items_seen, items_new, d1_statements, rows_written, error) VALUES (?, 'ingest', ?, 'OK', 0, 0, ?, 0, NULL)"
      )
        .bind(jobId, startedAtMs, tracker.total)
        .run();

      return {
        ok: true,
        jobId,
        status: "OK",
        sourcesProcessed: 0,
        itemsSeen: 0,
        itemsNew: 0,
        d1Statements: tracker.total,
        rowsWritten: 0,
      };
    }

    // --------------------------------------------------------------------------
    // DESCARGA Y PARSEO EN MEMORIA (0 sentencias D1)
    // --------------------------------------------------------------------------
    const sourceUpdates: Array<{
      id: string;
      consecutiveFailures: number;
      isActive: number;
      lastFetchedAtMs: number;
    }> = [];

    const candidates: CandidateItem[] = [];
    const seenHashesInBatch = new Set<string>();
    const seenFpsInBatch = new Set<string>();

    for (const source of sources) {
      sourcesProcessed++;
      const nowMs = Date.now();
      try {
        const fetchResult = await fetchFeedWithLimit(source.feed_url);
        if (fetchResult.status === 200 && fetchResult.text) {
          const feedItems = parseFeedContent(source.feed_type, fetchResult.text, 15);
          itemsSeen += feedItems.length;

          for (const item of feedItems) {
            const normalizedUrl = normalizeUrl(item.url);
            if (!normalizedUrl) continue;

            const urlHash = await sha256Hex(normalizedUrl);
            const titleFingerprint = generateTitleFingerprint(item.title);

            // Deduplicación en memoria dentro del propio lote
            if (seenHashesInBatch.has(urlHash) || seenFpsInBatch.has(titleFingerprint)) {
              continue;
            }
            seenHashesInBatch.add(urlHash);
            seenFpsInBatch.add(titleFingerprint);

            candidates.push({
              id: crypto.randomUUID(),
              sourceId: source.id,
              category: source.category,
              sourceUrl: normalizedUrl,
              urlHash,
              titleFingerprint,
              rawTitle: item.title,
              rawFactsJson: buildRawFactsJson(item, source.name),
              mediaSourceType: "NONE",
              postType: "VIRAL_NATIVE",
              status: "DISCOVERED",
              sourceHttpStatus: 200,
              discoveredAtMs: nowMs,
            });
          }

          sourceUpdates.push({
            id: source.id,
            consecutiveFailures: 0,
            isActive: 1,
            lastFetchedAtMs: nowMs,
          });
        } else {
          // Fallo HTTP
          const nextFailures = source.consecutive_failures + 1;
          sourceUpdates.push({
            id: source.id,
            consecutiveFailures: nextFailures,
            isActive: nextFailures >= 5 ? 0 : 1,
            lastFetchedAtMs: nowMs,
          });
        }
      } catch {
        // Fallo de red / timeout / abort
        const nextFailures = source.consecutive_failures + 1;
        sourceUpdates.push({
          id: source.id,
          consecutiveFailures: nextFailures,
          isActive: nextFailures >= 5 ? 0 : 1,
          lastFetchedAtMs: nowMs,
        });
      }
    }

    // --------------------------------------------------------------------------
    // SENTENCIA 3: Deduplicación contra D1 (1 sola consulta, máx. 90 parámetros <= 100)
    // --------------------------------------------------------------------------
    let itemsToInsert: CandidateItem[] = [];

    if (candidates.length > 0) {
      const hashes = candidates.map((c) => c.urlHash);
      const fingerprints = candidates.map((c) => c.titleFingerprint);

      const hashPlaceholders = hashes.map(() => "?").join(", ");
      const fpPlaceholders = fingerprints.map(() => "?").join(", ");

      tracker.increment(1);
      const query = `SELECT url_hash, title_fingerprint FROM radar_items WHERE url_hash IN (${hashPlaceholders}) OR title_fingerprint IN (${fpPlaceholders})`;
      const existingRecords = await env.RADAR_DB.prepare(query)
        .bind(...hashes, ...fingerprints)
        .all<{ url_hash: string; title_fingerprint: string }>();

      const existingHashes = new Set((existingRecords.results ?? []).map((r) => r.url_hash));
      const existingFps = new Set((existingRecords.results ?? []).map((r) => r.title_fingerprint));

      itemsToInsert = candidates.filter(
        (c) => !existingHashes.has(c.urlHash) && !existingFps.has(c.titleFingerprint)
      );
    }

    itemsNew = itemsToInsert.length;

    // --------------------------------------------------------------------------
    // SENTENCIAS 4..10: Inserción por lotes en radar_items (máx. 7 filas/sentencia = 91 params)
    // --------------------------------------------------------------------------
    for (let i = 0; i < itemsToInsert.length; i += MAX_ITEMS_PER_INSERT) {
      const chunk = itemsToInsert.slice(i, i + MAX_ITEMS_PER_INSERT);
      const valueRows = chunk
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      const insertSql = `INSERT OR IGNORE INTO radar_items (id, source_id, category, post_type, source_url, url_hash, title_fingerprint, raw_title, raw_facts_json, media_source_type, status, source_http_status, discovered_at_ms) VALUES ${valueRows}`;

      const params: unknown[] = [];
      for (const item of chunk) {
        params.push(
          item.id,
          item.sourceId,
          item.category,
          item.postType,
          item.sourceUrl,
          item.urlHash,
          item.titleFingerprint,
          item.rawTitle,
          item.rawFactsJson,
          item.mediaSourceType,
          item.status,
          item.sourceHttpStatus,
          item.discoveredAtMs
        );
      }

      tracker.increment(1);
      const res = await env.RADAR_DB.prepare(insertSql).bind(...params).run();
      const writesInChunk = (res.meta as { rows_written?: number })?.rows_written ?? chunk.length;
      rowsWritten += writesInChunk;
    }

    // --------------------------------------------------------------------------
    // SENTENCIAS 11..13: Actualización individual de fuentes (hasta 3 fuentes)
    // --------------------------------------------------------------------------
    for (const update of sourceUpdates) {
      tracker.increment(1);
      const updateRes = await env.RADAR_DB.prepare(
        "UPDATE sources_registry SET last_fetched_at_ms = ?, consecutive_failures = ?, is_active = ? WHERE id = ?"
      )
        .bind(update.lastFetchedAtMs, update.consecutiveFailures, update.isActive, update.id)
        .run();

      const writes = (updateRes.meta as { rows_written?: number })?.rows_written ?? 1;
      rowsWritten += writes;
    }

    // --------------------------------------------------------------------------
    // SENTENCIA 14: Actualización del presupuesto ledger
    // --------------------------------------------------------------------------
    tracker.increment(1);
    const ledgerUpdateRes = await env.RADAR_DB.prepare(
      `INSERT INTO system_budget_ledger (year_month, d1_writes_today, d1_writes_date, updated_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(year_month) DO UPDATE SET
         d1_writes_today = CASE WHEN d1_writes_date = excluded.d1_writes_date THEN d1_writes_today + excluded.d1_writes_today ELSE excluded.d1_writes_today END,
         d1_writes_date = excluded.d1_writes_date,
         updated_at_ms = excluded.updated_at_ms`
    )
      .bind(yearMonth, rowsWritten, today, Date.now())
      .run();

    rowsWritten += (ledgerUpdateRes.meta as { rows_written?: number })?.rows_written ?? 1;

    // --------------------------------------------------------------------------
    // SENTENCIA 15: Registro de auditoría final en job_runs
    // --------------------------------------------------------------------------
    tracker.increment(1);
    await env.RADAR_DB.prepare(
      "INSERT INTO job_runs (id, job, started_at_ms, status, items_seen, items_new, d1_statements, rows_written, error) VALUES (?, 'ingest', ?, 'OK', ?, ?, ?, ?, NULL)"
    )
      .bind(jobId, startedAtMs, itemsSeen, itemsNew, tracker.total, rowsWritten)
      .run();

    return {
      ok: true,
      jobId,
      status: "OK",
      sourcesProcessed,
      itemsSeen,
      itemsNew,
      d1Statements: tracker.total,
      rowsWritten,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Registro seguro de auditoría FAILED en job_runs sin exceder sentencias adicionales
    try {
      await env.RADAR_DB.prepare(
        "INSERT INTO job_runs (id, job, started_at_ms, status, items_seen, items_new, d1_statements, rows_written, error) VALUES (?, 'ingest', ?, 'FAILED', ?, ?, ?, ?, ?)"
      )
        .bind(jobId, startedAtMs, itemsSeen, itemsNew, tracker.total, rowsWritten, errorMsg)
        .run();
    } catch {
      // Si D1 falla totalmente o el budget se excedió, no emitir más sentencias
    }

    if (errorMsg === "D1_STATEMENT_BUDGET_EXCEEDED") {
      throw err;
    }

    return {
      ok: false,
      jobId,
      status: "FAILED",
      sourcesProcessed,
      itemsSeen,
      itemsNew,
      d1Statements: tracker.total,
      rowsWritten,
      error: errorMsg,
    };
  }
}
