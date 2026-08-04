import { DomainError } from "@/lib/errors";
import { getAiRegistryService } from "../container";
import {
  createProviderSchema,
  setBindingSchema,
  updateProviderSchema,
} from "../validation/schemas";
import { json, readJson, withSession } from "./http";

function id(ctx: { params: Record<string, string> }): string {
  const v = ctx.params.id;
  if (!v) throw new DomainError("BAD_INPUT", "id em falta", 400);
  return v;
}

/* --- Providers ------------------------------------------------------------ */
export const providersGET = withSession(async (session) =>
  json(await getAiRegistryService().listProviders(session)),
);
export const providersPOST = withSession(async (session, req) => {
  const input = await readJson(req, createProviderSchema);
  return json(await getAiRegistryService().createProvider(session, input), { status: 201 });
});
export const providerPATCH = withSession(async (session, req, ctx) => {
  const input = await readJson(req, updateProviderSchema);
  return json(await getAiRegistryService().updateProvider(session, id(ctx), input));
});
export const providerDELETE = withSession(async (session, _req, ctx) => {
  await getAiRegistryService().removeProvider(session, id(ctx));
  return json({ ok: true });
});

/* --- Bindings ------------------------------------------------------------- */
export const bindingsGET = withSession(async (session) =>
  json(await getAiRegistryService().listBindings(session)),
);
// PUT: upsert por (org, capability) — definir a capacidade fixa o provider/model.
export const bindingsPUT = withSession(async (session, req) => {
  const input = await readJson(req, setBindingSchema);
  return json(await getAiRegistryService().setBinding(session, input));
});
export const bindingDELETE = withSession(async (session, _req, ctx) => {
  await getAiRegistryService().removeBinding(session, id(ctx));
  return json({ ok: true });
});
