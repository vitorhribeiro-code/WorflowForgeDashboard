"use client";

import { useRouter } from "next/navigation";
import { LoginForm } from "@/modules/auth/ui/LoginForm";

export default function LoginPage() {
  const router = useRouter();
  return (
    <main className="auth-shell">
      <div className="card">
        <h1>Entrar</h1>
        <p className="subtitle">Dashboard de Automações</p>
        <LoginForm
          onSuccess={() => {
            // O cookie de sessão já foi definido pelo servidor; vamos ao painel.
            router.push("/dashboard");
            router.refresh();
          }}
        />
      </div>
    </main>
  );
}
