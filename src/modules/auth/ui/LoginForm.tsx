"use client";
import { useState } from "react";
import { useAuth } from "./hooks";

type Props = { onSuccess?: (redirect: string) => void };

// Estados idle → submitting → error/success (spec §3). Sem <form>.
export function LoginForm({ onSuccess }: Props) {
  const { login, busy, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit() {
    try {
      const { redirect } = await login(email, password);
      onSuccess?.(redirect);
    } catch {
      /* erro já exposto pelo hook */
    }
  }

  return (
    <div className="login-form">
      <input
        type="email"
        value={email}
        placeholder="utilizador"
        aria-label="utilizador"
        autoComplete="username"
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        value={password}
        placeholder="senha"
        aria-label="senha"
        autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? <p className="login-error">{error}</p> : null}
      <button type="button" disabled={busy || !email || !password} onClick={submit}>
        {busy ? "A entrar…" : "Entrar"}
      </button>
    </div>
  );
}
