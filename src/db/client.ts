// Instância partilhada do Drizzle. No repo real já existe — não duplicar.
// Só o composition root (container.ts) e os *.repository.ts a tocam.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Db = typeof db;
