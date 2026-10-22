import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

interface D1DatabaseBinding {
  binding: string;
  database_name: string;
  database_id: string;
  migrations_dir?: string;
}

interface WranglerConfig {
  name?: string;
  main?: string;
  triggers?: {
    crons?: string[];
  };
  d1_databases?: D1DatabaseBinding[];
  [key: string]: unknown;
}

/**
 * Elimina comentarios simples (//) y multilínea (/* ... *\/) respetando literales de string,
 * así como comas sobrantes (trailing commas) antes de parsear JSON.
 */
export function stripJsoncComments(content: string): string {
  let insideString = false;
  let stringChar = "";
  let isEscaped = false;
  let result = "";
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (insideString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === stringChar) {
        insideString = false;
      }
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      insideString = true;
      stringChar = char;
      result += char;
      i++;
      continue;
    }

    // Comentario de línea //
    if (char === "/" && nextChar === "/") {
      i += 2;
      while (i < content.length && content[i] !== "\n" && content[i] !== "\r") {
        i++;
      }
      continue;
    }

    // Comentario de bloque /* ... */
    if (char === "/" && nextChar === "*") {
      i += 2;
      while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) {
        i++;
      }
      i += 2;
      continue;
    }

    result += char;
    i++;
  }

  // Eliminar trailing commas antes de } o ]
  return result.replace(/,\s*([\]}])/g, "$1");
}

export function parseJsonc<T = unknown>(content: string): T {
  const stripped = stripJsoncComments(content);
  return JSON.parse(stripped) as T;
}

describe("Segregación de bases de datos D1 (Fase 0)", () => {
  const baseDir = path.resolve(__dirname, "..");
  const ingestConfigPath = path.join(baseDir, "wrangler.ingest.jsonc");
  const opsConfigPath = path.join(baseDir, "wrangler.ops.jsonc");
  const leadsMigrationsConfigPath = path.join(baseDir, "wrangler.migrations-leads.jsonc");

  it("wrangler.ingest.jsonc NO contiene LEADS_DB ni varons_leads_db en d1_databases", () => {
    const rawContent = fs.readFileSync(ingestConfigPath, "utf8");
    // Verificar que los comentarios de seguridad existen sin romper el parser
    expect(rawContent).toContain("varons_leads_db");

    const config = parseJsonc<WranglerConfig>(rawContent);
    const d1Binds = config.d1_databases ?? [];

    const hasLeadsBinding = d1Binds.some(
      (db) =>
        db.binding === "LEADS_DB" ||
        db.database_name === "varons_leads_db" ||
        db.database_id === "254e9d87-7f66-49f1-aecd-45b603d7f05f"
    );
    expect(hasLeadsBinding).toBe(false);

    // Debe contener RADAR_DB con su migration_dir
    const radarDb = d1Binds.find((db) => db.binding === "RADAR_DB");
    expect(radarDb).toBeDefined();
    expect(radarDb?.database_name).toBe("varons_radar_db");
    expect(radarDb?.database_id).toBe("985cf1e9-a61d-48b9-8352-84485000f1b3");
    expect(radarDb?.migrations_dir).toBe("migrations/radar");
  });

  it("wrangler.ops.jsonc NO contiene LEADS_DB ni varons_leads_db en d1_databases", () => {
    const rawContent = fs.readFileSync(opsConfigPath, "utf8");
    // Verificar que los comentarios de seguridad existen sin romper el parser
    expect(rawContent).toContain("varons_leads_db");

    const config = parseJsonc<WranglerConfig>(rawContent);
    const d1Binds = config.d1_databases ?? [];

    const hasLeadsBinding = d1Binds.some(
      (db) =>
        db.binding === "LEADS_DB" ||
        db.database_name === "varons_leads_db" ||
        db.database_id === "254e9d87-7f66-49f1-aecd-45b603d7f05f"
    );
    expect(hasLeadsBinding).toBe(false);

    // Debe contener RADAR_DB con su migration_dir
    const radarDb = d1Binds.find((db) => db.binding === "RADAR_DB");
    expect(radarDb).toBeDefined();
    expect(radarDb?.database_name).toBe("varons_radar_db");
    expect(radarDb?.database_id).toBe("985cf1e9-a61d-48b9-8352-84485000f1b3");
    expect(radarDb?.migrations_dir).toBe("migrations/radar");
  });

  it("wrangler.migrations-leads.jsonc es exclusivamente para migraciones y contiene LEADS_DB", () => {
    const rawContent = fs.readFileSync(leadsMigrationsConfigPath, "utf8");
    const config = parseJsonc<WranglerConfig>(rawContent);

    // No debe ser config de Worker ejecutable ni desplegable
    expect(config.main).toBeUndefined();
    expect(config.triggers).toBeUndefined();

    // Debe tener único binding LEADS_DB
    const d1Binds = config.d1_databases ?? [];
    expect(d1Binds).toHaveLength(1);

    const leadsDb = d1Binds[0];
    expect(leadsDb.binding).toBe("LEADS_DB");
    expect(leadsDb.database_name).toBe("varons_leads_db");
    expect(leadsDb.database_id).toBe("254e9d87-7f66-49f1-aecd-45b603d7f05f");
    expect(leadsDb.migrations_dir).toBe("migrations/leads");
  });
});
