"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

// Nav da consola — carril de ÍCONES (redesign). Rótulos passam a tooltip/aria
// (title + aria-label) para não perder acessibilidade nem descoberta. Rotas e
// lógica de "ativo" inalteradas.
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/console", label: "Visão geral", icon: "layout-dashboard" },
  { href: "/console/areas", label: "Áreas", icon: "layout-grid" },
  { href: "/console/ferramentas", label: "Ferramentas", icon: "wrench" },
  { href: "/console/mapeamento", label: "Mapeamento", icon: "upload" },
  { href: "/console/tarefas", label: "Catálogo", icon: "library" },
  { href: "/console/atribuicoes", label: "Atribuições", icon: "user-cog" },
  { href: "/console/trabalhadores", label: "Trabalhadores", icon: "users" },
  { href: "/console/ia", label: "IA / Modelos", icon: "cpu" },
  { href: "/console/auditoria", label: "Auditoria", icon: "activity" },
];

export function ConsoleNav() {
  const pathname = usePathname();
  return (
    <nav className="cx-nav" aria-label="Navegação da consola">
      {TABS.map((t) => {
        const active =
          t.href === "/console" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={active ? "active" : ""}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
            title={t.label}
          >
            <Icon name={t.icon} size={17} />
          </Link>
        );
      })}
    </nav>
  );
}
