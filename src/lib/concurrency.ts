// Utilitário puro de concorrência limitada. Sem dependências, testável isolado.
//
// Motivação: apagar N artefactos efémeros do R2 (ou N inserts de auditoria) num
// `for … await` é O(N) round-trips SEQUENCIAIS — passa dos 30 s do cron-job.org
// a partir de poucas centenas. Este helper corre até `limit` tarefas em paralelo,
// preservando a ordem dos resultados, com back-pressure real (nunca abre mais de
// `limit` promessas em simultâneo, ao contrário de um `Promise.all` cego).

/**
 * Aplica `fn` a cada item com um teto de `limit` tarefas em curso.
 * Preserva a ordem dos resultados (results[i] corresponde a items[i]).
 * Propaga a primeira rejeição (como `Promise.all`); para falhas por-item
 * não-fatais, `fn` deve capturar e devolver um resultado marcado.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, n));
  const results = new Array<R>(n);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= n) return;
      // `i < n` garante presença; o cast satisfaz noUncheckedIndexedAccess.
      results[i] = await fn(items[i] as T, i);
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
