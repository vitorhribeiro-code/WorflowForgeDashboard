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
  return role === "super_admin" ? "/console" : "/";
}
