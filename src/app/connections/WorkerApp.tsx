"use client";

/**
 * Shell do Painel do Trabalhador (Fase A do redesign — visual claro "wf-app").
 *
 * Envolve os painéis existentes (ConnectionsPanel M6, WorkerTasksPanel) numa
 * sidebar ESTREITA só-ícones (rótulos em tooltip) que se AUTO-OCULTA — revela-se
 * ao levar o rato à berma esquerda (`.wf-dock`) ou ao focar com teclado. Alterna
 * a vista principal no cliente. Toda a mecânica dos painéis fica intacta — aqui
 * só há navegação + chrome. O tema claro vive sob `.wf-app` (globals.css) e NÃO
 * afeta consola/login (escuros).
 *
 * Fase B: board de tarefas movível + stat cards. Fase C2 (revisto 2): a sidebar
 * estreita é só navegação (ícones); os cartões «Próxima ação» e «Ações recentes»
 * (auto-suficientes) vivem numa coluna à direita do conteúdo, ancorada no topo e
 * a descer ao lado do board.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectionsPanel } from "@/modules/connections/ui/ConnectionsPanel";
import { WorkerTasksPanel } from "@/modules/assignments/ui/WorkerTasksPanel";
import { NextRunWidget, RecentRunsWidget } from "@/modules/assignments/ui/SidebarWidgets";
import {
  BACKGROUND_SWATCHES,
  DEFAULT_BACKGROUND,
  type BackgroundToken,
} from "@/modules/preferences/domain/preferences";

type View = "tasks" | "connections" | "settings" | "help";
type Banner = { tone: "ok" | "err"; text: string } | null;

/* --- Ícones (SVG inline; os "ti ti-*" do Tabler não existem na app) ------- */

const IcMark = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 7l8-4 8 4-8 4-8-4z" fill="#fff" opacity=".95" />
    <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IcTasks = (
  <svg className="wf-ic" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
const IcLink = (
  <svg className="wf-ic" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M9 15l6-6M8.5 10.5l-1.8 1.8a3.1 3.1 0 004.4 4.4l1.8-1.8M15.5 13.5l1.8-1.8a3.1 3.1 0 00-4.4-4.4L11.1 9.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const IcGear = (
  <svg className="wf-ic" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L16 2H8l-.6 2.5a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 003 12a7 7 0 00.1 1.2l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2 1.2L8 22h8l.6-2.5c.7-.3 1.4-.7 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);
const IcHelp = (
  <svg className="wf-ic" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    <path d="M9.6 9.4a2.4 2.4 0 014.7.6c0 1.6-2.3 2-2.3 3.4M12 17h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const IcLogout = (
  <svg className="wf-ic" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M15 12H4m0 0l3.5-3.5M4 12l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

// Tarefas e conexões são pessoais do trabalhador. Um super-utilizador que abra
// esta área vê uma nota (e tem o atalho para a consola nas Definições).
function AdminNote() {
  return (
    <div className="conn-empty">
      <p className="conn-empty-title">Esta área é do trabalhador</p>
      <p className="conn-empty-sub">
        As conexões e tarefas são pessoais de cada trabalhador. Como super-utilizador, gere
        tudo na consola — abre-a em «Definições».
      </p>
    </div>
  );
}

export function WorkerApp({
  role,
  banner,
  background = DEFAULT_BACKGROUND,
}: {
  role: string;
  banner: Banner;
  background?: BackgroundToken;
}) {
  const isAdmin = role === "super_admin";
  const [view, setView] = useState<View>(banner ? "connections" : "tasks");
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  // Fundo pessoal do painel (só trabalhadores). O token é uma classe na raiz
  // `.wf-app`; a troca é otimista (preview imediato) e persiste no PUT.
  const showBackground = !isAdmin;
  const [bg, setBg] = useState<BackgroundToken>(background);
  const [bgError, setBgError] = useState<string | null>(null);

  async function chooseBackground(token: BackgroundToken) {
    if (token === bg) return;
    const prev = bg;
    setBg(token);
    setBgError(null);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: token }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setBg(prev);
      setBgError("Não foi possível guardar o fundo. Tenta de novo.");
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  // Nav só-ícones (sidebar estreita): o rótulo vive no tooltip (title) e no
  // aria-label — não no ecrã.
  function navItem(v: View, label: string, icon: React.ReactNode) {
    return (
      <button
        type="button"
        className={`wf-nav-item${view === v ? " wf-active" : ""}`}
        aria-current={view === v ? "page" : undefined}
        aria-label={label}
        title={label}
        onClick={() => setView(v)}
      >
        {icon}
      </button>
    );
  }

  const initials = isAdmin ? "SA" : "EU";
  const roleLabel = isAdmin ? "Super-utilizador" : "Trabalhador";

  const bgClass = showBackground && bg !== "default" ? ` wf-bg-${bg}` : "";

  return (
    <div className={`wf-app${bgClass}`}>
      <div className="wf-dock">
        <aside className="wf-side">
          <div className="wf-brand">
            <span className="wf-brand-mark" title="WorkflowForge">
              {IcMark}
            </span>
          </div>

          <nav className="wf-nav" aria-label="Navegação">
            {navItem("tasks", "As minhas tarefas", IcTasks)}
            <div className="wf-nav-sep" />
            {navItem("connections", "As minhas conexões", IcLink)}
            {navItem("settings", "Definições", IcGear)}
            {navItem("help", "Ajuda", IcHelp)}
            <button
              type="button"
              className="wf-nav-item wf-danger"
              onClick={() => void logout()}
              disabled={loggingOut}
              aria-label={loggingOut ? "A sair…" : "Terminar sessão"}
              title="Terminar sessão"
            >
              {IcLogout}
            </button>
          </nav>

          <div className="wf-side-spacer" />
          <div className="wf-side-foot" title={roleLabel}>
            <span className="wf-avatar">{initials}</span>
          </div>
        </aside>
      </div>

      <main className="wf-main">
        <div className="wf-topbar">
          <div className="wf-top-actions">
            <div className="wf-who-inline">
              <span className="wf-avatar">{initials}</span>
              <span>
                <b>A minha conta</b>
                <span>{roleLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <section className={`wf-view${view === "tasks" ? " wf-on" : ""}`}>
          {isAdmin ? (
            <>
              <div className="wf-page-head">
                <h1>As minhas tarefas</h1>
                <p>Executa as automáticas quando precisares e acompanha o histórico.</p>
              </div>
              <AdminNote />
            </>
          ) : (
            <div className="wf-tasks-layout">
              <div className="wf-tasks-col">
                <div className="wf-page-head">
                  <h1>As minhas tarefas</h1>
                  <p>Executa as automáticas quando precisares e acompanha o histórico.</p>
                </div>
                <WorkerTasksPanel />
              </div>
              <aside className="wf-tasks-rail" aria-label="Resumo">
                <NextRunWidget />
                <RecentRunsWidget />
              </aside>
            </div>
          )}
        </section>

        <section className={`wf-view${view === "connections" ? " wf-on" : ""}`}>
          <div className="wf-page-head">
            <h1>As minhas conexões</h1>
            <p>
              Autoriza as ferramentas que as tuas tarefas precisam. Ligada e com todas as
              permissões fica pronta.
            </p>
          </div>
          {banner && <div className={`conn-banner ${banner.tone}`}>{banner.text}</div>}
          {isAdmin ? <AdminNote /> : <ConnectionsPanel />}
        </section>

        <section className={`wf-view${view === "settings" ? " wf-on" : ""}`}>
          <div className="wf-page-head">
            <h1>Definições</h1>
            <p>As tuas preferências pessoais e, se fores super-utilizador, o acesso à consola.</p>
          </div>
          <div className="wf-panel">
            <h2>Definições pessoais</h2>
            {showBackground ? (
              <>
                <p>Preferências da tua conta.</p>
                <div className="wf-bg-field">
                  <p className="wf-bg-label">Fundo do painel</p>
                  <div
                    className="wf-bg-swatches"
                    role="radiogroup"
                    aria-label="Fundo do painel"
                  >
                    {BACKGROUND_SWATCHES.map((s) => (
                      <button
                        key={s.token}
                        type="button"
                        className="wf-bg-swatch"
                        style={{ background: s.swatch }}
                        role="radio"
                        aria-checked={bg === s.token}
                        aria-pressed={bg === s.token}
                        aria-label={s.label}
                        title={s.label}
                        onClick={() => chooseBackground(s.token)}
                      />
                    ))}
                  </div>
                  <p className="wf-bg-hint">
                    Escolhe o tom da tela. Os cartões mantêm-se legíveis em qualquer fundo.
                  </p>
                  {bgError && <p className="wf-bg-error">{bgError}</p>}
                </div>
              </>
            ) : (
              <p>
                As preferências de fundo são pessoais de cada trabalhador. Como
                super-utilizador, geres tudo na consola.
              </p>
            )}
          </div>
          {isAdmin && (
            <div className="wf-panel">
              <h2>Consola de super-utilizador</h2>
              <p>Gerir organização, áreas, ferramentas, tarefas e atribuições.</p>
              <a className="wf-panel-link" href="/console">
                Abrir a consola
              </a>
            </div>
          )}
        </section>

        <section className={`wf-view${view === "help" ? " wf-on" : ""}`}>
          <div className="wf-page-head">
            <h1>Ajuda</h1>
            <p>Guias e apoio.</p>
          </div>
          <div className="wf-panel">
            <h2>Centro de ajuda</h2>
            <p>Estamos a preparar guias para tirares o máximo das tuas automações.</p>
            <span className="wf-soon">Em breve</span>
          </div>
        </section>
      </main>
    </div>
  );
}
