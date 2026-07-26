"use client";

import { useState } from "react";
import { AreaList, UserList } from "@/modules/org/ui/OrgLists";
import { useAreas, useUsers } from "@/modules/org/ui/hooks";
import type { Role } from "@/modules/org/domain/types";

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
  const { users, error, invite, setSuspended } = useUsers();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await invite(email.trim(), role);
      setEmail("");
    } finally {
      setBusy(false);
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
      <UserList users={users} onToggleSuspended={setSuspended} />
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
