import type { RawFeedItem } from "./types";

/**
 * Desenvuelve bloques CDATA (<![CDATA[ ... ]]>) de cadenas XML.
 */
export function unwrapCdata(text: string): string {
  if (!text) return "";
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
}

/**
 * Elimina cualquier etiqueta HTML/XML (<...>) conservando el texto interno.
 */
export function stripHtmlTags(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]+>/g, " ");
}

/**
 * Decodifica entidades HTML habituales tanto nombradas como numéricas/hex.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => {
      const num = parseInt(code, 10);
      return !isNaN(num) ? String.fromCharCode(num) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const num = parseInt(hex, 16);
      return !isNaN(num) ? String.fromCharCode(num) : "";
    });
}

/**
 * Limpia texto completo: desenvuelve CDATA, remueve HTML, decodifica entidades y colapsa espacios.
 */
export function cleanText(text: string): string {
  if (!text) return "";
  const unwrapped = unwrapCdata(text);
  const stripped = stripHtmlTags(unwrapped);
  const decoded = decodeHtmlEntities(stripped);
  return decoded.replace(/\s+/g, " ").trim();
}

/**
 * Extrae el valor textual de una etiqueta simple XML dentro de un fragmento.
 */
function extractTagContent(block: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(regex);
  return match ? match[1] : null;
}

/**
 * Extrae la URL de un elemento RSS (<link>...</link>) o Atom (<link href="..."/>),
 * priorizando links con rel="alternate" si existen varios.
 */
function extractLinkFromBlock(block: string): string | null {
  // 1. Caso Atom: Buscar etiquetas <link ...>
  const linkMatches = [...block.matchAll(/<link([^>]+?)(?:\/?>|>[\s\S]*?<\/link>)/gi)];
  if (linkMatches.length > 0) {
    let alternateHref: string | null = null;
    let anyHref: string | null = null;

    for (const match of linkMatches) {
      const attributes = match[1];
      const hrefMatch = attributes.match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        const href = hrefMatch[1].trim();
        const isAlternate = /rel=["']alternate["']/i.test(attributes);
        if (isAlternate && !alternateHref) {
          alternateHref = href;
        }
        if (!anyHref) {
          anyHref = href;
        }
      }
    }

    if (alternateHref) return alternateHref;
    if (anyHref) return anyHref;
  }

  // 2. Caso RSS estándar: <link>https://...</link>
  const directLink = extractTagContent(block, "link");
  if (directLink) {
    const cleaned = cleanText(directLink);
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      return cleaned;
    }
  }

  return null;
}

/**
 * Parsea un documento RSS 2.0 o Atom sin librerías DOM, extrayendo hasta maxItems (15).
 */
export function parseRssLight(content: string, maxItems: number = 15): RawFeedItem[] {
  if (!content) return [];

  // Detectar bloques <item> (RSS 2.0) o <entry> (Atom)
  const isAtom = /<feed[\s>]/i.test(content) || /<entry[\s>]/i.test(content);
  const itemRegex = isAtom
    ? /<entry[\s\S]*?<\/entry>/gi
    : /<item[\s\S]*?<\/item>/gi;

  const matches = [...content.matchAll(itemRegex)].slice(0, maxItems);
  const items: RawFeedItem[] = [];

  for (const match of matches) {
    const block = match[0];

    // Título
    const rawTitle = extractTagContent(block, "title") || "";
    const title = cleanText(rawTitle);

    // URL
    const url = extractLinkFromBlock(block) || "";

    // Fecha
    const rawDate =
      extractTagContent(block, "pubDate") ||
      extractTagContent(block, "published") ||
      extractTagContent(block, "updated") ||
      extractTagContent(block, "dc:date") ||
      "";
    let publishedAtMs = Date.now();
    if (rawDate) {
      const parsedTime = new Date(rawDate.trim()).getTime();
      if (!isNaN(parsedTime) && parsedTime > 0) {
        publishedAtMs = parsedTime;
      }
    }

    // Resumen / Descripción
    const rawSummary =
      extractTagContent(block, "description") ||
      extractTagContent(block, "summary") ||
      extractTagContent(block, "content:encoded") ||
      extractTagContent(block, "content") ||
      "";
    const summary = cleanText(rawSummary).slice(0, 280);

    if (title && url) {
      items.push({
        title,
        url,
        publishedAtMs,
        summary: summary || title.slice(0, 280),
      });
    }
  }

  return items;
}

/**
 * Parsea la respuesta JSON de Hacker News (endpoint de Algolia search?tags=front_page).
 */
export function parseHnJson(content: string, maxItems: number = 15): RawFeedItem[] {
  if (!content) return [];

  try {
    const data = JSON.parse(content) as {
      hits?: Array<{
        title?: string;
        story_title?: string;
        url?: string;
        objectID?: string;
        created_at?: string;
        story_text?: string;
      }>;
    };

    if (!data.hits || !Array.isArray(data.hits)) {
      return [];
    }

    const hits = data.hits.slice(0, maxItems);
    const items: RawFeedItem[] = [];

    for (const hit of hits) {
      const title = cleanText(hit.title || hit.story_title || "");
      if (!title) continue;

      let url = hit.url && typeof hit.url === "string" ? hit.url.trim() : "";
      if (!url && hit.objectID) {
        url = `https://news.ycombinator.com/item?id=${hit.objectID}`;
      }

      let publishedAtMs = Date.now();
      if (hit.created_at) {
        const parsedTime = new Date(hit.created_at).getTime();
        if (!isNaN(parsedTime) && parsedTime > 0) {
          publishedAtMs = parsedTime;
        }
      }

      const summary = (hit.story_text ? cleanText(hit.story_text) : title).slice(0, 280);

      if (url) {
        items.push({
          title,
          url,
          publishedAtMs,
          summary: summary || title.slice(0, 280),
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Enrutador principal de parseo según feed_type.
 */
export function parseFeedContent(feedType: string, content: string, maxItems: number = 15): RawFeedItem[] {
  if (feedType === "HN_JSON") {
    return parseHnJson(content, maxItems);
  }
  return parseRssLight(content, maxItems);
}
