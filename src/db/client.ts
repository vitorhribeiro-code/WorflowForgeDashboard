// Instância partilhada do Drizzle. No repo real já existe — não duplicar.
// Só o composition root (container.ts) e os *.repository.ts a tocam.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "";
// Postgres local (dev/testes) fala sem TLS; BD gerida acedida pela internet
// (Railway, Neon, …) normalmente exige TLS. Default automático por host, com
// override explícito por env: DATABASE_SSL="true"|"false".
const isLocal = url === "" || /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sslEnv = process.env.DATABASE_SSL;
const useSSL = sslEnv ? sslEnv === "true" : !isLocal;

const pool = new Pool({
  connectionString: url || undefined,
  ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
