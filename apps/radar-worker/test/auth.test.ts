import { describe, expect, it } from "vitest";
import { notFoundResponse, verifyAdminAccess } from "../src/lib/auth";
import ingestWorker from "../src/ingest";
import opsWorker from "../src/ops";
import type { Env } from "../src/lib/types";

describe("Seguridad del endpoint /__run", () => {
  const dummyEnv: Env = {
    RADAR_DB: {} as unknown as D1Database,
    DRY_RUN: "true",
    ADMIN_TOKEN: "super-secret-token-123",
  };

  it("responde 404 si la ruta no es /__run", () => {
    const req = new Request("https://worker.dev/test", {
      headers: { "x-admin-token": "super-secret-token-123" },
    });
    const result = verifyAdminAccess(req, dummyEnv);
    expect(result.authorized).toBe(false);
  });

  it("responde 404 si ADMIN_TOKEN no está definido en el entorno", () => {
    const req = new Request("https://worker.dev/__run?job=ingest", {
      headers: { "x-admin-token": "super-secret-token-123" },
    });
    const result = verifyAdminAccess(req, { ...dummyEnv, ADMIN_TOKEN: undefined });
    expect(result.authorized).toBe(false);
  });

  it("responde 404 si ADMIN_TOKEN es una cadena vacía", () => {
    const req = new Request("https://worker.dev/__run?job=ingest", {
      headers: { "x-admin-token": "super-secret-token-123" },
    });
    const result = verifyAdminAccess(req, { ...dummyEnv, ADMIN_TOKEN: "   " });
    expect(result.authorized).toBe(false);
  });

  it("responde 404 si el header x-admin-token está ausente", () => {
    const req = new Request("https://worker.dev/__run?job=ingest");
    const result = verifyAdminAccess(req, dummyEnv);
    expect(result.authorized).toBe(false);
  });

  it("responde 404 si el header x-admin-token no coincide exactamente", () => {
    const req = new Request("https://worker.dev/__run?job=ingest", {
      headers: { "x-admin-token": "wrong-token" },
    });
    const result = verifyAdminAccess(req, dummyEnv);
    expect(result.authorized).toBe(false);
  });

  it("autoriza la petición y extrae el job si el token es correcto", () => {
    const req = new Request("https://worker.dev/__run?job=ingest", {
      headers: { "x-admin-token": "super-secret-token-123" },
    });
    const result = verifyAdminAccess(req, dummyEnv);
    expect(result.authorized).toBe(true);
    expect(result.job).toBe("ingest");
  });

  it("radar-ingest: responde 404 ante petición no autorizada", async () => {
    const req = new Request("https://worker.dev/__run?job=ingest");
    const res = await ingestWorker.fetch(req, dummyEnv, {} as ExecutionContext);
    expect(res.status).toBe(404);
  });

  it("radar-ingest: responde 200 y ejecuta el job con credencial válida", async () => {
    const req = new Request("https://worker.dev/__run?job=ingest", {
      headers: { "x-admin-token": "super-secret-token-123" },
    });
    const res = await ingestWorker.fetch(req, dummyEnv, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; worker: string; job: string; dry_run: boolean };
    expect(body.ok).toBe(true);
    expect(body.worker).toBe("radar-ingest");
    expect(body.job).toBe("ingest");
    expect(body.dry_run).toBe(true);
  });

  it("radar-ops: responde 200 y ejecuta el job con credencial válida", async () => {
    const req = new Request("https://worker.dev/__run?job=ops", {
      headers: { "x-admin-token": "super-secret-token-123" },
    });
    const res = await opsWorker.fetch(req, dummyEnv, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; worker: string; job: string; dry_run: boolean };
    expect(body.ok).toBe(true);
    expect(body.worker).toBe("radar-ops");
    expect(body.job).toBe("ops");
  });

  it("responde 400 si el job no corresponde al Worker respectivo", async () => {
    const req = new Request("https://worker.dev/__run?job=ops", {
      headers: { "x-admin-token": "super-secret-token-123" },
    });
    const res = await ingestWorker.fetch(req, dummyEnv, {} as ExecutionContext);
    expect(res.status).toBe(400);
  });
});
