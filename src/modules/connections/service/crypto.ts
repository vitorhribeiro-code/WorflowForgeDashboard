/**
 * Cifra das credenciais ao nível da app (AES-256-GCM).
 * Regra da spec/schema: credentials_encrypted é SEMPRE cifrado; o admin nunca
 * vê tokens. Só a service (des)cifra, e nunca devolve o resultado ao exterior.
 *
 * Formato do texto cifrado:  v1:<iv_b64>:<tag_b64>:<cipher_b64>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12; // recomendado para GCM

export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(token: string): string;
}

/**
 * Constrói um Cipher a partir de uma chave de 32 bytes (base64).
 * Injeta-se a chave (em vez de ler env aqui) para a service ser testável.
 */
export function createCipher(keyBase64: string): Cipher {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("Chave de cifra inválida: esperados 32 bytes (base64).");
  }

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
      const tag = c.getAuthTag();
      return [
        VERSION,
        iv.toString("base64"),
        tag.toString("base64"),
        enc.toString("base64"),
      ].join(":");
    },

    decrypt(token: string): string {
      const [v, ivB64, tagB64, dataB64] = token.split(":");
      if (v !== VERSION || !ivB64 || !tagB64 || !dataB64) {
        throw new Error("Token cifrado malformado.");
      }
      const d = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivB64, "base64"),
      );
      d.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([
        d.update(Buffer.from(dataB64, "base64")),
        d.final(),
      ]).toString("utf8");
    },
  };
}

/** Serializa/desserializa o objeto de credenciais antes de cifrar. */
export const credsCodec = {
  serialize: (creds: unknown) => JSON.stringify(creds),
  deserialize: <T>(json: string) => JSON.parse(json) as T,
};
