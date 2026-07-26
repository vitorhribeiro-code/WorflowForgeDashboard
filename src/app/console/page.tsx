import Link from "next/link";

// Aterragem do admin. Cartões-atalho para as secções desta fatia. Métricas
// (Runs por estado, conexões em erro) entram quando o M7/M6 forem expostos.
export default function ConsoleHome() {
  return (
    <section className="console-section">
      <h1>Visão geral</h1>
      <p className="muted">
        Configura o catálogo e prepara as atribuições. Começa por registar as ferramentas que
        as tarefas vão exigir, depois cria as tarefas e publica-as.
      </p>

      <div className="console-cards">
        <Link href="/console/areas" className="console-card">
          <span className="console-card-title">Áreas &amp; Utilizadores</span>
          <span className="console-card-desc">
            Agrupa tarefas por área funcional e gere quem tem acesso à organização.
          </span>
        </Link>
        <Link href="/console/ferramentas" className="console-card">
          <span className="console-card-title">Ferramentas</span>
          <span className="console-card-desc">
            Catálogo global de ferramentas e os scopes que cada uma disponibiliza.
          </span>
        </Link>
        <Link href="/console/tarefas" className="console-card">
          <span className="console-card-title">Catálogo de Tarefas</span>
          <span className="console-card-desc">
            Cria tarefas, define as ferramentas exigidas e publica quando estiverem prontas.
          </span>
        </Link>
      </div>
    </section>
  );
}
