import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { PublicationPort } from "../service/ports";

// -------------------------------------------------------------------------- //
//  O schema atual NÃO tem `tasks.published` (divergência com a spec, que fala  //
//  em publicar/despublicar). Usamos SQL cru para não tocar em schema.ts e      //
//  EXIGIMOS a migração:                                                        //
//    ALTER TABLE tasks ADD COLUMN published boolean NOT NULL DEFAULT false;    //
//  Enquanto a coluna não existir, estas queries falham — é o estado honesto.   //
//  Para dev sem a coluna, injetar antes o InMemoryPublication (ver container). //
// -------------------------------------------------------------------------- //
function rowsOf<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return Array.isArray(r?.rows) ? r.rows : ((res as T[]) ?? []);
}

export function createDrizzlePublication(db: Db): PublicationPort {
  return {
    async isPublished(taskId: string): Promise<boolean> {
      const res = await db.execute(sql`select published from tasks where id = ${taskId}`);
      const row = rowsOf<{ published: boolean }>(res)[0];
      return Boolean(row?.published);
    },
    async setPublished(taskId: string, value: boolean): Promise<void> {
      await db.execute(sql`update tasks set published = ${value} where id = ${taskId}`);
    },
  };
}
