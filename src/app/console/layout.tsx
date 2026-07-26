import { requireRole } from "@/lib/server-session";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { ConsoleNav } from "./ConsoleNav";

// Toda a consola é exclusiva do super_admin. Worker cai para /dashboard.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireRole("super_admin");
  return (
    <div className="console">
      <header className="console-header">
        <div>
          <span className="console-brand">WorkflowForge</span>
          <span className="console-sub">Consola do super-utilizador</span>
        </div>
        <LogoutButton />
      </header>
      <ConsoleNav />
      <main className="console-main">{children}</main>
    </div>
  );
}
