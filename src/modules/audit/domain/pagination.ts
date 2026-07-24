import type { PageRequest, Paginated } from "./types";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Normaliza e limita page/pageSize (defensivo contra inputs fora de gama).
export function normalizePage(page?: number, pageSize?: number): PageRequest {
  const p = Number.isFinite(page) && (page as number) >= 1 ? Math.floor(page as number) : 1;
  const rawSize = Number.isFinite(pageSize) ? Math.floor(pageSize as number) : DEFAULT_PAGE_SIZE;
  const size = Math.min(Math.max(rawSize, 1), MAX_PAGE_SIZE);
  return { page: p, pageSize: size };
}

// Offset para o LIMIT/OFFSET do repositório.
export function offsetOf(page: PageRequest): number {
  return (page.page - 1) * page.pageSize;
}

// Embrulha itens já paginados pelo repo com o total para o cliente.
export function paginate<T>(
  items: T[],
  total: number,
  page: PageRequest,
): Paginated<T> {
  return {
    items,
    page: page.page,
    pageSize: page.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
  };
}
