export interface Env {
  RADAR_DB: D1Database;
  DRY_RUN: string;
  ADMIN_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  ADMIN_CONTROL_CHAT_ID?: string;
}
