import type { Role, SessionContext } from "@/lib/session";

export type AuthUser = {
  id: string;
  orgId: string;
  role: Role;
  suspended: boolean; // (migração recomendada; hoje sempre false)
};

export type LoginResult = {
  token: string;
  session: SessionContext;
  redirect: string; // por role: super_admin → consola; worker → painel
};

export function redirectForRole(role: Role): string {
  // Worker aterra no seu painel (M6): "As minhas conexões". Admin → consola.
  return role === "super_admin" ? "/console" : "/connections";
}
