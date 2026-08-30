import Link from "next/link";
import { Icon, type IconName } from "./icons";

// Aterragem do admin: um cartão-atalho por secção da consola. A ordem segue o
// fluxo de configuração. `span2` marca os dois cartões largos do topo;
// `featured` dá o realce (gradiente + acento) ao primeiro; `hue` é a cor
// decorativa do ícone (identidade por cartão, fixa entre temas).
const CARDS: {
  href: string;
  label: string;
  icon: IconName;
  hue: string;
  span2?: boolean;
  featured?: boolean;
}[] = [
  { href: "/console/areas", label: "Utilizador & Grupos", icon: "layout-grid", hue: "var(--accent)", span2: true, featured: true },
  { href: "/console/ferramentas", label: "Ferramentas e Conectores", icon: "wrench", hue: "#ffc24d", span2: true },
  { href: "/console/mapeamento", label: "Carregar perfil user", icon: "upload", hue: "#4db2ff" },
  { href: "/console/tarefas", label: "Catálogo", icon: "library", hue: "#a98bff" },
  { href: "/console/atribuicoes", label: "Equipar user", icon: "user-cog", hue: "#ff7ea8" },
  { href: "/console/trabalhadores", label: "Users", icon: "users", hue: "#3fd6c0" },
  { href: "/console/ia", label: "IA / Modelos", icon: "cpu", hue: "#7c9bff" },
  { href: "/console/auditoria", label: "Auditoria & Métricas", icon: "activity", hue: "#4fd08a" },
];

export default function ConsoleHome() {
  return (
    <div className="cx-cards">
      {CARDS.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className={`cx-card${c.span2 ? " is-span2" : ""}${c.featured ? " is-featured" : ""}`}
          style={{ ["--_hue" as string]: c.hue } as React.CSSProperties}
        >
          <span className="cx-ico" aria-hidden>
            <Icon name={c.icon} size={c.span2 ? 22 : 21} />
          </span>
          <span className="cx-card-label">{c.label}</span>
        </Link>
      ))}
    </div>
  );
}
