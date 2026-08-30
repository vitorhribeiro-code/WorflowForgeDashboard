"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";

// LOG OUT da consola — versão vermelha do redesign. Componente próprio para NÃO
// alterar o `LogoutButton` partilhado com /dashboard. Mesma mecânica: POST ao
// endpoint de logout, depois redireciona para /login.
export function ConsoleLogout() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="cx-logout"
      onClick={logout}
      disabled={busy}
      aria-label="Terminar sessão"
    >
      {busy ? "A SAIR…" : "LOG OUT"}
      <span className="cx-logout-box" aria-hidden>
        <Icon name="arrow-right" size={10} strokeWidth={2} />
      </span>
    </button>
  );
}
