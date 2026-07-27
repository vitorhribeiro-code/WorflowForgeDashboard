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
  // Serverless + Postgres gerida (Railway trial larga conexões idle). Sem estas
  // guardas, uma conexão idle que o servidor fecha rebenta a query seguinte com
  // um 500 intermitente (que recupera no arranque quente seguinte).
  max: 5, // cada lambda quente tem o seu pool; manter baixo evita esgotar o servidor
  idleTimeoutMillis: 10_000, // fecha conexões idle antes de o Railway as largar
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});

// CRÍTICO: sem este handler, um erro num cliente IDLE do pool é um 'error' não
// tratado ao nível do processo — derruba a invocação (500) mesmo fora de uma
// query. Com ele, o erro é registado e o pool recicla a conexão silenciosamente.
pool.on("error", (err) => {
  console.error("[db] erro em cliente idle do pool (reciclado):", err.message);
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
