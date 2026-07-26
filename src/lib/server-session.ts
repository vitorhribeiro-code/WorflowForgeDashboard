import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type Role, type SessionContext } from "@/lib/session";

// Reconstrói um Request só com o cookie de sessão, para reutilizar o getSession
// do M1 (stateless) a partir de Server Components. Mesmo padrão da /dashboard,
// centralizado aqui para não se repetir por página.
async function sessionFromCookies(): Promise<SessionContext | null> {
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;
  const req = new Request("http://localhost", {
    headers: { cookie: `session=${encodeURIComponent(token)}` },
  });
  try {
    return await getSession(req);
  } catch {
    return null;
  }
}

// Exige sessão válida com um dos papéis dados. Sem sessão → /login;
// papel errado → o painel do próprio papel (nunca 403 cru numa página).
export async function requireRole(...roles: Role[]): Promise<SessionContext> {
  const session = await sessionFromCookies();
  if (!session) redirect("/login");
  if (roles.length > 0 && !roles.includes(session.role)) {
    redirect(session.role === "super_admin" ? "/console" : "/dashboard");
  }
  return session;
}
