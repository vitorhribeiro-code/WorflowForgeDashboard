import { requireRole } from "@/lib/server-session";
import { MapeamentoSection } from "./MapeamentoSection";

// Importar mapeamento → rever candidatos → converter em Tarefas do catálogo.
// Exclusivo do super_admin (M11). O documento não é persistido.
export default async function MapeamentoPage() {
  await requireRole("super_admin");
  return <MapeamentoSection />;
}
