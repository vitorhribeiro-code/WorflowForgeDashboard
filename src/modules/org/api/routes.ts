import { DomainError } from "@/lib/errors";
import { areaService, organizationService, userService } from "../container";
import {
  createAreaSchema,
  inviteUserSchema,
  renameOrgSchema,
  updateAreaSchema,
  updateUserSchema,
} from "../validation/schemas";
import { json, readJson, withSession } from "./http";

function id(ctx: { params: Record<string, string> }): string {
  const v = ctx.params.id;
  if (!v) throw new DomainError("BAD_INPUT", "id em falta", 400);
  return v;
}

/* --- Organização ---------------------------------------------------------- */
export const organizationGET = withSession(async (session) => json(await organizationService.get(session)));
export const organizationPATCH = withSession(async (session, req) => {
  const { name } = await readJson(req, renameOrgSchema);
  return json(await organizationService.rename(session, name));
});

/* --- Áreas ---------------------------------------------------------------- */
export const areasGET = withSession(async (session) => json(await areaService.list(session)));
export const areasPOST = withSession(async (session, req) => {
  const input = await readJson(req, createAreaSchema);
  return json(await areaService.create(session, { name: input.name, description: input.description ?? null }), {
    status: 201,
  });
});
export const areaPATCH = withSession(async (session, req, ctx) => {
  const input = await readJson(req, updateAreaSchema);
  return json(await areaService.update(session, id(ctx), input));
});
export const areaDELETE = withSession(async (session, _req, ctx) => {
  await areaService.remove(session, id(ctx));
  return json({ ok: true });
});

/* --- Utilizadores --------------------------------------------------------- */
export const usersGET = withSession(async (session) => json(await userService.list(session)));
export const usersPOST = withSession(async (session, req) => {
  const input = await readJson(req, inviteUserSchema);
  return json(await userService.invite(session, input), { status: 201 });
});
// PATCH aceita { role? , suspended? }.
export const userPATCH = withSession(async (session, req, ctx) => {
  const input = await readJson(req, updateUserSchema);
  const userId = id(ctx);
  if (input.role !== undefined) await userService.changeRole(session, userId, input.role);
  if (input.suspended === true) await userService.deactivate(session, userId);
  if (input.suspended === false) await userService.reactivate(session, userId);
  return json({ ok: true });
});
