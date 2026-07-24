import { DomainError } from "@/lib/errors";
import { toolService } from "../container";
import { createToolSchema, updateToolSchema } from "../validation/schemas";
import { json, readJson, withSession } from "./http";
import type { ToolAuthType } from "../domain/types";

// GET /api/tools — lista o catálogo (qualquer sessão autenticada).
export const toolsGET = withSession(async (session) => {
  return json(await toolService.list(session));
});

// POST /api/tools — cria Tool (admin).
export const toolsPOST = withSession(async (session, req) => {
  const input = await readJson(req, createToolSchema);
  const tool = await toolService.create(session, {
    key: input.key,
    name: input.name,
    authType: input.authType as ToolAuthType,
    availableScopes: input.availableScopes ?? [],
  });
  return json(tool, { status: 201 });
});

// GET /api/tools/[id] — detalhe.
export const toolGET = withSession(async (session, _req, ctx) => {
  return json(await toolService.get(session, requireId(ctx.params.id)));
});

// PATCH /api/tools/[id] — edita name/availableScopes (admin).
export const toolPATCH = withSession(async (session, req, ctx) => {
  const input = await readJson(req, updateToolSchema);
  const tool = await toolService.update(session, requireId(ctx.params.id), input);
  return json(tool);
});

function requireId(id: string | undefined): string {
  if (!id) throw new DomainError("BAD_INPUT", "id em falta", 400);
  return id;
}
