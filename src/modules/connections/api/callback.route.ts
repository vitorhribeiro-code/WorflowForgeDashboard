/**
 * Callback OAuth — GET /api/connections/callback?state&code[&error].
 *
 * NÃO usa sessão: a identidade (workerId, toolId) viaja no `state` assinado
 * (HMAC), que a service verifica. É um controlador de redirect (browser flow):
 * conclui a troca de tokens e reencaminha o trabalhador para o painel, com um
 * parâmetro de resultado. Nunca devolve tokens ao cliente.
 */
import { toHttp } from "@/lib/errors";
import { loadEnv } from "@/platform/config/env";
import { getConnectionsService } from "../container";
import { callbackQuerySchema } from "../validation/connections.schema";

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } });
}

export async function connectionsCallbackGET(req: Request): Promise<Response> {
  const base = loadEnv().APP_BASE_URL;
  const panel = new URL("/connections", base);

  const parsed = callbackQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries()),
  );
  if (!parsed.success) {
    panel.searchParams.set("error", "bad_callback");
    return redirect(panel.toString());
  }

  const { state, code, error } = parsed.data;

  // O provider recusou o consentimento (ex.: utilizador cancelou).
  if (error) {
    panel.searchParams.set("error", error);
    return redirect(panel.toString());
  }
  if (!state || !code) {
    panel.searchParams.set("error", "bad_callback");
    return redirect(panel.toString());
  }

  try {
    const view = await getConnectionsService().completeConnection({ state, code });
    panel.searchParams.set("connected", view.toolKey);
    return redirect(panel.toString());
  } catch (err) {
    // Traduz o erro de domínio só para dar um código legível no redirect.
    const { body } = toHttp(err);
    panel.searchParams.set("error", body.error);
    return redirect(panel.toString());
  }
}
