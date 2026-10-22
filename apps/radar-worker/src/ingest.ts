import { notFoundResponse, verifyAdminAccess } from "./lib/auth";
import type { Env } from "./lib/types";

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
    return new Response(
      JSON.stringify({
        ok: true,
        worker: "radar-ingest",
        job: "ingest",
        dry_run: dryRun,
        timestamp: Date.now(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Modo estrés Fase 0: Disparado cada 30 minutos (cron: */30 * * * *)
    console.log(
      JSON.stringify({
        event: "scheduled_trigger",
        worker: "radar-ingest",
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
      })
    );
  },
};
