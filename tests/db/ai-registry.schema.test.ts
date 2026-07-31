import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { aiProviders, aiBindings } from "../../src/db/schema";

/**
 * §5.2 fase 1a — guarda-esquema do registo de IA.
 *
 * Sem BD: valida a forma das tabelas (colunas, nullability, índices únicos e a
 * FK org com ON DELETE CASCADE) diretamente do modelo Drizzle. Protege as
 * invariantes fechadas no handoff: uma config por (org, provider) e um binding
 * por (org, capability).
 */

function shape(tbl: Parameters<typeof getTableConfig>[0]) {
  const t = getTableConfig(tbl);
  return {
    name: t.name,
    cols: Object.fromEntries(t.columns.map((c) => [c.name, c.notNull])),
    indexes: Object.fromEntries(t.indexes.map((i) => [i.config.name, i.config.unique])),
    fks: t.foreignKeys.map((fk) => ({
      cols: fk.reference().columns.map((c) => c.name),
      onDelete: fk.onDelete,
    })),
  };
}

describe("ai registry schema — ai_providers", () => {
  const s = shape(aiProviders);

  it("tem o nome e as colunas esperadas", () => {
    expect(s.name).toBe("ai_providers");
    expect(Object.keys(s.cols).sort()).toEqual(
      [
        "id",
        "organization_id",
        "provider",
        "api_key_encrypted",
        "default_model",
        "enabled",
        "created_at",
      ].sort(),
    );
  });

  it("org_id e provider são NOT NULL; a chave cifrada é nullable (write-later)", () => {
    expect(s.cols.organization_id).toBe(true);
    expect(s.cols.provider).toBe(true);
    expect(s.cols.enabled).toBe(true);
    expect(s.cols.api_key_encrypted).toBe(false);
    expect(s.cols.default_model).toBe(false);
  });

  it("é único por (org, provider)", () => {
    expect(s.indexes["ai_providers_org_provider_uq"]).toBe(true);
    expect(s.indexes["ai_providers_org_idx"]).toBe(false);
  });

  it("a FK da org apaga em cascata", () => {
    expect(s.fks).toContainEqual({ cols: ["organization_id"], onDelete: "cascade" });
  });
});

describe("ai registry schema — ai_bindings", () => {
  const s = shape(aiBindings);

  it("tem o nome e as colunas esperadas", () => {
    expect(s.name).toBe("ai_bindings");
    expect(Object.keys(s.cols).sort()).toEqual(
      ["id", "organization_id", "capability", "provider", "model", "created_at"].sort(),
    );
  });

  it("org_id, capability e provider são NOT NULL; model é nullable", () => {
    expect(s.cols.organization_id).toBe(true);
    expect(s.cols.capability).toBe(true);
    expect(s.cols.provider).toBe(true);
    expect(s.cols.model).toBe(false);
  });

  it("é único por (org, capability)", () => {
    expect(s.indexes["ai_bindings_org_capability_uq"]).toBe(true);
    expect(s.indexes["ai_bindings_org_idx"]).toBe(false);
  });

  it("a FK da org apaga em cascata", () => {
    expect(s.fks).toContainEqual({ cols: ["organization_id"], onDelete: "cascade" });
  });
});
