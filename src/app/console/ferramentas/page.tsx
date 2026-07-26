import { requireRole } from "@/lib/server-session";
import { ToolsSection } from "./ToolsSection";

export default async function ToolsPage() {
  await requireRole("super_admin");
  return <ToolsSection />;
}
