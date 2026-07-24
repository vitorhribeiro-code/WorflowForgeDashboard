import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-admin";

// As guardas de validação disparam ANTES de tocar na BD.
describe("seedAdmin (guardas)", () => {
  const base = { orgName: "Acme", orgSlug: "acme", email: "a@x.pt", password: "segredo-8" };

  it("rejeita slug inválido", async () => {
    await expect(seedAdmin({ ...base, orgSlug: "Slug Inválido" })).rejects.toThrow(/slug/i);
  });

  it("rejeita password curta", async () => {
    await expect(seedAdmin({ ...base, password: "curta" })).rejects.toThrow(/password/i);
  });
});
