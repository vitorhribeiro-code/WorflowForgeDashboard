import { describe, expect, it } from "vitest";
import {
  validateCard,
  isValidCard,
  CARD_ENVELOPES,
  type TaskCard,
} from "@/modules/tasks/domain/card";

// Cartão mínimo válido, parametrizável, para os casos.
function card(over: Partial<TaskCard> = {}): TaskCard {
  return {
    template: "size-m",
    presentation: { blurb: "Resumo curto", blocks: [] },
    ...over,
  };
}

describe("validateCard — forma base", () => {
  it("aceita um cartão mínimo válido", () => {
    const r = validateCard(card());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("aceita blocos do catálogo com ícones do registo", () => {
    const r = validateCard(
      card({
        presentation: {
          blurb: "ok",
          blocks: [
            { type: "note", icon: "mail", text: "Chega às 8h" },
            { type: "kv", icon: "clock", label: "Cadência", value: "Diária" },
            { type: "emphasis", text: "Requer Gmail" },
          ],
        },
      }),
    );
    expect(r.valid).toBe(true);
  });

  it("rejeita input não-objeto", () => {
    expect(validateCard(null).valid).toBe(false);
    expect(validateCard("x").valid).toBe(false);
  });
});

describe("validateCard — template", () => {
  it("rejeita template fora dos 3 tamanhos", () => {
    const r = validateCard({ ...card(), template: "size-xl" as unknown as TaskCard["template"] });
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("template inválido");
  });
});

describe("validateCard — envelope por template", () => {
  it("rejeita blocos acima do teto do template", () => {
    // size-l só admite 2 blocos.
    const r = validateCard(
      card({
        template: "size-l",
        presentation: {
          blurb: "ok",
          blocks: [
            { type: "emphasis", text: "a" },
            { type: "emphasis", text: "b" },
            { type: "emphasis", text: "c" },
          ],
        },
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain(`> ${CARD_ENVELOPES["size-l"].maxBlocks}`);
  });

  it("rejeita blurb acima do máximo do template", () => {
    const long = "x".repeat(CARD_ENVELOPES["size-s"].maxBlurb + 1);
    const r = validateCard(card({ template: "size-s", presentation: { blurb: long, blocks: [] } }));
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("blurb >");
  });
});

describe("validateCard — catálogo de blocos (anti-vazamento)", () => {
  it("rejeita type de bloco fora do catálogo", () => {
    const r = validateCard(
      card({
        presentation: {
          blurb: "ok",
          blocks: [{ type: "run-button", label: "Correr" } as unknown as never],
        },
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("type inválido");
  });

  it("rejeita ícone fora do registo", () => {
    const r = validateCard(
      card({
        presentation: {
          blurb: "ok",
          blocks: [{ type: "note", icon: "rocket" as unknown as never, text: "x" }],
        },
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("icon fora do registo");
  });

  it("rejeita 'emphasis' com ícone (não suporta)", () => {
    const r = validateCard(
      card({
        presentation: {
          blurb: "ok",
          blocks: [{ type: "emphasis", icon: "mail", text: "x" } as unknown as never],
        },
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("não aceita icon");
  });

  it("rejeita 'kv' sem label ou value", () => {
    const r = validateCard(
      card({
        presentation: {
          blurb: "ok",
          blocks: [{ type: "kv", label: "", value: "" } as unknown as never],
        },
      }),
    );
    expect(r.valid).toBe(false);
  });
});

describe("isValidCard", () => {
  it("é type guard consistente com validateCard", () => {
    expect(isValidCard(card())).toBe(true);
    expect(isValidCard({ template: "nope" })).toBe(false);
  });
});
