import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type SessionContext } from "@/lib/session";
import { LogoutButton } from "./logout-button";

// Server Component: lê o cookie de sessão, verifica-o e mostra o contexto.
// Sem sessão válida → /login. É a prova da cadeia login → cookie → página.
export default async function DashboardPage() {
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

  return (
    <main className="dash">
      <h1>Painel</h1>
      <p className="muted">Sessão ativa. Isolamento por organização garantido pelo orgId.</p>

      <div className="kv">
        <div>
          <span className="k">Papel</span>
          <span className="v">{session.role}</span>
        </div>
        <div>
          <span className="k">User ID</span>
          <span className="v">{session.userId}</span>
        </div>
        <div>
          <span className="k">Org ID</span>
          <span className="v">{session.orgId}</span>
        </div>
      </div>

      <LogoutButton />
    </main>
  );
}
