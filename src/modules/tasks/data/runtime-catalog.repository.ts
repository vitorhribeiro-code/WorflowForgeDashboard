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

export function createDrizzleRuntimeCatalog(db: Db): RuntimeCatalog {
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
  };
}
