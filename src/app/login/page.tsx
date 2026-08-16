"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/modules/auth/ui/LoginForm";

export default function LoginPage() {
  const router = useRouter();
  return (
    <main className="auth-shell">
      <div className="card">
        <h1>Entrar</h1>
        <p className="subtitle">Work Flow Forge Dashboard</p>
        <LoginForm
          onSuccess={(redirect) => {
            // O cookie de sessão já foi definido pelo servidor. O destino vem
            // do M1 por role (super_admin → /console, worker → /).
            router.push(redirect);
            router.refresh();
          }}
        />
        <p
          style={{
            margin: "18px 0 0",
            textAlign: "center",
            fontSize: 13,
          }}
        >
          <Link href="/privacidade" style={{ color: "var(--muted)" }}>
            Política de Privacidade
          </Link>
        </p>
      </div>
    </main>
  );
}
