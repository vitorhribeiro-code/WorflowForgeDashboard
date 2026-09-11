import { describe, it, expect, vi } from "vitest";
import {
  createDropboxSdk,
  dropboxApiArg,
  dropboxFilePath,
} from "@/platform/cloud/dropbox";

function jsonRes(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => null },
    json: async () => data,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

/** Resposta binária (download) com o header dropbox-api-result. */
function binRes(text: string, meta: unknown, status = 200) {
  const bytes = new TextEncoder().encode(text);
  return {
    ok: status < 400,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === "dropbox-api-result" ? JSON.stringify(meta) : null) },
    json: async () => ({}),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

function argOf(init?: RequestInit): Record<string, unknown> {
  const arg = (init?.headers as Record<string, string>)["dropbox-api-arg"]!;
  return JSON.parse(arg) as Record<string, unknown>;
}

describe("dropboxApiArg", () => {
  it("escapa não-ASCII para \\uXXXX (headers HTTP são ASCII)", () => {
    const arg = dropboxApiArg({ path: "/relatório.md" });
    expect(arg).not.toMatch(/[\u007f-\uffff]/);
    expect(arg).toContain("\\u00f3"); // ó
  });
});

describe("dropboxFilePath", () => {
  it("usa a pasta-app default quando não há rootFolderRef", () => {
    expect(dropboxFilePath(null, "x.md", "/WorkflowForge")).toBe("/WorkflowForge/x.md");
  });
  it("usa o rootFolderRef e normaliza barras", () => {
    expect(dropboxFilePath("/pasta/", "/x.md", "/WorkflowForge")).toBe("/pasta/x.md");
    expect(dropboxFilePath("pasta", "x.md", "/WorkflowForge")).toBe("/pasta/x.md");
  });
});

describe("createDropboxSdk.upload", () => {
  it("faz upload para a pasta-app default e devolve o fileId", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonRes({ id: "id:abc123", name: "relatorio.md" });
    });
    const sdk = createDropboxSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.upload({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "relatorio.md",
      mimeType: "text/markdown",
      bytes: new TextEncoder().encode("conteudo"),
    });

    expect(out).toEqual({ fileId: "id:abc123" });
    // Token e path corretos; sem idempotencyKey → mode add + autorename.
    const c = calls[0]!;
    expect((c.init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const arg = argOf(c.init);
    expect(arg.path).toBe("/WorkflowForge/relatorio.md");
    expect(arg.mode).toBe("add");
    expect(arg.autorename).toBe(true);
  });

  it("com idempotencyKey → mode overwrite (upsert por path)", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    const fetchFake = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      calls.push({ init });
      return jsonRes({ id: "id:xyz" });
    });
    const sdk = createDropboxSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.upload({
      accessToken: "tok",
      rootFolderRef: "/pasta-worker",
      filename: "relatorio-mensal-2026-07.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1, 2, 3]),
      idempotencyKey: "report.monthly:2026-07",
    });
    expect(out).toEqual({ fileId: "id:xyz" });
    const arg = argOf(calls[0]!.init);
    expect(arg.path).toBe("/pasta-worker/relatorio-mensal-2026-07.md");
    expect(arg.mode).toBe("overwrite");
    expect(arg.autorename).toBe(false);
  });

  it("mapeia 5xx como transitório e 401 como permanente", async () => {
    const make = (status: number) =>
      createDropboxSdk({
        httpFetch: (async () => jsonRes({}, status)) as unknown as typeof fetch,
      });
    const args = {
      accessToken: "t",
      rootFolderRef: null,
      filename: "x.md",
      mimeType: null,
      bytes: new Uint8Array([1]),
    };
    await expect(make(503).upload(args)).rejects.toMatchObject({ status: 503 });
    await expect(make(401).upload(args)).rejects.toMatchObject({ status: 401 });
  });

  it("falha de rede → transitório", async () => {
    const sdk = createDropboxSdk({
      httpFetch: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    await expect(
      sdk.upload({
        accessToken: "t",
        rootFolderRef: null,
        filename: "x.md",
        mimeType: null,
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ transient: true });
  });

  it("resposta sem id → 502 permanente", async () => {
    const sdk = createDropboxSdk({
      httpFetch: (async () => jsonRes({ name: "x" })) as unknown as typeof fetch,
    });
    await expect(
      sdk.upload({
        accessToken: "t",
        rootFolderRef: null,
        filename: "x.md",
        mimeType: null,
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe("createDropboxSdk.signedUrl", () => {
  it("pede um temporary link e devolve-o com expiração", async () => {
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("get_temporary_link");
      expect(JSON.parse(String(init?.body))).toEqual({ path: "id:abc" });
      return jsonRes({ link: "https://dl.dropboxusercontent.com/abc" });
    });
    const sdk = createDropboxSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const target = await sdk.signedUrl("tok", "id:abc");
    expect(target.url).toBe("https://dl.dropboxusercontent.com/abc");
    expect(target.expiresAt).toBeInstanceOf(Date);
  });
});

describe("createDropboxSdk.appendText", () => {
  it("cria de raiz quando o ficheiro não existe (download 409)", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes("/download")) return jsonRes({}, 409); // não existe
      return jsonRes({ id: "id:novo" }); // upload
    });
    const sdk = createDropboxSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.appendText({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "semana.md",
      idempotencyKey: "k",
      marker: "M1",
      header: "# Semana",
      block: "- entrada 1",
    });
    expect(out).toEqual({ fileId: "id:novo", appended: true });
    const upload = calls.find((c) => c.url.includes("/upload"))!;
    const body = new TextDecoder().decode(upload.init?.body as Uint8Array);
    expect(body).toContain("# Semana");
    expect(body).toContain("- entrada 1");
    expect(argOf(upload.init).mode).toBe("overwrite");
  });

  it("acrescenta o bloco quando o marker ainda não está no ficheiro", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes("/download")) return binRes("# Semana\n\n- antiga", { id: "id:exist" });
      return jsonRes({ id: "id:exist" });
    });
    const sdk = createDropboxSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.appendText({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "semana.md",
      idempotencyKey: "k",
      marker: "NOVO",
      header: "# Semana",
      block: "- NOVO bloco",
    });
    expect(out).toEqual({ fileId: "id:exist", appended: true });
    const upload = calls.find((c) => c.url.includes("/upload"))!;
    const body = new TextDecoder().decode(upload.init?.body as Uint8Array);
    expect(body).toContain("- antiga");
    expect(body).toContain("- NOVO bloco");
  });

  it("não duplica quando o marker já lá está (appended=false, sem upload)", async () => {
    const fetchFake = vi.fn(async (url: string | URL) => {
      if (String(url).includes("/download")) {
        return binRes("# Semana\n\n- já continha MARK aqui", { id: "id:exist" });
      }
      throw new Error("não devia fazer upload");
    });
    const sdk = createDropboxSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.appendText({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "semana.md",
      idempotencyKey: "k",
      marker: "MARK",
      header: "# Semana",
      block: "- ignorado",
    });
    expect(out).toEqual({ fileId: "id:exist", appended: false });
    expect(fetchFake).toHaveBeenCalledTimes(1); // só o download
  });
});
