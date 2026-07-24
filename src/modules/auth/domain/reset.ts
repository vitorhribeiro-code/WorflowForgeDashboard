import { createHash, randomBytes } from "node:crypto";

// O token vai por email em claro; guardamos só o hash (como uma password).
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type ResetRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

// Usável sse não usado e ainda dentro da validade.
export function isResetUsable(rec: ResetRecord, now: Date): boolean {
  return rec.usedAt === null && rec.expiresAt.getTime() > now.getTime();
}
