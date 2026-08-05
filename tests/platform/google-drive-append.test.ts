import { describe, expect, it } from "vitest";
import { createGoogleDriveSdk } from "@/platform/cloud/google-drive";

/**
 * §5.2 Fatia B — appendText do Drive. Sem rede: um `fetch` fake encaminha por
 * URL (list por wffKey, get media, upload create/patch) e devolve respostas
 * canónicas. Cobre: criar quando não existe, acrescentar ao existente, e
 * idempotência por marker.
 */

type Call = { url: string; method: string; body?: string };

function driveFake(opts: { existingId?: string; existingContent?: string }) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = init?.body as unknown;
    const body =
      raw instanceof Uint8Array
        ? new TextDecoder().decode(raw)
        : raw != null
          ? String(raw)
          : undefined;
    calls.push({ url, method, body });

    // 1) Procura por wffKey (findByKey) → list de ficheiros.
    if (url.includes("/drive/v3/files?") && url.includes("appProperties") && method === "GET") {
      const files = opts.existingId ? [{ id: opts.existingId }] : [];
      return new Response(JSON.stringify({ files }), { status: 200 });
    }
    // 2) Ler conteúdo (files.get?alt=media).
    if (url.includes("alt=media") && method === "GET") {
      return new Response(opts.existingContent ?? "", { status: 200 });
    }
    // 3) Upload (create POST / update PATCH) → devolve id.
    if (url.includes("/upload/drive/v3/files")) {
      return new Response(JSON.stringify({ id: opts.existingId ?? "new-file" }), { status: 200 });
    }
    // ensureAppFolder (list folder / create folder) — só no caminho de criação.
    if (url.includes("/drive/v3/files") && method === "GET") {
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }
    if (url.includes("/drive/v3/files") && method === "POST") {
      return new Response(JSON.stringify({ id: "folder-1" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  const sdk = createGoogleDriveSdk({ httpFetch: fetchFn });
  return { sdk, calls };
}

const ARGS = {
  accessToken: "tok",
  rootFolderRef: "folder-root",
  filename: "resumos-semana-2026-W32.md",
  idempotencyKey: "weekly-summary:o1:w1:2026-W32",
  marker: "<!-- wff:2026-08-05T20:00:00.000Z -->",
  header: "# Resumos de emails — semana 2026-W32",
  block: "## 05/08, 20:00\n<!-- wff:2026-08-05T20:00:00.000Z -->\n- Ana — Fatura",
};

describe("Drive appendText", () => {
  it("cria o ficheiro quando não existe (header + bloco)", async () => {
    const { sdk, calls } = driveFake({});
    const res = await sdk.appendText(ARGS);
    expect(res.appended).toBe(true);
    const upload = calls.find((c) => c.url.includes("/upload/") && c.method === "POST");
    expect(upload).toBeTruthy();
    expect(upload!.body).toContain("# Resumos de emails");
    expect(upload!.body).toContain("- Ana — Fatura");
  });

  it("acrescenta ao ficheiro existente (PATCH com conteúdo antigo + novo)", async () => {
    const old = "# Resumos de emails — semana 2026-W32\n\n## 04/08, 08:00\n<!-- wff:antigo -->\n- X — Y\n";
    const { sdk, calls } = driveFake({ existingId: "file-1", existingContent: old });
    const res = await sdk.appendText(ARGS);
    expect(res.appended).toBe(true);
    const patch = calls.find((c) => c.url.includes("/upload/") && c.method === "PATCH");
    expect(patch).toBeTruthy();
    expect(patch!.body).toContain("<!-- wff:antigo -->"); // preservou o bloco anterior
    expect(patch!.body).toContain("- Ana — Fatura"); // acrescentou o novo
  });

  it("é idempotente: se o marker já lá está, não reescreve", async () => {
    const old = `# H\n\n## 05/08, 20:00\n${ARGS.marker}\n- Ana — Fatura\n`;
    const { sdk, calls } = driveFake({ existingId: "file-1", existingContent: old });
    const res = await sdk.appendText(ARGS);
    expect(res.appended).toBe(false);
    expect(calls.some((c) => c.url.includes("/upload/"))).toBe(false); // não escreveu
  });
});
