// Superfície pública do M1.
export { authService, SESSION_TTL_SECONDS } from "./container";
export type { AuthService } from "./service/auth.service";
export type { LoginResult } from "./domain/types";
// getSession real vive em @/lib/session (usado por todos os módulos).
export { getSession } from "@/lib/session";
export type { SessionContext, Role } from "@/lib/session";
