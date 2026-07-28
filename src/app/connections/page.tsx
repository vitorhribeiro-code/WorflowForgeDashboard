import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type SessionContext } from "@/lib/session";
import { ConnectionsPanel } from "@/modules/connections/ui/ConnectionsPanel";
import { WorkerTasksPanel } from "@/modules/assignments/ui/WorkerTasksPanel";
import { LogoutButton } from "../dashboard/logout-button";

// Server Component: verifica a sessão (como /dashboard) e monta o painel do
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

  return (
    <main className="worker-shell">
      <div className="worker-header">
        <h1>As minhas conexões</h1>
        <LogoutButton />
      </div>
      <p className="worker-sub">
        Autoriza aqui as ferramentas que as tuas tarefas precisam. Uma ferramenta ligada e
        com todas as permissões fica pronta para as automações correrem.
      </p>

      {banner && <div className={`conn-banner ${banner.tone}`}>{banner.text}</div>}

      {session.role === "worker" ? (
        <>
          <ConnectionsPanel />
          <section className="worker-section">
            <h2>As minhas tarefas</h2>
            <p className="worker-sub">
              Executa as automáticas quando precisares e acompanha o histórico; inicia as
              assistidas para acompanhares o progresso em direto.
            </p>
            <WorkerTasksPanel />
          </section>
        </>
      ) : (
        <div className="conn-empty">
          <p className="conn-empty-title">Esta área é do trabalhador</p>
          <p className="conn-empty-sub">
            As conexões são pessoais de cada trabalhador. Como super-utilizador, acompanha a
            prontidão das ligações na matriz de atribuições da consola.
          </p>
        </div>
      )}
    </main>
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
