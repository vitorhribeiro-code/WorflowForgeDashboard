import Link from "next/link";

// Aterragem do admin: um cartão-atalho por secção da consola. A ordem segue o
// fluxo de configuração (ferramentas → tarefas → atribuições) e fecha na
// operação (trabalhadores, IA, auditoria).
const CARDS: { href: string; title: string; desc: string }[] = [
  {
    href: "/console/areas",
    title: "Áreas & Utilizadores",
    desc: "Agrupa tarefas por área funcional e gere quem tem acesso à organização.",
  },
  {
    href: "/console/ferramentas",
    title: "Ferramentas",
    desc: "Catálogo global de ferramentas e os scopes que cada uma disponibiliza.",
  },
  {
    href: "/console/tarefas",
    title: "Catálogo de Tarefas",
    desc: "Cria tarefas, define as ferramentas exigidas e publica quando estiverem prontas.",
  },
  {
    href: "/console/atribuicoes",
    title: "Atribuições",
    desc: "Liga tarefas a trabalhadores e ativa cada uma quando as conexões estiverem prontas.",
  },
  {
    href: "/console/trabalhadores",
    title: "Trabalhadores",
    desc: "Vê o estado das conexões de cada trabalhador e o que ainda falta ligar.",
  },
  {
    href: "/console/ia",
    title: "IA / Modelos",
    desc: "Configura os provedores de modelos e as ligações que as tarefas assistidas usam.",
  },
  {
    href: "/console/auditoria",
    title: "Auditoria & Métricas",
    desc: "Acompanha a saúde das automações e o rasto imutável das ações da organização.",
  },
];

export default function ConsoleHome() {
  return (
    <section className="console-section">
      <h1>Visão geral</h1>
      <p className="muted">
        Configura o catálogo e prepara as atribuições. Começa por registar as ferramentas que as
        tarefas vão exigir, depois cria as tarefas, publica-as e atribui-as aos trabalhadores.
      </p>

      <div className="console-cards">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="console-card">
            <span className="console-card-title">{c.title}</span>
            <span className="console-card-desc">{c.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
