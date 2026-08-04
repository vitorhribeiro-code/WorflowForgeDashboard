import { requireRole } from "@/lib/server-session";
import { IaSection } from "./IaSection";

export default async function IaPage() {
  await requireRole("super_admin");
  return <IaSection />;
}
