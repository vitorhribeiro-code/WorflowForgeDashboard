import { requireRole } from "@/lib/server-session";
import { TasksSection } from "./TasksSection";

export default async function TasksPage() {
  await requireRole("super_admin");
  return <TasksSection />;
}
