import { requireRole } from "@/lib/server-session";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { getPreferencesService } from "@/modules/preferences/container";
import { ConsoleNav } from "./ConsoleNav";
import { ThemeSwitcher } from "./theme/ThemeSwitcher";
import { consoleThemesCss } from "./theme/consoleThemes";

// Toda a consola é exclusiva do super_admin. Worker cai para /dashboard.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("super_admin");
  // Tema lido no SERVER a partir da preferência (normalizePreferences garante um
  // valor válido). Aplicado como `data-theme` no `.console` já no HTML inicial
  // → sem flash de cor. O `:root` do globals.css continua a ser o fallback.
  const { consoleTheme } = await getPreferencesService().get(session);

  return (
    <div className="console" data-theme={consoleTheme}>
      {/* CSS dos 5 temas, scoped a `.console[data-theme]` (nunca `.wf-app`).
          Gerado a partir do mapa de tokens em TS (fonte única) e injetado uma
          vez no server. Valores 100% internos → seguro. */}
      <style dangerouslySetInnerHTML={{ __html: consoleThemesCss() }} />
      <header className="console-header">
        <div>
          <span className="console-brand">WorkflowForge</span>
          <span className="console-sub">Consola do super-utilizador</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeSwitcher initial={consoleTheme} />
          <LogoutButton />
        </div>
      </header>
      <ConsoleNav />
      <main className="console-main">{children}</main>
    </div>
  );
}
