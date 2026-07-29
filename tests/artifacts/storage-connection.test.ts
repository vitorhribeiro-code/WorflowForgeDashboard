import { describe, it, expect, vi } from "vitest";
import {
  createM6StorageConnectionBridge,
  defaultCloudSdkRegistry,
  type TokenResolver,
} from "@/modules/artifacts/infra/storage-connection.m6";

type Row = { toolKey: string; rootFolderRef: string | null; grantedScopes: string[] };

/** Fake mínimo do encadeamento Drizzle usado pela ponte (resolve num array). */
function fakeDb(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "innerJoin", "where"]) {
    chain[m] = () => chain;
  }
  chain.orderBy = async () => rows;
  return chain as never;
}

function tokenResolver(token: string | null): TokenResolver {
  return { getAccessToken: vi.fn(async () => token) };
}

const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";

describe("createM6StorageConnectionBridge", () => {
  it("escolhe a conexão de cloud ligada, computa writeScope e resolve o token", async () => {
    const bridge = createM6StorageConnectionBridge(
      fakeDb([{ toolKey: "google", rootFolderRef: null, grantedScopes: [DRIVE_FILE, "gmail.readonly"] }]),
      tokenResolver("tok-123"),
    );
    const conn = await bridge.getStorageConnection("w1");
    expect(conn).toEqual({
      toolKey: "google",
      rootFolderRef: null,
      writeScope: true,
      accessToken: "tok-123",
    });
  });

  it("writeScope=false quando não há scope de escrita", async () => {
    const bridge = createM6StorageConnectionBridge(
      fakeDb([{ toolKey: "google", rootFolderRef: null, grantedScopes: ["gmail.readonly"] }]),
      tokenResolver("tok"),
    );
    const conn = await bridge.getStorageConnection("w1");
    expect(conn?.writeScope).toBe(false);
  });

  it("devolve null quando não há nenhuma cloud conhecida ligada", async () => {
    const bridge = createM6StorageConnectionBridge(fakeDb([]), tokenResolver("tok"));
    expect(await bridge.getStorageConnection("w1")).toBeNull();
  });

  it("propaga accessToken null (conexão expirada/revogada)", async () => {
    const bridge = createM6StorageConnectionBridge(
      fakeDb([{ toolKey: "google", rootFolderRef: "raiz", grantedScopes: [DRIVE_FILE] }]),
      tokenResolver(null),
    );
    const conn = await bridge.getStorageConnection("w1");
    expect(conn).toMatchObject({ rootFolderRef: "raiz", accessToken: null });
  });
});

describe("defaultCloudSdkRegistry", () => {
  it("devolve um SDK para google e undefined para o resto", () => {
    expect(defaultCloudSdkRegistry("google")).toBeDefined();
    expect(defaultCloudSdkRegistry("dropbox")).toBeUndefined();
  });
});
