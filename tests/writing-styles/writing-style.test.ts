import { describe, it, expect } from "vitest";
import {
  MAX_STYLE_BYTES,
  hasAllowedExtension,
  styleByteLength,
  validateStyleUpload,
} from "@/modules/writing-styles/domain/writing-style";
import {
  createWritingStyleService,
  type WritingStyleService,
} from "@/modules/writing-styles/service/writing-style.service";
import type {
  WritingStyleRepository,
  WritingStyleRow,
} from "@/modules/writing-styles/data/writing-style.repository";
import type { AuditEvent, AuditPort } from "@/lib/audit";
import type { SessionContext } from "@/lib/session";

const admin: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };
const worker: SessionContext = { userId: "w9", orgId: "o1", role: "worker" };

function fakeAudit(): AuditPort & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return { async record(ev) { events.push(ev); }, events };
}

function fakeRepo(opts?: {
  inOrg?: boolean;
  existing?: WritingStyleRow | null;
}): WritingStyleRepository & { saved: WritingStyleRow | null } {
  let store: WritingStyleRow | null = opts?.existing ?? null;
  const inOrg = opts?.inOrg ?? true;
  return {
    async workerInOrg() {
      return inOrg;
    },
    async getByWorker() {
      return store;
    },
    async upsert({ workerId, contentMd, sourceFilename }) {
      store = { workerId, contentMd, sourceFilename, updatedAt: new Date("2026-08-08T12:00:00Z") };
      return store;
    },
    get saved() {
      return store;
    },
  };
}

describe("writing-styles — domínio", () => {
  it("styleByteLength conta bytes UTF-8 (acentos = 2 bytes)", () => {
    expect(styleByteLength("abc")).toBe(3);
    expect(styleByteLength("á")).toBe(2);
  });

  it("hasAllowedExtension aceita .md/.markdown e rejeita o resto", () => {
    expect(hasAllowedExtension("estilo.md")).toBe(true);
    expect(hasAllowedExtension("ESTILO.MARKDOWN")).toBe(true);
    expect(hasAllowedExtension("estilo.txt")).toBe(false);
    expect(hasAllowedExtension("estilo")).toBe(false);
  });

  it("validateStyleUpload: válido → null; casos maus → mensagem", () => {
    expect(validateStyleUpload("e.md", "conteúdo real")).toBeNull();
    expect(validateStyleUpload("e.txt", "x")).toMatch(/\.md/);
    expect(validateStyleUpload("e.md", "   ")).toMatch(/vazio/);
    const big = "a".repeat(MAX_STYLE_BYTES + 1);
    expect(validateStyleUpload("e.md", big)).toMatch(/limite/);
  });
});

describe("writing-styles — serviço", () => {
  let svc: WritingStyleService;

  it("get/upload exigem super_admin (worker → 403)", async () => {
    svc = createWritingStyleService({ repo: fakeRepo(), audit: fakeAudit() });
    await expect(svc.get(worker, "w9")).rejects.toMatchObject({ status: 403 });
    await expect(
      svc.upload(worker, "w9", { filename: "e.md", contentMd: "x" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("trabalhador fora da org → 404 e não escreve", async () => {
    const repo = fakeRepo({ inOrg: false });
    svc = createWritingStyleService({ repo, audit: fakeAudit() });
    await expect(
      svc.upload(admin, "wX", { filename: "e.md", contentMd: "olá" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.saved).toBeNull();
  });

  it("get devolve null quando não há estilo", async () => {
    svc = createWritingStyleService({ repo: fakeRepo(), audit: fakeAudit() });
    expect(await svc.get(admin, "w9")).toBeNull();
  });

  it("upload válido: guarda, devolve vista e regista auditoria", async () => {
    const repo = fakeRepo();
    const audit = fakeAudit();
    svc = createWritingStyleService({ repo, audit });
    const view = await svc.upload(admin, "w9", { filename: "estilo.md", contentMd: "A minha voz." });
    expect(view.sourceFilename).toBe("estilo.md");
    expect(view.contentMd).toBe("A minha voz.");
    expect(repo.saved?.contentMd).toBe("A minha voz.");
    expect(audit.events[0]).toMatchObject({
      action: "writing_style.updated",
      entity: "user",
      entityId: "w9",
      actorId: "a1",
    });
  });

  it("upload inválido (não .md) → 400 e não escreve", async () => {
    const repo = fakeRepo();
    svc = createWritingStyleService({ repo, audit: fakeAudit() });
    await expect(
      svc.upload(admin, "w9", { filename: "estilo.txt", contentMd: "x" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.saved).toBeNull();
  });
});
