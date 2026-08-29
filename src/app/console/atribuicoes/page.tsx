import { requireRole } from "@/lib/server-session";
import { AtribuicoesTabs } from "./AtribuicoesTabs";

export default async function AssignmentsPage() {
  await requireRole("super_admin");
  return <AtribuicoesTabs />;
}
