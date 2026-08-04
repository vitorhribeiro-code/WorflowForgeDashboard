import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/session";
import { createCipher } from "@/modules/connections/service/crypto";
import { createAiRegistryService } from "@/modules/ai/service/ai-registry.service";
import { FakeAudit } from "../fakes/fakes";
import { FakeAiRegistryRepo } from "./fakes";

/**
 * §5.2 fase 1b — serviço do registo de IA (fakes, sem BD).
 *
 * Prova as invariantes fechadas no handoff: chave cifrada e WRITE-ONLY,
 * permissões só super_admin, auditoria (ai_provider.set / ai_binding.set),
 * unicidade (org, provider), upsert (org, capability) e isolamento por org.
 */

const admin: SessionContext = { userId: "u-admin", orgId: "o1", role: "super_admin" };
const worker: SessionContext = { userId: "u-worker", orgId: "o1", role: "worker" };
const adminB: SessionContext = { userId: "u-b", orgId: "o2", role: "super_admin" };

function build() {
  const repo = new FakeAiRegistryRepo();
  const audit = new FakeAudit();
  const cipher = createCipher(randomBytes(32).toString("base64"));
  const service = createAiRegistryService({ repo, cipher, audit });
  return { repo, audit, cipher, service };
}

describe("ai registry — providers (cifra write-only)", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("cifra a chave, guarda o blob e NUNCA a devolve", async () => {
    const { service, repo, cipher, audit } = ctx;
    const view = await service.createProvider(admin, {
      provider: "claude",
      apiKey: "sk-super-secret",
      defaultModel: "claude-sonnet-4-5",
    });

    // O blob guardado não é o texto simples, mas decifra de volta ao original.
    const stored = repo.providers[0]!.apiKeyEncrypted!;
    expect(stored).not.toBe("sk-super-secret");
    expect(cipher.decrypt(stored)).toBe("sk-super-secret");

    // A view reporta hasKey mas não expõe a chave em lado nenhum.
    expect(view.hasKey).toBe(true);
    expect(JSON.stringify(view)).not.toContain("sk-super-secret");

    // Auditoria: ai_provider.set, sem a chave no metadata.
    const ev = audit.entries.at(-1)!;
    expect(ev.action).toBe("ai_provider.set");
    expect(ev.entity).toBe("ai_provider");
    expect(JSON.stringify(ev.metadata)).not.toContain("sk-super-secret");
    expect((ev.metadata as { keySet: boolean }).keySet).toBe(true);
  });

  it("permite registar sem chave (hasKey=false) e definir depois", async () => {
    const { service, repo, cipher } = ctx;
    const created = await service.createProvider(admin, { provider: "mistral" });
    expect(created.hasKey).toBe(false);
    expect(repo.providers[0]!.apiKeyEncrypted).toBeNull();

    const updated = await service.updateProvider(admin, created.id, { apiKey: "sk-later" });
    expect(updated.hasKey).toBe(true);
    expect(cipher.decrypt(repo.providers[0]!.apiKeyEncrypted!)).toBe("sk-later");
  });

  it("normaliza o provider e recusa duplicados por (org, provider)", async () => {
    const { service, repo } = ctx;
    await service.createProvider(admin, { provider: "  Claude " });
    expect(repo.providers[0]!.provider).toBe("claude"); // trim + lowercase
    await expect(service.createProvider(admin, { provider: "CLAUDE" })).rejects.toMatchObject({
      code: "AI_PROVIDER_EXISTS",
      status: 409,
    });
  });

  it("update mantém a chave quando apiKey não é enviada", async () => {
    const { service, repo } = ctx;
    const p = await service.createProvider(admin, { provider: "claude", apiKey: "sk-keep" });
    const before = repo.providers[0]!.apiKeyEncrypted;
    const updated = await service.updateProvider(admin, p.id, { enabled: false });
    expect(updated.enabled).toBe(false);
    expect(updated.hasKey).toBe(true);
    expect(repo.providers[0]!.apiKeyEncrypted).toBe(before); // inalterada
  });

  it("update inexistente devolve 404", async () => {
    const { service } = ctx;
    await expect(service.updateProvider(admin, "nope", { enabled: true })).rejects.toMatchObject({
      code: "AI_PROVIDER_NOT_FOUND",
      status: 404,
    });
  });

  it("remove regista ai_provider.removed; inexistente devolve 404", async () => {
    const { service, audit } = ctx;
    const p = await service.createProvider(admin, { provider: "claude" });
    await service.removeProvider(admin, p.id);
    expect(audit.actions()).toContain("ai_provider.removed");
    await expect(service.removeProvider(admin, p.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("ai registry — bindings (upsert por capacidade)", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("upsert: redefinir a mesma capability atualiza em vez de duplicar", async () => {
    const { service, audit } = ctx;
    await service.setBinding(admin, { capability: "email.summary", provider: "claude" });
    await service.setBinding(admin, {
      capability: "email.summary",
      provider: "mistral",
      model: "mistral-small",
    });
    const list = await service.listBindings(admin);
    expect(list).toHaveLength(1);
    expect(list[0]!.provider).toBe("mistral");
    expect(list[0]!.model).toBe("mistral-small");
    expect(audit.actions().filter((a) => a === "ai_binding.set")).toHaveLength(2);
  });

  it("remove regista ai_binding.removed; inexistente devolve 404", async () => {
    const { service, audit } = ctx;
    const b = await service.setBinding(admin, { capability: "ocr", provider: "mistral" });
    await service.removeBinding(admin, b.id);
    expect(audit.actions()).toContain("ai_binding.removed");
    await expect(service.removeBinding(admin, b.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("ai registry — permissões e isolamento", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("worker é recusado (403) em toda a superfície", async () => {
    const { service } = ctx;
    const forbidden = { code: "FORBIDDEN", status: 403 };
    await expect(service.listProviders(worker)).rejects.toMatchObject(forbidden);
    await expect(
      service.createProvider(worker, { provider: "claude" }),
    ).rejects.toMatchObject(forbidden);
    await expect(service.updateProvider(worker, "x", { enabled: true })).rejects.toMatchObject(
      forbidden,
    );
    await expect(service.removeProvider(worker, "x")).rejects.toMatchObject(forbidden);
    await expect(service.listBindings(worker)).rejects.toMatchObject(forbidden);
    await expect(
      service.setBinding(worker, { capability: "ocr", provider: "claude" }),
    ).rejects.toMatchObject(forbidden);
    await expect(service.removeBinding(worker, "x")).rejects.toMatchObject(forbidden);
  });

  it("um admin não vê os providers de outra org", async () => {
    const { service } = ctx;
    await service.createProvider(admin, { provider: "claude" });
    expect(await service.listProviders(adminB)).toHaveLength(0);
    // e um provider com o mesmo nome noutra org é permitido (unicidade é por org).
    await expect(service.createProvider(adminB, { provider: "claude" })).resolves.toMatchObject({
      provider: "claude",
    });
  });
});
