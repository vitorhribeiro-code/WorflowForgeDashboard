import { describe, it, expect, vi } from "vitest";
import {
  createMicrosoftGraphSdk,
  oneDriveFolderPath,
  oneDriveItemPath,
  graphEncodePath,
} from "@/platform/cloud/microsoft";

/** Response JSON (metadata / upload). */
function jsonRes(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => data,
    text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
  } as unknown as Response;
}

/** Response de texto (download de conteúdo). */
function textRes(text: string, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => ({}),
    text: async () => text,
  } as unknown as Response;
}

describe("oneDriveFolderPath / oneDriveItemPath", () => {
  it("usa a pasta-app default (sem barra inicial) quando não há rootFolderRef", () => {
    expect(oneDriveFolderPath(null, "WorkflowForge")).toBe("WorkflowForge");
    expect(oneDriveItemPath(null, "x.md", "WorkflowForge")).toBe("WorkflowForge/x.md");
  });
  it("usa o rootFolderRef e normaliza barras (sem inicial nem final)", () => {
    expect(oneDriveItemPath("/pasta/", "/x.md", "WorkflowForge")).toBe("pasta/x.md");
    expect(oneDriveItemPath("pasta", "x.md", "WorkflowForge")).toBe("pasta/x.md");
  });
});

describe("graphEncodePath", () => {
  it("codifica cada segmento mas preserva os '/'", () => {
    expect(graphEncodePath("WorkflowForge/relatório mensal.md")).toBe(
      "WorkflowForge/relat%C3%B3rio%20mensal.md",
    );
  });
});

describe("createMicrosoftGraphSdk.upload", () => {
  it("faz PUT para a pasta-app default e devolve o fileId; sem key → conflictBehavior=rename", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonRes({ id: "01ABC" });
    });
    const sdk = createMicrosoftGraphSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.upload({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "relatorio.md",
      mimeType: "text/markdown",
      bytes: new TextEncoder().encode("conteudo"),
    });

    expect(out).toEqual({ fileId: "01ABC" });
    const c = calls[0]!;
    expect((c.init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(c.init?.method).toBe("PUT");
    expect(c.url).toContain("root:/WorkflowForge/relatorio.md:/content");
    expect(c.url).toContain("conflictBehavior=rename");
  });

  it("com idempotencyKey → conflictBehavior=replace (upsert por path)", async () => {
    const calls: Array<{ url: string }> = [];
    const fetchFake = vi.fn(async (url: string | URL) => {
      calls.push({ url: String(url) });
      return jsonRes({ id: "01XYZ" });
    });
    const sdk = createMicrosoftGraphSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.upload({
      accessToken: "tok",
      rootFolderRef: "pasta-worker",
      filename: "relatorio-mensal-2026-07.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1, 2, 3]),
      idempotencyKey: "report.monthly:2026-07",
    });
    expect(out).toEqual({ fileId: "01XYZ" });
    expect(calls[0]!.url).toContain("root:/pasta-worker/relatorio-mensal-2026-07.md:/content");
    expect(calls[0]!.url).toContain("conflictBehavior=replace");
  });

  it("404 no PUT → garante a pasta (POST children) e repete uma vez", async () => {
    const seq: string[] = [];
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        seq.push("put");
        // 1.ª PUT falha (pai não existe), 2.ª passa.
        return seq.filter((s) => s === "put").length === 1
          ? jsonRes({}, 404)
          : jsonRes({ id: "01NEW" });
      }
      if (method === "POST" && u.includes("/children")) {
        seq.push("folder");
        return jsonRes({ id: "folderid" }, 201);
      }
      throw new Error(`inesperado: ${method} ${u}`);
    });
    const sdk = createMicrosoftGraphSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.upload({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "relatorio.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    });
    expect(out).toEqual({ fileId: "01NEW" });
    expect(seq).toEqual(["put", "folder", "put"]);
  });

  it("mapeia 5xx como status e 401 como permanente", async () => {
    const make = (status: number) =>
      createMicrosoftGraphSdk({
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
    const sdk = createMicrosoftGraphSdk({
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
    const sdk = createMicrosoftGraphSdk({
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

describe("createMicrosoftGraphSdk.signedUrl", () => {
  it("lê o @microsoft.graph.downloadUrl e devolve-o com expiração", async () => {
    const fetchFake = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("/me/drive/items/01ABC");
      return jsonRes({
        id: "01ABC",
        "@microsoft.graph.downloadUrl": "https://xyz.sharepoint.com/download/abc",
      });
    });
    const sdk = createMicrosoftGraphSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const target = await sdk.signedUrl("tok", "01ABC");
    expect(target.url).toBe("https://xyz.sharepoint.com/download/abc");
    expect(target.expiresAt).toBeInstanceOf(Date);
  });

  it("sem downloadUrl → 502", async () => {
    const sdk = createMicrosoftGraphSdk({
      httpFetch: (async () => jsonRes({ id: "01ABC" })) as unknown as typeof fetch,
    });
    await expect(sdk.signedUrl("tok", "01ABC")).rejects.toMatchObject({ status: 502 });
  });
});

describe("createMicrosoftGraphSdk.appendText", () => {
  it("cria de raiz quando o ficheiro não existe (content 404)", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if ((init?.method ?? "GET") === "GET" && u.includes(":/content")) return textRes("", 404);
      return jsonRes({ id: "01NOVO" }); // PUT
    });
    const sdk = createMicrosoftGraphSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.appendText({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "semana.md",
      idempotencyKey: "k",
      marker: "M1",
      header: "# Semana",
      block: "- entrada 1",
    });
    expect(out).toEqual({ fileId: "01NOVO", appended: true });
    const put = calls.find((c) => c.init?.method === "PUT")!;
    const body = new TextDecoder().decode(put.init?.body as Uint8Array);
    expect(body).toContain("# Semana");
    expect(body).toContain("- entrada 1");
    expect(put.url).toContain("conflictBehavior=replace");
  });

  it("acrescenta o bloco quando o marker ainda não está no ficheiro", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if ((init?.method ?? "GET") === "GET" && u.includes(":/content")) {
        return textRes("# Semana\n\n- antiga");
      }
      return jsonRes({ id: "01EXIST" }); // PUT
    });
    const sdk = createMicrosoftGraphSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.appendText({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "semana.md",
      idempotencyKey: "k",
      marker: "NOVO",
      header: "# Semana",
      block: "- NOVO bloco",
    });
    expect(out).toEqual({ fileId: "01EXIST", appended: true });
    const put = calls.find((c) => c.init?.method === "PUT")!;
    const body = new TextDecoder().decode(put.init?.body as Uint8Array);
    expect(body).toContain("- antiga");
    expect(body).toContain("- NOVO bloco");
  });

  it("não duplica quando o marker já lá está (appended=false, sem PUT)", async () => {
    const fetchFake = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "PUT") throw new Error("não devia fazer PUT");
      if (u.includes(":/content")) return textRes("# Semana\n\n- já continha MARK aqui");
      // getItemId (meta) → devolve o id
      return jsonRes({ id: "01EXIST" });
    });
    const sdk = createMicrosoftGraphSdk({ httpFetch: fetchFake as unknown as typeof fetch });
    const out = await sdk.appendText({
      accessToken: "tok",
      rootFolderRef: null,
      filename: "semana.md",
      idempotencyKey: "k",
      marker: "MARK",
      header: "# Semana",
      block: "- ignorado",
    });
    expect(out).toEqual({ fileId: "01EXIST", appended: false });
    expect(fetchFake).toHaveBeenCalledTimes(2); // content GET + meta GET, sem PUT
  });
});
