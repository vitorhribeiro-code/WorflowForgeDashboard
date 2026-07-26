"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/modules/auth/ui/hooks";

// Formulário de definição de password a partir de um token (convite ou reset).
// Estados idle → submitting → error/success, sem <form> (padrão do LoginForm).
function SetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { confirmReset } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = Boolean(token) && password.length >= 8 && confirm === password && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await confirmReset(token, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <p className="login-error">Link inválido — falta o token de acesso.</p>;
  }

  if (done) {
    return (
      <div className="set-password-done">
        <p>Password definida. Já podes entrar com o teu email.</p>
        <Link className="button-link" href="/login">
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="login-form">
      <label>
        Nova password
        <input
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        Confirmar password
        <input
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </label>
      {tooShort ? <p className="login-error">Mínimo 8 caracteres.</p> : null}
      {mismatch ? <p className="login-error">As passwords não coincidem.</p> : null}
      {error ? <p className="login-error">{error}</p> : null}
      <button type="button" disabled={!canSubmit} onClick={submit}>
        {busy ? "A definir…" : "Definir password"}
      </button>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <main className="auth-shell">
      <div className="card">
        <h1>Definir password</h1>
        <p className="subtitle">Dashboard de Automações</p>
        {/* useSearchParams exige uma fronteira de Suspense no build do Next 15. */}
        <Suspense fallback={<p className="subtitle">A carregar…</p>}>
          <SetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
