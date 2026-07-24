// Regras puras de tiers. Testáveis sem DB nem rede.
import type { Artifact, ArtifactLocation, ArtifactTier } from "./artifact";

/**
 * No schema atual a relação tier -> location é 1:1.
 * Mantemos a função para que a regra viva num só sítio.
 */
export function locationForTier(tier: ArtifactTier): ArtifactLocation {
  return tier === "work_document" ? "worker_cloud" : "ephemeral";
}

export interface ArtifactPlan {
  location: ArtifactLocation;
  /** null para work_document; now+ttl para intermediate. */
  expiresAt: Date | null;
}

/** Decide destino e expiração antes de gravar. Puro (recebe `now`). */
export function planArtifact(tier: ArtifactTier, now: Date, ttlMs: number): ArtifactPlan {
  if (tier === "work_document") {
    return { location: "worker_cloud", expiresAt: null };
  }
  return { location: "ephemeral", expiresAt: new Date(now.getTime() + ttlMs) };
}

/** Um intermédio deixa de ser acessível depois do TTL. work_document nunca expira. */
export function isExpired(a: Pick<Artifact, "expiresAt">, now: Date): boolean {
  return a.expiresAt !== null && a.expiresAt.getTime() <= now.getTime();
}

/**
 * Elegível para limpeza física.
 * Regra do schema (índice tier_archived_idx + comentário): o cleanup só apaga
 * intermédios EXPIRADOS e JÁ ARQUIVADOS — nunca work_document, nunca a cloud.
 */
export function isCleanable(
  a: Pick<Artifact, "tier" | "archived" | "expiresAt">,
  now: Date,
): boolean {
  return a.tier === "intermediate" && a.archived === true && isExpired(a, now);
}

/** Só se pode descarregar se não estiver expirado (intermédio); cloud é sempre resolúvel. */
export function isDownloadable(
  a: Pick<Artifact, "tier" | "expiresAt">,
  now: Date,
): boolean {
  if (a.tier === "work_document") return true;
  return !isExpired(a, now);
}
