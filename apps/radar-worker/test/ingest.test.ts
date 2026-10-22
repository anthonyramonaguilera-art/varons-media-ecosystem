import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readStreamWithLimit } from "../src/lib/stream";
import { parseRssLight, parseHnJson, cleanText } from "../src/lib/parser";
import {
  normalizeUrl,
  generateTitleFingerprint,
  sha256Hex,
} from "../src/lib/normalization";
import {
  runIngestJob,
  D1StatementTracker,
  getYearMonthAndDate,
} from "../src/lib/ingest-service";
import type { Env, SourceRecord } from "../src/lib/types";

interface ExecutedStatement {
  sql: string;
  params: unknown[];
}

function createMockD1(config: {
  ledgerRow?: { year_month: string; d1_writes_today: number; d1_writes_date: string } | null;
  sources?: SourceRecord[];
  existingItems?: Array<{ url_hash: string; title_fingerprint: string }>;
}) {
  const executed: ExecutedStatement[] = [];

  const db = {
    prepare(sql: string) {
      let boundParams: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          boundParams = params;
          return stmt;
        },
        async first<T = unknown>() {
          executed.push({ sql, params: boundParams });
          if (sql.includes("system_budget_ledger") && sql.startsWith("SELECT")) {
            return (config.ledgerRow ?? null) as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          executed.push({ sql, params: boundParams });
          if (sql.includes("sources_registry") && sql.startsWith("SELECT")) {
            return { results: (config.sources ?? []) as T[], meta: {} };
          }
          if (sql.includes("radar_items") && sql.startsWith("SELECT")) {
            return { results: (config.existingItems ?? []) as T[], meta: {} };
          }
          return { results: [] as T[], meta: {} };
        },
        async run() {
          executed.push({ sql, params: boundParams });
          return { success: true, meta: { rows_written: 1 } };
        },
      };
      return stmt;
    },
  };

  return { db: db as unknown as D1Database, executed };
}

describe("Worker de Ingesta (Fase 0)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Cortador de stream de 300 KB
  // --------------------------------------------------------------------------
  describe("Cortador de stream de 300 KB", () => {
    it("aborta exactamente en 300 * 1024 bytes (307.200 bytes) y el XML parseado contiene <= 15 ítems", async () => {
      const targetLimit = 300 * 1024; // 307200 bytes
      const totalPayloadSize = 500 * 1024; // 500 KB simulados

      // Generar XML con 25 ítems y relleno para superar los 500 KB
      let itemsXml = "";
      for (let i = 1; i <= 25; i++) {
        itemsXml += `
        <item>
          <title>Noticia de Prueba ${i}</title>
          <link>https://example.com/noticia-${i}</link>
          <pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate>
          <description>Descripcion de prueba con relleno ${"X".repeat(25000)}</description>
        </item>`;
      }
      const fullXml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Feed Gigante</title>${itemsXml}</channel></rss>`;
      const encoder = new TextEncoder();
      const encodedFull = encoder.encode(fullXml);
      expect(encodedFull.byteLength).toBeGreaterThan(totalPayloadSize);

      // Simular ReadableStream en chunks de 16 KB
      let offset = 0;
      const chunkSize = 16 * 1024;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= encodedFull.byteLength) {
            controller.close();
            return;
          }
          const chunk = encodedFull.subarray(offset, offset + chunkSize);
          offset += chunk.byteLength;
          controller.enqueue(chunk);
        },
      });

      const result = await readStreamWithLimit(stream, targetLimit);

      // Debe cortar exactamente en 307.200 bytes (ni 299 KB ni 301 KB)
      expect(result.totalBytes).toBe(targetLimit);
      expect(result.truncated).toBe(true);

      // El parser debe extraer como máximo 15 ítems incluso con el XML truncado
      const parsedItems = parseRssLight(result.text, 15);
      expect(parsedItems.length).toBeGreaterThan(0);
      expect(parsedItems.length).toBeLessThanOrEqual(15);
      expect(parsedItems[0].title).toBe("Noticia de Prueba 1");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Parseo ultraligero (RSS 2.0, Atom, HN_JSON)
  // --------------------------------------------------------------------------
  describe("Parsers ultraligeros en memoria", () => {
    it("parsea RSS 2.0 con CDATA, HTML anidado y entidades complejas", () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title><![CDATA[Nvidia &amp; OpenAI: &#8220;Alianza hist&#243;rica&#8221; &lt;IA&gt;]]></title>
              <link>https://noticias.com/nvidia-openai?utm_source=rss</link>
              <pubDate>Wed, 21 Oct 2026 12:00:00 GMT</pubDate>
              <description><![CDATA[<p>Texto con <b>etiquetas</b> y &#8217;comillas&#8217;.</p>]]></description>
            </item>
          </channel>
        </rss>
      `;
      const items = parseRssLight(xml, 15);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Nvidia & OpenAI: “Alianza histórica” <IA>');
      expect(items[0].url).toBe("https://noticias.com/nvidia-openai?utm_source=rss");
      expect(items[0].summary).toBe("Texto con etiquetas y ’comillas’.");
    });

    it("parsea Atom con <link rel=\"alternate\" href=\"...\"/> y <summary>", () => {
      const atomXml = `
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Simon Willison: Nuevos LLMs en Cloudflare</title>
            <link rel="self" href="https://simonwillison.net/atom/self" />
            <link rel="alternate" href="https://simonwillison.net/2026/cloudflare-llm/" />
            <updated>2026-10-22T08:30:00Z</updated>
            <summary>Detalles de modelos corriendo en el edge.</summary>
          </entry>
        </feed>
      `;
      const items = parseRssLight(atomXml, 15);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Simon Willison: Nuevos LLMs en Cloudflare");
      expect(items[0].url).toBe("https://simonwillison.net/2026/cloudflare-llm/");
      expect(items[0].summary).toBe("Detalles de modelos corriendo en el edge.");
    });

    it("parsea HN_JSON con url externa y fallback a item de Hacker News", () => {
      const hnJson = JSON.stringify({
        hits: [
          {
            title: "Show HN: Radar en Cloudflare",
            url: "https://github.com/varons/radar",
            objectID: "40001",
            created_at: "2026-10-22T09:00:00Z",
          },
          {
            title: "Ask HN: Como optimizar CPU en Workers?",
            url: "",
            objectID: "40002",
            created_at: "2026-10-22T09:10:00Z",
          },
        ],
      });
      const items = parseHnJson(hnJson, 15);
      expect(items).toHaveLength(2);
      expect(items[0].url).toBe("https://github.com/varons/radar");
      expect(items[1].url).toBe("https://news.ycombinator.com/item?id=40002");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Normalización y huella de títulos
  // --------------------------------------------------------------------------
  describe("Normalización y Huellas Digitales", () => {
    it("elimina utm_*, fbclid, gclid, ref y hash (#...)", () => {
      const raw = "https://techcrunch.com/articulo/?utm_source=twitter&utm_medium=cpc&fbclid=12345&gclid=6789&ref=news#seccion-2";
      const normalized = normalizeUrl(raw);
      expect(normalized).toBe("https://techcrunch.com/articulo");
    });

    it("titulares casi idénticos producen el mismo title_fingerprint", () => {
      const t1 = "¡OpenAI lanza GPT-5 con nuevas capacidades para desarrolladores!";
      const t2 = "OpenAI lanza GPT 5 con nuevas capacidades para desarrolladores";
      const fp1 = generateTitleFingerprint(t1);
      const fp2 = generateTitleFingerprint(t2);

      expect(fp1).toBe(fp2);
      expect(fp1).toBe("openai-lanza-gpt-nuevas-capacidades-desarrolladores");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Quota diaria excedida (Cortafuegos antes de llamar a fetch)
  // --------------------------------------------------------------------------
  describe("Cortafuegos de Quota Diaria (50.000 escrituras D1)", () => {
    it("aborta la corrida sin llamar a fetch cuando d1_writes_today >= 50.000", async () => {
      const { today, yearMonth } = getYearMonthAndDate();
      const mock = createMockD1({
        ledgerRow: {
          year_month: yearMonth,
          d1_writes_today: 50000,
          d1_writes_date: today,
        },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const env: Env = {
        RADAR_DB: mock.db,
        DRY_RUN: "true",
      };

      const result = await runIngestJob(env);

      expect(result.status).toBe("SKIPPED_QUOTA");
      expect(result.ok).toBe(true);
      expect(result.sourcesProcessed).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled(); // 0 llamadas a fetch

      // Total de sentencias D1 = 2 (1 select ledger + 1 insert job_runs)
      expect(result.d1Statements).toBe(2);
      expect(mock.executed).toHaveLength(2);
      expect(mock.executed[0].sql).toContain("system_budget_ledger");
      expect(mock.executed[1].sql).toContain("job_runs");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Desactivación de fuente por 5 fallos consecutivos
  // --------------------------------------------------------------------------
  describe("Desactivación automática de fuentes", () => {
    it("pasa is_active a 0 y consecutive_failures a 5 si la fuente falla 5 veces", async () => {
      const { today, yearMonth } = getYearMonthAndDate();
      const sourceFailing: SourceRecord = {
        id: "SRC_TEST_FAIL",
        name: "Fuente Inestable",
        category: "TECH_BIZ",
        feed_url: "https://broken-source.test/feed",
        feed_type: "RSS_LIGHT",
        last_fetched_at_ms: 100,
        consecutive_failures: 4, // Ya falló 4 veces
        is_active: 1,
      };

      const mock = createMockD1({
        ledgerRow: { year_month: yearMonth, d1_writes_today: 0, d1_writes_date: today },
        sources: [sourceFailing],
      });

      // Simular fallo HTTP 500 en fetch
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        body: null,
      } as unknown as Response);

      const env: Env = {
        RADAR_DB: mock.db,
        DRY_RUN: "true",
      };

      const result = await runIngestJob(env);
      expect(result.ok).toBe(true);
      expect(result.sourcesProcessed).toBe(1);

      // Verificar que el UPDATE a sources_registry puso consecutive_failures = 5 y is_active = 0
      const updateStmt = mock.executed.find((e) =>
        e.sql.includes("UPDATE sources_registry")
      );
      expect(updateStmt).toBeDefined();
      // UPDATE sources_registry SET last_fetched_at_ms = ?, consecutive_failures = ?, is_active = ? WHERE id = ?
      expect(updateStmt?.params[1]).toBe(5); // consecutive_failures = 5
      expect(updateStmt?.params[2]).toBe(0); // is_active = 0
      expect(updateStmt?.params[3]).toBe("SRC_TEST_FAIL");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Presupuesto estricto D1 (45 ítems nuevos, d1Statements <= 15)
  // --------------------------------------------------------------------------
  describe("Presupuesto D1 y Lotes de Parámetros", () => {
    it("procesa 45 ítems nuevos consumiendo exactamente <= 15 sentencias D1 sin superar 100 parámetros por query", async () => {
      const { today, yearMonth } = getYearMonthAndDate();

      const sources: SourceRecord[] = [
        {
          id: "SRC_1",
          name: "Fuente 1",
          category: "IA",
          feed_url: "https://src1.test/rss",
          feed_type: "RSS_LIGHT",
          last_fetched_at_ms: 1,
          consecutive_failures: 0,
          is_active: 1,
        },
        {
          id: "SRC_2",
          name: "Fuente 2",
          category: "GAMING",
          feed_url: "https://src2.test/rss",
          feed_type: "RSS_LIGHT",
          last_fetched_at_ms: 2,
          consecutive_failures: 0,
          is_active: 1,
        },
        {
          id: "SRC_3",
          name: "Fuente 3",
          category: "CREATORS",
          feed_url: "https://src3.test/rss",
          feed_type: "RSS_LIGHT",
          last_fetched_at_ms: 3,
          consecutive_failures: 0,
          is_active: 1,
        },
      ];

      const mock = createMockD1({
        ledgerRow: { year_month: yearMonth, d1_writes_today: 100, d1_writes_date: today },
        sources,
        existingItems: [], // 0 ítems preexistentes en D1: todos los 45 son nuevos
      });

      // Simular respuestas de 15 ítems para cada una de las 3 fuentes (45 ítems únicos)
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        let itemsXml = "";
        const prefix = urlStr.includes("src1") ? "S1" : urlStr.includes("src2") ? "S2" : "S3";
        for (let i = 1; i <= 15; i++) {
          const numStr = String(i).padStart(2, "0");
          itemsXml += `
            <item>
              <title>${prefix} Noticia Titular Unico ${numStr}</title>
              <link>https://${prefix.toLowerCase()}.test/item-${numStr}</link>
              <pubDate>Thu, 22 Oct 2026 12:00:00 GMT</pubDate>
              <description>Resumen breve de noticia ${numStr}</description>
            </item>
          `;
        }
        const xml = `<rss><channel>${itemsXml}</channel></rss>`;
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(xml));
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
        } as unknown as Response);
      });

      const env: Env = {
        RADAR_DB: mock.db,
        DRY_RUN: "true",
      };

      const result = await runIngestJob(env);

      expect(result.ok).toBe(true);
      expect(result.sourcesProcessed).toBe(3);
      expect(result.itemsSeen).toBe(45);
      expect(result.itemsNew).toBe(45);

      // Desglose exacto esperado:
      // 1. SELECT system_budget_ledger
      // 2. SELECT sources_registry (3 fuentes)
      // 3. SELECT url_hash, title_fingerprint FROM radar_items (Deduplicación)
      // 4..10. 7 sentencias INSERT OR IGNORE INTO radar_items (45 / 7 = 6 lotes de 7 + 1 lote de 3)
      // 11..13. 3 sentencias UPDATE sources_registry (1 por fuente)
      // 14. 1 sentencia INSERT/UPDATE system_budget_ledger
      // 15. 1 sentencia INSERT job_runs
      // Total: 15 sentencias exactas
      expect(result.d1Statements).toBe(15);
      expect(result.d1Statements).toBeLessThanOrEqual(15);
      expect(mock.executed).toHaveLength(15);

      // Verificar que NINGUNA sentencia superó los 100 parámetros ligados
      for (const stmt of mock.executed) {
        expect(stmt.params.length).toBeLessThanOrEqual(100);
      }

      // Validar la deduplicación (parámetros <= 90)
      const dedupStmt = mock.executed.find((e) => e.sql.includes("FROM radar_items WHERE url_hash IN"));
      expect(dedupStmt).toBeDefined();
      expect(dedupStmt?.params.length).toBe(90); // 45 hashes + 45 fingerprints
      expect(dedupStmt?.params.length).toBeLessThanOrEqual(100);

      // Validar los inserts por lote (máx. 91 parámetros: 7 filas * 13 columnas)
      const insertStmts = mock.executed.filter((e) => e.sql.includes("INSERT OR IGNORE INTO radar_items"));
      expect(insertStmts).toHaveLength(7);
      expect(insertStmts[0].params.length).toBe(91); // 7 * 13 = 91
      expect(insertStmts[6].params.length).toBe(39); // 3 * 13 = 39
    });

    it("lanza Error D1_STATEMENT_BUDGET_EXCEEDED si el tracker supera 15 sentencias", () => {
      const tracker = new D1StatementTracker(15);
      tracker.increment(15);
      expect(tracker.total).toBe(15);

      expect(() => {
        tracker.increment(1);
      }).toThrowError("D1_STATEMENT_BUDGET_EXCEEDED");
    });
  });
});
