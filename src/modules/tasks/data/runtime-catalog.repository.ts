/**
 * Catálogo de runtimes na BD (v50) — adaptador Drizzle do porto `RuntimeCatalog`.
 *
 * GLOBAL (como as tools): não é escopado por org; um runtime é uma capacidade
 * partilhada, associável a tarefas de qualquer utilizador. O isolamento tenant
 * é preservado no RUN (o modelo vem do binding de IA da org; os tokens, da
 * conexão do trabalhador) — o runtime é só o "COMO".
 *
 * RESILIÊNCIA deliberada: `has`/`list` engolem erros (ex.: a tabela ainda não
 * existir, se o deploy da app preceder a migração 0009) e devolvem false/[].
 * Assim os 4 built-in continuam a valer pelo array (createRuntimeRegistry), sem
 * janela de quebra — a BD só ACRESCENTA os generated.
 */

import type { Db } from "@/db/client";
import { eq } from "drizzle-orm";
import { runtimes } from "@/db/schema";
import type { RuntimeCatalog, RuntimeCatalogEntry } from "../service/ports";

/** Registo completo do catálogo (inclui o `spec` do generated). */
export type RuntimeCatalogRow = RuntimeCatalogEntry & {
  spec: Record<string, unknown> | null;
};

/** Registo a criar (v52) — sempre kind='generic' (os built-in nascem no seed). */
export type NewRuntimeRow = {
  key: string;
  label: string;
  taskType: RuntimeCatalogEntry["taskType"];
  spec: Record<string, unknown> | null;
};

/**
 * O adaptador Drizzle expõe, além do porto v50, `get(key)` com o spec (v51) e
 * `create` para runtimes generated (v52). `create` NÃO engole erros (a violação
 * de unicidade deve chegar ao serviço, que a traduz em 409).
 */
export interface RuntimeCatalogRepo extends RuntimeCatalog {
  get(key: string): Promise<RuntimeCatalogRow | null>;
  create(input: NewRuntimeRow): Promise<RuntimeCatalogRow>;
}

export function createDrizzleRuntimeCatalog(db: Db): RuntimeCatalogRepo {
  return {
    async has(key: string): Promise<boolean> {
      try {
        const rows = await db
          .select({ key: runtimes.key })
          .from(runtimes)
          .where(eq(runtimes.key, key))
          .limit(1);
        return rows.length > 0;
      } catch (err) {
        console.error("[runtime-catalog] has() falhou (a devolver false):", err);
        return false;
      }
    },

    async list(): Promise<RuntimeCatalogEntry[]> {
      try {
        const rows = await db
          .select({
            key: runtimes.key,
            label: runtimes.label,
            taskType: runtimes.taskType,
            kind: runtimes.kind,
          })
          .from(runtimes);
        return rows.map((r) => ({
          key: r.key,
          label: r.label,
          taskType: r.taskType,
          kind: r.kind,
        }));
      } catch (err) {
        console.error("[runtime-catalog] list() falhou (a devolver []):", err);
        return [];
      }
    },

    // v51: registo completo (com spec) para o executor genérico. Resiliente.
    async get(key: string): Promise<RuntimeCatalogRow | null> {
      try {
        const rows = await db
          .select({
            key: runtimes.key,
            label: runtimes.label,
            taskType: runtimes.taskType,
            kind: runtimes.kind,
            spec: runtimes.spec,
          })
          .from(runtimes)
          .where(eq(runtimes.key, key))
          .limit(1);
        const r = rows[0];
        if (!r) return null;
        return {
          key: r.key,
          label: r.label,
          taskType: r.taskType,
          kind: r.kind,
          spec: r.spec ?? null,
        };
      } catch (err) {
        console.error("[runtime-catalog] get() falhou (a devolver null):", err);
        return null;
      }
    },

    // v52: cria um runtime generated. Erros propagam (a unicidade vira 409 no serviço).
    async create(input: NewRuntimeRow): Promise<RuntimeCatalogRow> {
      const [row] = await db
        .insert(runtimes)
        .values({
          key: input.key,
          label: input.label,
          taskType: input.taskType,
          kind: "generic",
          spec: input.spec,
        })
        .returning({
          key: runtimes.key,
          label: runtimes.label,
          taskType: runtimes.taskType,
          kind: runtimes.kind,
          spec: runtimes.spec,
        });
      if (!row) throw new Error("insert de runtime não devolveu linha");
      return {
        key: row.key,
        label: row.label,
        taskType: row.taskType,
        kind: row.kind,
        spec: row.spec ?? null,
      };
    },
  };
}
