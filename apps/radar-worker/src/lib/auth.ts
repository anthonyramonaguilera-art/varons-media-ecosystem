import type { Env } from "./types";

/**
 * Valida la autenticación para endpoints administrativos manuales (/__run).
 * Reglas de seguridad estrictas:
 * 1. Si ADMIN_TOKEN no está definido o está vacío, retorna 404 siempre.
 * 2. Compara estrictamente el header x-admin-token con el secreto.
 * 3. NUNCA registra en logs el token recibido ni el esperado.
 */
export function verifyAdminAccess(request: Request, env: Env): { authorized: boolean; job: string | null } {
  const url = new URL(request.url);

  if (url.pathname !== "/__run") {
    return { authorized: false, job: null };
  }

  const secret = env.ADMIN_TOKEN;
  if (!secret || typeof secret !== "string" || secret.trim() === "") {
    return { authorized: false, job: null };
  }

  const clientToken = request.headers.get("x-admin-token");
  if (!clientToken || clientToken !== secret) {
    return { authorized: false, job: null };
  }

  const job = url.searchParams.get("job");
  return { authorized: true, job };
}

export function notFoundResponse(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
