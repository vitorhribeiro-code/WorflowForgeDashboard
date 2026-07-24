// slug da organização: ^[a-z0-9-]+$ (spec §M2). Único global (schema).
export const SLUG_RE = /^[a-z0-9-]+$/;

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 60 && SLUG_RE.test(slug) && !slug.startsWith("-") && !slug.endsWith("-");
}

// Bloqueia ações que deixariam a organização sem nenhum super_admin.
// Aplica-se a desativar um admin ou a despromover o último admin a worker.
export function wouldLeaveNoAdmin(currentAdminCount: number, targetIsAdmin: boolean): boolean {
  return targetIsAdmin && currentAdminCount <= 1;
}
