import { describe, expect, it } from "vitest";
import { taskLifecycle } from "@/modules/tasks/domain/lifecycle";

describe("taskLifecycle", () => {
  it("não-publicada ⇒ stage unpublished, nada feito", () => {
    const lc = taskLifecycle({ published: false, cardStatus: null });
    expect(lc.stage).toBe("unpublished");
    expect(lc.publishDone).toBe(false);
    expect(lc.cardDone).toBe(false);
    expect(lc.taskLabel).toBe("Rascunho");
    expect(lc.cardLabel).toBe("Sem cartão");
  });

  it("não-publicada mantém-se unpublished mesmo com cartão validado (published manda)", () => {
    const lc = taskLifecycle({ published: false, cardStatus: "ready" });
    expect(lc.stage).toBe("unpublished");
    expect(lc.publishDone).toBe(false);
    // o cartão pode estar validado, mas o eixo de publicação ainda não passou
    expect(lc.cardDone).toBe(true);
  });

  it("publicada sem cartão ⇒ no_card, publishDone mas não cardDone", () => {
    const lc = taskLifecycle({ published: true, cardStatus: null });
    expect(lc.stage).toBe("no_card");
    expect(lc.publishDone).toBe(true);
    expect(lc.cardDone).toBe(false);
    expect(lc.taskLabel).toBe("Publicada");
    expect(lc.cardLabel).toBe("Sem cartão");
  });

  it("publicada com cartão em rascunho ⇒ card_draft", () => {
    const lc = taskLifecycle({ published: true, cardStatus: "draft" });
    expect(lc.stage).toBe("card_draft");
    expect(lc.publishDone).toBe(true);
    expect(lc.cardDone).toBe(false);
    expect(lc.cardLabel).toBe("Cartão em rascunho");
  });

  it("publicada com cartão validado ⇒ live, tudo feito", () => {
    const lc = taskLifecycle({ published: true, cardStatus: "ready" });
    expect(lc.stage).toBe("live");
    expect(lc.publishDone).toBe(true);
    expect(lc.cardDone).toBe(true);
    expect(lc.cardLabel).toBe("Cartão validado");
  });

  it("o próximo passo (nextHint) difere por stage", () => {
    const hints = new Set(
      (
        [
          { published: false, cardStatus: null },
          { published: true, cardStatus: null },
          { published: true, cardStatus: "draft" as const },
          { published: true, cardStatus: "ready" as const },
        ] as const
      ).map((i) => taskLifecycle(i).nextHint),
    );
    // quatro stages distintos ⇒ quatro hints distintos
    expect(hints.size).toBe(4);
  });
});
