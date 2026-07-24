// Provisiona o 1.º tenant: organização + super_admin + credencial de acesso.
// Idempotente (por slug de org e por email). Corre uma vez por cliente novo,
// enquanto não houver signup self-service.
//
// Uso (a partir de env):
//   SEED_ORG_NAME="Acme" SEED_ORG_SLUG="acme" \
//   SEED_ADMIN_EMAIL="admin@acme.pt" SEED_ADMIN_PASSWORD="…" \
//   tsx scripts/seed-admin.ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, users } from "@/db/schema";
import { hashPassword } from "@/modules/auth/domain/password";
import { isValidSlug } from "@/modules/org/domain/rules";

export type SeedInput = {
  orgName: string;
  orgSlug: string;
  email: string;
  password: string;
  name?: string;
};

export type SeedResult = { orgId: string; userId: string; created: boolean };

export async function seedAdmin(input: SeedInput): Promise<SeedResult> {
  const slug = input.orgSlug.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();

  if (!isValidSlug(slug)) throw new Error(`slug inválido: ${slug}`);
  if (input.password.length < 8) throw new Error("password demasiado curta (≥8)");

  return db.transaction(async (tx) => {
    // Organização (por slug único).
    let [org] = await tx.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) {
      [org] = await tx
        .insert(organizations)
        .values({ name: input.orgName.trim(), slug })
        .returning();
    }

    // Utilizador admin (por email único global).
    let [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    let created = false;
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({
          organizationId: org!.id,
          email,
          name: input.name ?? null,
          role: "super_admin",
        })
        .returning();
      created = true;
    }

    // Credencial (tabela da migração Tier 1). Define/atualiza a password.
    await tx.execute(sql`
      insert into user_credentials (user_id, password_hash, updated_at)
      values (${user!.id}, ${hashPassword(input.password)}, now())
      on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()
    `);

    return { orgId: org!.id, userId: user!.id, created };
  });
}

// CLI: lê de env, corre e sai. Só executa quando invocado diretamente.
async function main() {
  const required = ["SEED_ORG_NAME", "SEED_ORG_SLUG", "SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Faltam variáveis: ${missing.join(", ")}`);

  const res = await seedAdmin({
    orgName: process.env.SEED_ORG_NAME!,
    orgSlug: process.env.SEED_ORG_SLUG!,
    email: process.env.SEED_ADMIN_EMAIL!,
    password: process.env.SEED_ADMIN_PASSWORD!,
    name: process.env.SEED_ADMIN_NAME,
  });
  console.info(`Seed ok: org=${res.orgId} user=${res.userId} (novo=${res.created})`);
}

// Executa só se for o entrypoint (não em import/teste).
if (process.argv[1] && process.argv[1].endsWith("seed-admin.ts")) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
