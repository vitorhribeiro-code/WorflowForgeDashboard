import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type SessionContext } from "@/lib/session";
import { getPreferencesService } from "@/modules/preferences/container";
import { DEFAULT_BACKGROUND, DEFAULT_MODE } from "@/modules/preferences/domain/preferences";
import { WorkerApp } from "./WorkerApp";

// Server Component: verifica a sessão (como /dashboard) e monta o shell do
// trabalhador. O resultado do callback OAuth chega por query (?connected / ?error)
// e é lido AQUI, no servidor, para evitar o pitfall do useSearchParams+Suspense
// no build do Next 15 (handoff §4).
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const token = (await cookies()).get("session")?.value;
  const req = new Request("http://localhost", {
    headers: token ? { cookie: `session=${encodeURIComponent(token)}` } : {},
  });

  let session: SessionContext;
  try {
    session = await getSession(req);
  } catch {
    redirect("/login");
  }

  const sp = await searchParams;
  const banner = bannerFor(sp);

  // O fundo pessoal é só dos trabalhadores; o super-utilizador vive na consola
  // escura. Resolve-se no servidor para aplicar já no 1.º render (sem flash).
  const prefs =
    session.role === "worker" ? await getPreferencesService().get(session) : null;
  const background = prefs ? prefs.background : DEFAULT_BACKGROUND;
  const mode = prefs ? prefs.mode : DEFAULT_MODE;

  return (
    <WorkerApp
      role={session.role}
      banner={banner}
      background={background}
      mode={mode}
    />
  );
}

function bannerFor(sp: {
  connected?: string;
  error?: string;
}): { tone: "ok" | "err"; text: string } | null {
  if (sp.connected) {
    return { tone: "ok", text: `Ligação concluída com ${sp.connected}.` };
  }
  if (sp.error) {
    return { tone: "err", text: errorMessage(sp.error) };
  }
  return null;
}

// Traduz os códigos de erro do redirect do callback para mensagens humanas.
function errorMessage(code: string): string {
  switch (code) {
    case "access_denied":
      return "Cancelaste o pedido de autorização. Podes tentar ligar de novo.";
    case "bad_callback":
      return "O pedido de autorização veio incompleto. Tenta ligar de novo.";
    case "state_invalid":
      return "O pedido de autorização expirou ou é inválido. Tenta de novo.";
    case "invalid_scopes":
      return "A ferramenta devolveu permissões inesperadas. Contacta o administrador.";
    default:
      return "Não foi possível concluir a ligação. Tenta de novo.";
  }
}
