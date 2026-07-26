import { DomainError } from "@/lib/errors";
import { authService, buildSetPasswordUrl, SESSION_TTL_SECONDS } from "../container";
import {
  confirmResetSchema,
  loginSchema,
  requestResetSchema,
} from "../validation/schemas";
import {
  clearSessionCookie,
  handler,
  json,
  readJson,
  sessionCookie,
  withSession,
} from "./http";

// POST /api/auth/login — cria sessão e devolve cookie HttpOnly + redirect.
export const loginPOST = handler(async (req) => {
  const input = await readJson(req, loginSchema);
  const result = await authService.login(input);
  return json(
    { redirect: result.redirect, user: result.session },
    { headers: { "set-cookie": sessionCookie(result.token, SESSION_TTL_SECONDS) } },
  );
});

// POST /api/auth/logout — limpa o cookie (idempotente).
export const logoutPOST = handler(async (req) => {
  const cookie = req.headers.get("cookie") ?? "";
  const token = /(?:^|;\s*)session=([^;]+)/.exec(cookie)?.[1] ?? null;
  await authService.logout(token ? decodeURIComponent(token) : null);
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});

// POST /api/auth/password-reset — pede link (resposta genérica).
export const requestResetPOST = handler(async (req) => {
  const { email } = await readJson(req, requestResetSchema);
  await authService.requestPasswordReset(email);
  return json({ ok: true }); // nunca revela se o email existe
});

// POST /api/auth/password-reset/confirm — define nova password.
export const confirmResetPOST = handler(async (req) => {
  const { token, password } = await readJson(req, confirmResetSchema);
  await authService.resetPassword(token, password);
  return json({ ok: true });
});

// POST /api/users/[id]/set-password-link — admin gera um link de acesso (convite
// manual / reenvio) para um utilizador da sua org. Devolve o URL para entregar
// à pessoa. Montada sob /api/users/[id] mas servida pelo M1 (dono das credenciais).
export const setPasswordLinkPOST = withSession(async (session, _req, ctx) => {
  const userId = ctx.params.id;
  if (!userId) throw new DomainError("BAD_INPUT", "id em falta", 400);
  const { token, expiresAt } = await authService.issueSetPasswordToken(session, userId);
  return json({ url: buildSetPasswordUrl(token), expiresAt });
});
