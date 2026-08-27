"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string }[] = [
  { href: "/console", label: "Visão geral" },
  { href: "/console/areas", label: "Áreas" },
  { href: "/console/ferramentas", label: "Ferramentas" },
  { href: "/console/mapeamento", label: "Mapeamento" },
  { href: "/console/tarefas", label: "Catálogo" },
  { href: "/console/atribuicoes", label: "Atribuições" },
  { href: "/console/trabalhadores", label: "Trabalhadores" },
  { href: "/console/ia", label: "IA / Modelos" },
  { href: "/console/auditoria", label: "Auditoria" },
];

export function ConsoleNav() {
  const pathname = usePathname();
  return (
    <nav className="console-nav">
      {TABS.map((t) => {
        const active = t.href === "/console" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={active ? "active" : ""}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
