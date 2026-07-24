import { z } from "zod";

// Validação centralizada de ambiente/segredos. Falha cedo e clara no arranque.
// Segredos (AUTH_SECRET, ENCRYPTION_KEY, SMTP_PASS, OAuth secrets) devem vir de
// um secret manager em produção — nunca commitados.
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET deve ter ≥32 chars"),
  // Chave AES-256-GCM que cifra as credenciais OAuth do M6 (hex de 32 bytes).
  ENCRYPTION_KEY: z.string().length(64).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 8),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  REDIS_URL: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  // R2/S3 precisam de endpoint + chaves (o R2 usa um endpoint próprio).
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  MAIL_FROM: z.string().default("no-reply@localhost"),
  // Segredo partilhado que protege os endpoints de cron (§cron).
  CRON_SECRET: z.string().min(16).optional(),
  // OAuth por provider (M6). Opcionais até o M6 ser integrado.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  DROPBOX_CLIENT_ID: z.string().optional(),
  DROPBOX_CLIENT_SECRET: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;
export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Config inválida:\n${JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)}`);
  }
  cached = parsed.data;
  return cached;
}
