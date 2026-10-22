import { notFoundResponse, verifyAdminAccess } from "./lib/auth";
import { runIngestJob } from "./lib/ingest-service";
import type { Env, IngestJobSummary } from "./lib/types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const auth = verifyAdminAccess(request, env);
    if (!auth.authorized) {
      return notFoundResponse();
    }

    if (auth.job !== "ingest") {
      return new Response(
        JSON.stringify({ error: `Job '${auth.job}' not recognized for radar-ingest` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ejecución manual autorizada del job de ingesta
    const dryRun = env.DRY_RUN === "true";
    let summary: IngestJobSummary = {
      ok: true,
      jobId: crypto.randomUUID(),
      status: "OK",
      sourcesProcessed: 0,
      itemsSeen: 0,
      itemsNew: 0,
      d1Statements: 0,
      rowsWritten: 0,
    };

    if (env.RADAR_DB && typeof env.RADAR_DB.prepare === "function") {
      summary = await runIngestJob(env, { dryRun });
    }

    const payload = {
      ...summary,
      worker: "radar-ingest",
      job: "ingest",
      dry_run: dryRun,
      timestamp: Date.now(),
    };

    return new Response(JSON.stringify(payload), {
      status: summary.ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Modo estrés Fase 0: Disparado cada 30 minutos (cron: */30 * * * *)
    if (env.RADAR_DB && typeof env.RADAR_DB.prepare === "function") {
      ctx.waitUntil(
        runIngestJob(env, {
          dryRun: env.DRY_RUN === "true",
        })
      );
    }
  },
};
