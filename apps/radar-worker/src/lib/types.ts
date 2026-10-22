export interface Env {
  RADAR_DB: D1Database;
  DRY_RUN: string;
  ADMIN_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  ADMIN_CONTROL_CHAT_ID?: string;
}

export type SourceCategory = "IA" | "GAMING" | "CREATORS" | "TECH_BIZ";
export type SourceFeedType = "RSS_LIGHT" | "REDDIT_JSON" | "HN_JSON";

export interface SourceRecord {
  id: string;
  name: string;
  category: SourceCategory;
  feed_url: string;
  feed_type: SourceFeedType;
  last_fetched_at_ms: number;
  consecutive_failures: number;
  is_active: number;
}

export interface RawFeedItem {
  title: string;
  url: string;
  publishedAtMs: number;
  summary: string;
}

export interface CandidateItem {
  id: string;
  sourceId: string;
  category: SourceCategory;
  sourceUrl: string;
  urlHash: string;
  titleFingerprint: string;
  rawTitle: string;
  rawFactsJson: string;
  mediaSourceType: "NONE";
  postType: "VIRAL_NATIVE";
  status: "DISCOVERED";
  sourceHttpStatus: number;
  discoveredAtMs: number;
}

export interface IngestJobSummary {
  ok: boolean;
  jobId: string;
  status: "OK" | "SKIPPED_QUOTA" | "FAILED";
  sourcesProcessed: number;
  itemsSeen: number;
  itemsNew: number;
  d1Statements: number;
  rowsWritten: number;
  error?: string;
}
