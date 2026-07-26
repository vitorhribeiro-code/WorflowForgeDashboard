import { requireRole } from "@/lib/server-session";
import { AreasSection } from "./AreasSection";

export default async function AreasPage() {
  await requireRole("super_admin");
  return <AreasSection />;
}
