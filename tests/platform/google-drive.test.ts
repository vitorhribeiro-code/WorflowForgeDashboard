import { describe, it, expect, vi } from "vitest";
import {
  buildMultipartBody,
  createGoogleDriveSdk,
} from "@/platform/cloud/google-drive";

function jsonRes(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => data,
  } as unknown as Response;
}

/** Decodifica um body (Uint8Array/string) para inspeção nos asserts. */
function bodyText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return String(body);
}

describe("buildMultipartBody", () => {
  it("inclui metadata JSON e a media, com boundary no content-type", () => {
    const { body, contentType } = buildMultipartBody(
      { name: "x.md", parents: ["folder1"] },
      "text/markdown",
      new TextEncoder().encode("olá"),
    );
    const text = new TextDecoder().decode(body);
    expect(contentType).toMatch(/^multipart\/related; boundary=/);
    expect(text).toContain('"name":"x.md"');
    expect(text).toContain('"parents":["folder1"]');
    expect(text).toContain("text/markdown");
    expect(text).toContain("olá");
  });
});

describe("createGoogleDriveSdk.upload", () => {
  it("garante a pasta-app (list vazio → cria) e faz upload multipart para lá", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes("/upload/drive/")) return jsonRes({ id: "file-123" });
      if (init?.method === "POST") return jsonRes({ id: "folder-new" }); // criar pasta
      return jsonRes({ files: [] }); // list: nenhuma pasta ainda
    });

    const sdk = createGoogleDriveSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.upload({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "resumo.md",
      mimeType: "text/markdown",
      bytes: new TextEncoder().encode("conteudo"),
    });

    expect(out).toEqual({ fileId: "file-123" });
    // Token no header em todas as chamadas.
    for (const c of calls) {
      expect((c.init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
    }
    // A pasta criada foi usada como parent do upload.
    const uploadCall = calls.find((c) => c.url.includes("/upload/drive/"))!;
    expect(bodyText(uploadCall.init?.body)).toContain('"parents":["folder-new"]');
  });

  it("usa o rootFolderRef quando existe (sem list/create de pasta)", async () => {
    const fetchFake = vi.fn(async (url: string | URL) => {
      if (String(url).includes("/upload/drive/")) return jsonRes({ id: "f9" });
      return jsonRes({}); // não deve ser chamado para pasta
    });
    const sdk = createGoogleDriveSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.upload({
      accessToken: "tok",
      rootFolderRef: "pasta-do-worker",
      filename: "x.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(out).toEqual({ fileId: "f9" });
    // Só uma chamada: o upload (não houve ensure de pasta).
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it("reencontra a pasta-app existente sem a recriar", async () => {
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/upload/drive/")) return jsonRes({ id: "file-1" });
      if (init?.method === "POST") throw new Error("não devia criar pasta");
      return jsonRes({ files: [{ id: "folder-existente", name: "WorkflowForge" }] });
    });
    const sdk = createGoogleDriveSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.upload({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "x.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([9]),
    });
    expect(out).toEqual({ fileId: "file-1" });
  });

  it("mapeia 5xx como transitório e 401 como permanente", async () => {
    const make = (status: number) =>
      createGoogleDriveSdk({
        httpFetch: (async () => jsonRes({}, status)) as unknown as typeof fetch,
      });
    // rootFolderRef definido → a 1.ª chamada é logo o upload.
    const args = {
      accessToken: "t",
      rootFolderRef: "p",
      filename: "x",
      mimeType: null,
      bytes: new Uint8Array([1]),
    };
    await expect(make(503).upload(args)).rejects.toMatchObject({ status: 503 });
    await expect(make(401).upload(args)).rejects.toMatchObject({ status: 401 });
  });

  it("falha de rede → transitório", async () => {
    const sdk = createGoogleDriveSdk({
      httpFetch: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    await expect(
      sdk.upload({
        accessToken: "t",
        rootFolderRef: "p",
        filename: "x",
        mimeType: null,
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ transient: true });
  });

  it("signedUrl devolve um link de visualização do Drive", async () => {
    const sdk = createGoogleDriveSdk();
    const target = await sdk.signedUrl("tok", "abc123");
    expect(target.url).toBe("https://drive.google.com/file/d/abc123/view");
  });
});
