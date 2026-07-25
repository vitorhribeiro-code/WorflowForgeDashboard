// Cliente S3/R2 partilhado (web + worker). Memoizado. Devolve null quando o
// storage de objetos não está configurado — nesse caso os containers degradam
// para os stores em memória. Assim o §3 fecha sem exigir S3 em dev/testes.
import { S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "../config/env";

let cached: S3Client | null | undefined;

/** S3Client se S3_BUCKET + credenciais existirem, senão null. */
export function getS3Client(): S3Client | null {
  if (cached !== undefined) return cached;
  const env = loadEnv();
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    cached = null;
    return cached;
  }
  cached = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // R2 e a maioria dos S3-compatíveis preferem path-style.
    forcePathStyle: true,
  });
  return cached;
}

/** Nome do bucket, ou null se não configurado. */
export function getS3Bucket(): string | null {
  return loadEnv().S3_BUCKET ?? null;
}
