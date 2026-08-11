import { requireRole } from "@/lib/server-session";
import { TrabalhadoresSection } from "./TrabalhadoresSection";

export default async function TrabalhadoresPage() {
  await requireRole("super_admin");
  return <TrabalhadoresSection />;
}
