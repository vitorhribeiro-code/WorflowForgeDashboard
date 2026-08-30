import { requireRole } from "@/lib/server-session";
import { getPreferencesService } from "@/modules/preferences/container";
import { ConsoleNav } from "./ConsoleNav";
import { ConsoleClock } from "./ConsoleClock";
import { ConsoleLogout } from "./ConsoleLogout";
import { ThemeSwitcher } from "./theme/ThemeSwitcher";
import { consoleThemesCss } from "./theme/consoleThemes";
import { Icon } from "./icons";

// Toda a consola é exclusiva do super_admin. Worker cai para /dashboard.
// O "topo" (moldura + cabeçalho + nav) vive AQUI, no layout, por isso é o mesmo
// em todas as páginas da consola.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("super_admin");
  // Tema lido no SERVER a partir da preferência. Aplicado como `data-theme` no
  // `.console` já no HTML inicial → sem flash. O `:root` do globals é fallback.
  const { consoleTheme } = await getPreferencesService().get(session);

  return (
    <div className="console" data-theme={consoleTheme}>
      {/* Fontes do redesign (só a consola as usa; ver globals `.console`). */}
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      {/* CSS dos 5 temas, scoped a `.console[data-theme]`. Injetado no server. */}
      <style dangerouslySetInnerHTML={{ __html: consoleThemesCss() }} />

      <div className="cx-shell">
        <header className="cx-header">
          <div className="cx-brand">
            <span className="cx-brandmark" aria-hidden>
              <Icon name="hexagon" size={22} />
            </span>
            <div>
              <div className="cx-brandname">Work Flow Forge</div>
              <div className="cx-brandsub">Configuração geral</div>
            </div>
          </div>
          <div className="cx-head-right">
            <ConsoleClock />
            <ThemeSwitcher initial={consoleTheme} />
            <ConsoleLogout />
          </div>
        </header>

        <ConsoleNav />

        <main className="console-main">{children}</main>
      </div>
    </div>
  );
}
