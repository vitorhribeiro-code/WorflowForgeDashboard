import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/session";
import { createCipher } from "@/modules/connections/service/crypto";
import { createAiRegistryService } from "@/modules/ai/service/ai-registry.service";
import { createLlmResolver } from "@/modules/ai/service/resolver";
import type { LlmAdapterConfig, LlmPort } from "@/platform/ai/port";
import { createAdapter } from "@/platform/ai/registry";
import { FakeAudit } from "../fakes/fakes";
import { FakeAiRegistryRepo } from "./fakes";

/**
 * §5.2 fase 2 — resolver. Semeia via a registry service (cifra real) e resolve
 * pelo mesmo repo/cipher. Um `createAdapter` espião captura a config para provar
 * que a chave decifrada e o modelo certo chegam ao adapter — sem tocar na rede.
 */

const admin: SessionContext = { userId: "u-admin", orgId: "o1", role: "super_admin" };
const adminB: SessionContext = { userId: "u-b", orgId: "o2", role: "super_admin" };

function build() {
  const repo = new FakeAiRegistryRepo();
  const cipher = createCipher(randomBytes(32).toString("base64"));
  const service = createAiRegistryService({ repo, cipher, audit: new FakeAudit() });

  // Espião: regista (provider, cfg) e delega no createAdapter real.
  const seen: Array<{ provider: string; cfg: LlmAdapterConfig }> = [];
  const spyCreate = vi.fn((provider: string, cfg: LlmAdapterConfig): LlmPort | null => {
    seen.push({ provider, cfg });
    return createAdapter(provider, cfg);
  });
  const resolver = createLlmResolver({ repo, cipher, createAdapter: spyCreate });
  return { repo, cipher, service, resolver, seen, spyCreate };
}

describe("resolver de IA", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("resolve o adapter certo, decifra a chave e usa o modelo do binding", async () => {
    const { service, resolver, seen } = ctx;
    await service.createProvider(admin, {
      provider: "mistral",
      apiKey: "sk-real-secret",
      defaultModel: "mistral-small",
    });
    await service.setBinding(admin, {
      capability: "email.summary",
      provider: "mistral",
      model: "mistral-large",
    });

    const adapter = await resolver.resolve("o1", "email.summary");
    expect(adapter).not.toBeNull();
    expect(adapter!.provider).toBe("mistral");
    expect(adapter!.model).toBe("mistral-large"); // binding vence o default

    // A chave decifrada chegou ao adapter (nunca esteve em texto no repo).
    expect(seen[0]!.cfg.apiKey).toBe("sk-real-secret");
    expect(seen[0]!.cfg.model).toBe("mistral-large");
  });

  it("cai no default do provider quando o binding não fixa modelo", async () => {
    const { service, resolver } = ctx;
    await service.createProvider(admin, {
      provider: "claude",
      apiKey: "sk-c",
      defaultModel: "claude-sonnet-4-5",
    });
    await service.setBinding(admin, { capability: "assistant.generic", provider: "claude" });

    const adapter = await resolver.resolve("o1", "assistant.generic");
    expect(adapter!.model).toBe("claude-sonnet-4-5");
  });

  it("sem binding → null (fallback)", async () => {
    const { resolver } = ctx;
    expect(await resolver.resolve("o1", "email.summary")).toBeNull();
  });

  it("provider desativado ou sem chave → null", async () => {
    const { service, resolver } = ctx;
    // sem chave
    await service.createProvider(admin, { provider: "mistral", defaultModel: "m" });
    await service.setBinding(admin, { capability: "email.summary", provider: "mistral" });
    expect(await resolver.resolve("o1", "email.summary")).toBeNull();

    // com chave mas desativado
    const p = await service.createProvider(admin, {
      provider: "claude",
      apiKey: "k",
      defaultModel: "m",
    });
    await service.updateProvider(admin, p.id, { enabled: false });
    await service.setBinding(admin, { capability: "assistant.generic", provider: "claude" });
    expect(await resolver.resolve("o1", "assistant.generic")).toBeNull();
  });

  it("binding sem modelo e provider sem default → null", async () => {
    const { service, resolver } = ctx;
    await service.createProvider(admin, { provider: "mistral", apiKey: "k" }); // sem defaultModel
    await service.setBinding(admin, { capability: "email.summary", provider: "mistral" });
    expect(await resolver.resolve("o1", "email.summary")).toBeNull();
  });

  it("provider sem adapter conhecido → null", async () => {
    const { service, resolver } = ctx;
    await service.createProvider(admin, { provider: "acme", apiKey: "k", defaultModel: "m" });
    await service.setBinding(admin, { capability: "email.summary", provider: "acme" });
    expect(await resolver.resolve("o1", "email.summary")).toBeNull();
  });

  it("isolamento: binding de outra org não resolve", async () => {
    const { service, resolver } = ctx;
    await service.createProvider(admin, { provider: "mistral", apiKey: "k", defaultModel: "m" });
    await service.setBinding(admin, { capability: "email.summary", provider: "mistral" });
    // adminB (org o2) não tem nada.
    expect(await resolver.resolve("o2", "email.summary")).toBeNull();
    // e o próprio o1 resolve, garantindo que o teste não é vácuo.
    expect(await resolver.resolve("o1", "email.summary")).not.toBeNull();
    // adminB é usado só para clareza semântica do cenário multi-org.
    void adminB;
  });
});
