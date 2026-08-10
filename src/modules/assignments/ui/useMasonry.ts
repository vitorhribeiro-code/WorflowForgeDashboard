"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Masonry por row-span — Fase A do board arrastável, SEM dependências.
 *
 * O `.wf-board` é um grid `auto-fill` de colunas iguais. Com cartões de alturas
 * diferentes (ex.: a consola de escrita expandida ao lado de cartões curtos), o
 * grid deixa gaps verticais: a linha fica com a altura do cartão mais alto e os
 * curtos ficam com vazio por baixo. Este hook fecha esses gaps: dá a cada filho
 * directo `.wf-cell` um `grid-row-end: span N` calculado a partir da altura
 * natural do seu conteúdo (o `.task-card` lá dentro), empacotando as colunas
 * como uma masonry.
 *
 * Reflow automático:
 *  - um cartão cresce/encolhe (ex.: aparece o texto gerado) → ResizeObserver do
 *    conteúdo dispara e recalcula → os vizinhos deslocam-se para abrir/fechar
 *    espaço;
 *  - a largura muda o nº de colunas → ResizeObserver do próprio grid recalcula.
 *
 * Medimos o conteúdo interno (não a `.wf-cell`) porque a célula, sendo item de
 * grid com `grid-auto-rows` pequeno, teria a altura da faixa e não a do conteúdo.
 */
export function useMasonry(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[],
): void {
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === "undefined") return;

    const px = (v: string): number => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };

    let raf = 0;
    const relayout = (): void => {
      const cs = getComputedStyle(grid);
      const row = px(cs.gridAutoRows) || 8; // faixa base (px)
      const gap = px(cs.rowGap); // espaço vertical entre cartões (px)
      const cells = grid.querySelectorAll<HTMLElement>(":scope > .wf-cell");
      cells.forEach((cell) => {
        const content = (cell.firstElementChild as HTMLElement | null) ?? cell;
        const h = content.getBoundingClientRect().height;
        // n faixas cobrem n*row + (n-1)*gap ≥ h  →  n = ceil((h+gap)/(row+gap))
        const span = Math.max(1, Math.ceil((h + gap) / (row + gap)));
        cell.style.gridRowEnd = `span ${span}`;
      });
    };

    const schedule = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(relayout);
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(grid); // largura → nº de colunas
    grid
      .querySelectorAll<HTMLElement>(":scope > .wf-cell > *")
      .forEach((el) => ro.observe(el)); // altura de cada cartão

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
