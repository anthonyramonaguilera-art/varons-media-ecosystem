import type { RawFeedItem } from "./types";

const STOP_WORDS = new Set([
  // Español
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en", "y", "o", "u",
  "a", "al", "que", "por", "para", "con", "sin", "sobre", "se", "su", "sus", "como", "mas",
  "pero", "este", "esta", "estos", "estas", "lo",
  // Inglés
  "the", "a", "an", "and", "or", "in", "on", "at", "of", "for", "to", "with", "by", "is",
  "it", "as", "be", "this", "that", "these", "those", "from", "are", "was", "were", "into",
]);

/**
 * Normaliza una URL eliminando fragmentos (#...) y parámetros de rastreo publicitario (utm_*, fbclid, etc.).
 */
export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";

  try {
    const url = new URL(rawUrl.trim());

    // Eliminar fragmento (#...)
    url.hash = "";

    // Eliminar parámetros de seguimiento comunes
    const paramsToDelete: string[] = [];
    for (const key of url.searchParams.keys()) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        lower === "fbclid" ||
        lower === "gclid" ||
        lower === "ref" ||
        lower === "ref_src" ||
        lower === "mc_cid" ||
        lower === "mc_eid"
      ) {
        paramsToDelete.push(key);
      }
    }
    for (const p of paramsToDelete) {
      url.searchParams.delete(p);
    }

    // Normalizar barra final si la ruta no es la raíz
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    url.pathname = pathname;

    return url.toString();
  } catch {
    // Si no es URL válida según el constructor, retornar la cadena limpia sin fragmentos
    return rawUrl.split("#")[0].trim();
  }
}

/**
 * Genera el hash criptográfico SHA-256 en formato hexadecimal para una URL normalizada.
 */
export async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Genera la huella digital canónica de un titular:
 * 1. Pasa a minúsculas.
 * 2. Remueve tildes y diacríticos.
 * 3. Reemplaza signos y puntuación por espacios.
 * 4. Filtra palabras vacías (stop words) y palabras de menos de 2 caracteres.
 * 5. Une las primeras 8 palabras clave con guiones (-).
 */
export function generateTitleFingerprint(title: string): string {
  if (!title) return "untitled";

  // Descomponer caracteres con acento y remover marcas de combinación
  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Reemplazar todo lo que no sea letra o número por espacios
  const alphanumericOnly = normalized.replace(/[^a-z0-9]+/g, " ");

  const words = alphanumericOnly
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  const keyWords = words.slice(0, 8);
  if (keyWords.length === 0) {
    const fallback = alphanumericOnly.split(/\s+/).filter(Boolean).slice(0, 5);
    return fallback.join("-") || "untitled";
  }

  return keyWords.join("-");
}

/**
 * Construye el objeto serializado JSON para raw_facts_json con facts esenciales limpios.
 */
export function buildRawFactsJson(item: RawFeedItem, sourceName: string): string {
  const summary = (item.summary || "").slice(0, 280);
  return JSON.stringify({
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAtMs,
    sourceName,
    summary,
  });
}
