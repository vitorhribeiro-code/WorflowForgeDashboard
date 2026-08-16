"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/modules/auth/ui/LoginForm";
import { LoginSlideshow } from "./LoginSlideshow";

export default function LoginPage() {
  const router = useRouter();
  return (
    <main className="wf-auth-shell">
      <div className="wf-auth">
        {/* Metade de login (fundo negro) */}
        <section className="wf-auth__panel wf-auth__login">
          <div className="wf-auth__brand">
            <span className="wf-auth__mark">W</span> Work Flow Forge
          </div>
          <div className="wf-auth__body">
            <h1>dashboard</h1>
            <LoginForm
              onSuccess={(redirect) => {
                // O cookie de sessão já foi definido pelo servidor. O destino
                // vem do M1 por role (super_admin → /console, worker → /).
                router.push(redirect);
                router.refresh();
              }}
            />
            <p className="wf-auth__legal">
              <Link href="/privacidade">Política de Privacidade</Link>
            </p>
          </div>
        </section>

        {/* Metade do slideshow (deck do Gamma, colado, mesmo tamanho) */}
        <aside className="wf-auth__panel wf-auth__media">
          <LoginSlideshow />
        </aside>
      </div>
    </main>
  );
}
