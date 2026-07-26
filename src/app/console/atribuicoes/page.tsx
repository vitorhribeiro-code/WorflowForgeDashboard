import { requireRole } from "@/lib/server-session";
import { MatrixSection } from "./MatrixSection";

export default async function AssignmentsPage() {
  await requireRole("super_admin");
  return <MatrixSection />;
}
