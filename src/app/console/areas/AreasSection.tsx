"use client";

import { useState } from "react";
import { AreaList, UserList } from "@/modules/org/ui/OrgLists";
import { useAreas, useUsers } from "@/modules/org/ui/hooks";
import type { Role } from "@/modules/org/domain/types";
import { WritingStyleModal } from "@/modules/writing-styles/ui/WritingStyleModal";

function AreasBlock() {
  const { areas, error, create, remove } = useAreas();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await create(name.trim());
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Áreas funcionais</h2>
      <div className="inline-form">
        <input
          value={name}
          placeholder="Nome da área"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" disabled={busy || !name.trim()} onClick={add}>
          Criar
        </button>
      </div>
      {error ? <p className="panel-error">{error}</p> : null}
      <AreaList areas={areas} onRemove={remove} />
    </div>
  );
}

function UsersBlock() {
  const { users, error, invite, setSuspended, generateSetPasswordLink } = useUsers();
  const [styleWorker, setStyleWorker] = useState<{ id: string; email: string } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; forEmail: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    setLinkError(null);
    try {
      // Convidar cria o utilizador (M2); logo a seguir geramos o link de acesso
      // (M1) para o admin o entregar — o convite por email fica para o SMTP.
      const created = await invite(email.trim(), role);
      const { url } = await generateSetPasswordLink(created.id);
      setLink({ url, forEmail: created.email });
      setCopied(false);
      setEmail("");
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function genLink(id: string) {
    setLinkError(null);
    try {
      const target = users?.find((u) => u.id === id);
      const { url } = await generateSetPasswordLink(id);
      setLink({ url, forEmail: target?.email ?? "" });
      setCopied(false);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Erro");
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      /* clipboard indisponível — o admin pode selecionar e copiar à mão */
    }
  }

  return (
    <div className="panel">
      <h2>Utilizadores</h2>
      <div className="inline-form">
        <input
          type="email"
          value={email}
          placeholder="email@org.pt"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="worker">worker</option>
          <option value="super_admin">super_admin</option>
        </select>
        <button type="button" disabled={busy || !email.trim()} onClick={add}>
          Convidar
        </button>
      </div>
      {error ? <p className="panel-error">{error}</p> : null}
      {linkError ? <p className="panel-error">{linkError}</p> : null}
      {link ? (
        <div className="access-link">
          <p className="access-link-note">
            Link de acesso para <strong>{link.forEmail}</strong> — entrega-o à pessoa. Só pode
            ser usado uma vez e expira.
          </p>
          <div className="access-link-row">
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copy}>
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
        </div>
      ) : null}
      <UserList
        users={users}
        onToggleSuspended={setSuspended}
        onGenerateLink={genLink}
        onOpenStyle={(id, email) => setStyleWorker({ id, email })}
      />
      {styleWorker ? (
        <WritingStyleModal worker={styleWorker} onClose={() => setStyleWorker(null)} />
      ) : null}
    </div>
  );
}

export function AreasSection() {
  return (
    <section className="console-section">
      <h1>Áreas &amp; Utilizadores</h1>
      <p className="muted">
        As áreas agrupam tarefas do catálogo. Só áreas sem tarefas podem ser removidas.
      </p>
      <AreasBlock />
      <UsersBlock />
    </section>
  );
}
