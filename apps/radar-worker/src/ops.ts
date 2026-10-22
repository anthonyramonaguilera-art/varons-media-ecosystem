import { notFoundResponse, verifyAdminAccess } from "./lib/auth";
import type { Env } from "./lib/types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const auth = verifyAdminAccess(request, env);
    if (!auth.authorized) {
      return notFoundResponse();
    }

    if (auth.job !== "ops") {
      return new Response(
        JSON.stringify({ error: `Job '${auth.job}' not recognized for radar-ops` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ejecución manual autorizada del job de operaciones y monitoreo
    const dryRun = env.DRY_RUN === "true";
    return new Response(
      JSON.stringify({
        ok: true,
        worker: "radar-ops",
        job: "ops",
        dry_run: dryRun,
        timestamp: Date.now(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Disparado una vez al día a las 06:10 UTC (cron: 10 6 * * *)
    console.log(
      JSON.stringify({
        event: "scheduled_trigger",
        worker: "radar-ops",
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
      })
    );
  },
};
