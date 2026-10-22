export const MAX_FEED_BYTES = 300 * 1024; // 307,200 bytes
export const DEFAULT_TIMEOUT_MS = 5000; // 5 segundos
export const RADAR_USER_AGENT = "VaronsMediaRadar/4.2 (+https://varonsmedia.com)";

export interface StreamReadResult {
  text: string;
  totalBytes: number;
  truncated: boolean;
}

/**
 * Lee un ReadableStream de bytes hasta un límite estricto en memoria.
 * Si el flujo supera limitBytes, lo trunca exactamente en limitBytes y cancela el reader.
 */
export async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number = MAX_FEED_BYTES
): Promise<StreamReadResult> {
  const reader = stream.getReader();
  let totalBytes = 0;
  let truncated = false;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        if (totalBytes + value.byteLength >= limitBytes) {
          const needed = limitBytes - totalBytes;
          if (needed > 0) {
            chunks.push(value.subarray(0, needed));
            totalBytes += needed;
          }
          truncated = true;
          try {
            await reader.cancel();
          } catch {
            // Ignorar errores al cancelar un stream cortado
          }
          break;
        } else {
          chunks.push(value);
          totalBytes += value.byteLength;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenar todos los chunks en un único Uint8Array contiguo
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(combined);
  return { text, totalBytes, truncated };
}

/**
 * Descarga una fuente remota con timeout de 5s, User-Agent corporativo y límite estricto de 300 KB.
 */
export async function fetchFeedWithLimit(
  url: string,
  limitBytes: number = MAX_FEED_BYTES,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ status: number; text: string; totalBytes: number; truncated: boolean }> {
  const signal = AbortSignal.timeout(timeoutMs);

  const response = await fetch(url, {
    signal,
    headers: {
      "User-Agent": RADAR_USER_AGENT,
      "Accept": "application/rss+xml, application/atom+xml, application/xml, application/json, text/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    return {
      status: response.status,
      text: "",
      totalBytes: 0,
      truncated: false,
    };
  }

  if (!response.body) {
    return {
      status: response.status,
      text: "",
      totalBytes: 0,
      truncated: false,
    };
  }

  const streamResult = await readStreamWithLimit(response.body, limitBytes);
  return {
    status: response.status,
    ...streamResult,
  };
}
