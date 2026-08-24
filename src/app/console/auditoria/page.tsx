import { requireRole } from "@/lib/server-session";
import { AuditoriaSection } from "./AuditoriaSection";

// Auditoria + métricas operacionais. Exclusivo do super_admin (M10).
export default async function AuditoriaPage() {
  await requireRole("super_admin");
  return <AuditoriaSection />;
}
