-- ============================================================================
-- RADAR VARONS - Semilla Inicial de Fuentes Oficiales (Fase 0)
-- 12 fuentes balanceadas en 4 lotes de 3 fuentes intercaladas (máx ~306 KB/lote)
-- Valores iniciales de last_fetched_at_ms (1 a 12) para rotación determinista
-- ============================================================================

-- LOTE 1 (Carga combinada estimada: ~184 KB)
INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_IA_SIMONW', 'Simon Willison AI Weblog', 'IA', 'https://simonwillison.net/atom/everything/', 'RSS_LIGHT', 1, 0, 1);

INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_GAME_POLYGON', 'Polygon', 'GAMING', 'https://www.polygon.com/rss/index.xml', 'RSS_LIGHT', 2, 0, 1);

INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_CREATOR_VERGE', 'The Verge Creators', 'CREATORS', 'https://www.theverge.com/rss/creators/index.xml', 'RSS_LIGHT', 3, 0, 1);

-- LOTE 2 (Carga combinada estimada: ~306 KB)
INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_TECH_TECHCRUNCH', 'TechCrunch', 'TECH_BIZ', 'https://techcrunch.com/feed/', 'RSS_LIGHT', 4, 0, 1);

INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_IA_MIT_TECH', 'MIT Tech Review AI', 'IA', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 'RSS_LIGHT', 5, 0, 1);

INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_GAME_EUROGAMER', 'Eurogamer', 'GAMING', 'https://www.eurogamer.net/feed', 'RSS_LIGHT', 6, 0, 1);

-- LOTE 3 (Carga combinada estimada: ~228 KB)
INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_CREATOR_TUBEFILTER', 'Tubefilter', 'CREATORS', 'https://www.tubefilter.com/feed/', 'RSS_LIGHT', 7, 0, 1);

INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_TECH_ARSTECHNICA', 'Ars Technica', 'TECH_BIZ', 'https://feeds.arstechnica.com/arstechnica/index', 'RSS_LIGHT', 8, 0, 1);

INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_IA_DEEPMIND', 'Google DeepMind', 'IA', 'https://deepmind.google/blog/rss.xml', 'RSS_LIGHT', 9, 0, 1);

-- LOTE 4 (Carga combinada estimada: ~255 KB)
INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_GAME_RPS', 'Rock Paper Shotgun', 'GAMING', 'https://www.rockpapershotgun.com/feed', 'RSS_LIGHT', 10, 0, 1);

INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_CREATOR_SMT', 'Social Media Today', 'CREATORS', 'https://www.socialmediatoday.com/feeds/news/', 'RSS_LIGHT', 11, 0, 1);

INSERT OR REPLACE INTO sources_registry (id, name, category, feed_url, feed_type, last_fetched_at_ms, consecutive_failures, is_active)
VALUES ('SRC_HN_ALGOLIA', 'Hacker News Frontpage', 'TECH_BIZ', 'https://hn.algolia.com/api/v1/search?tags=front_page', 'HN_JSON', 12, 0, 1);

-- ============================================================================
-- FUENTES DE RESERVA VALIDADAS EN VIVO (HTTP 200 OK)
-- Disponibles como reemplazo inmediato si alguna fuente principal presenta fallas
-- ============================================================================
-- RESERVA 1 (IA): 'SRC_IA_OPENAI', 'OpenAI News', 'IA', 'https://openai.com/news/rss.xml', 'RSS_LIGHT'
-- RESERVA 2 (IA): 'SRC_IA_MARKTECH', 'MarkTechPost AI', 'IA', 'https://www.marktechpost.com/feed/', 'RSS_LIGHT'
-- RESERVA 3 (CREATORS): 'SRC_CREATOR_DIGIDAY', 'Digiday', 'CREATORS', 'https://digiday.com/feed/', 'RSS_LIGHT'
-- RESERVA 4 (TECH_BIZ): 'SRC_TECH_THEVERGE', 'The Verge', 'TECH_BIZ', 'https://www.theverge.com/rss/index.xml', 'RSS_LIGHT'
-- RESERVA 5 (TECH_BIZ): 'SRC_TECH_WIRED', 'Wired Business', 'TECH_BIZ', 'https://www.wired.com/feed/category/business/latest/rss', 'RSS_LIGHT'
