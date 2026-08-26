import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type SessionContext } from "@/lib/session";
import { getPreferencesService } from "@/modules/preferences/container";
import {
  DEFAULT_BACKGROUND,
  DEFAULT_MODE,
  DEFAULT_FONT,
  fontOptionFor,
} from "@/modules/preferences/domain/preferences";
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

  // As prefs resolvem-se no servidor (aplica já no 1.º render, sem flash).
  // Lê-se para ambos os papéis: o fundo/modo/fonte são só do trabalhador, mas o
  // super-utilizador precisa do `consoleTheme` para o seletor nas Definições.
  const prefs = await getPreferencesService().get(session);
  const isWorker = session.role === "worker";
  const background = isWorker ? prefs.background : DEFAULT_BACKGROUND;
  const mode = isWorker ? prefs.mode : DEFAULT_MODE;
  const customBackground = isWorker ? prefs.customBackground : null;
  const customTokens = isWorker ? prefs.customTokens : null;
  const font = isWorker ? prefs.font : DEFAULT_FONT;
  const consoleTheme = prefs.consoleTheme;
  // <link> inicial da fonte escolhida (sem flash no 1.º render; o cliente
  // mantém-no em sincronia nas trocas). "default" usa a fonte base, sem link.
  const fontHref = fontOptionFor(font).href;

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <WorkerApp
        role={session.role}
        banner={banner}
        background={background}
        mode={mode}
        font={font}
        customBackground={customBackground}
        customTokens={customTokens}
        consoleTheme={consoleTheme}
      />
    </>
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
