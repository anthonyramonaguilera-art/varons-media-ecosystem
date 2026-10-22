CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  rubro TEXT NOT NULL,
  interes TEXT NOT NULL CHECK(interes IN ('POS','WEB','IA','AUDIOVISUAL','RADIO','OTRO')),
  mensaje TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  radar_item_id TEXT,
  status TEXT DEFAULT 'NUEVO'
    CHECK(status IN ('NUEVO','CONTACTADO','COTIZADO','CERRADO','PERDIDO')),
  created_at_ms INTEGER NOT NULL,
  contacted_at_ms INTEGER,
  closed_at_ms INTEGER
);
CREATE INDEX idx_leads_status ON leads(status, created_at_ms DESC);
CREATE INDEX idx_leads_utm ON leads(utm_source, utm_campaign);

CREATE TABLE utm_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK(event_type IN ('PAGE_VIEW','FORM_OPEN','FORM_SUBMIT','WHATSAPP_CLICK')),
  radar_item_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_utm_events_date ON utm_events(created_at_ms DESC);
