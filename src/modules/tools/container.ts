// Composition root do M3 — único sítio que instancia deps reais.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { DrizzleToolRepository } from "./data/tool.repository";
import { createToolCatalogPort, createToolService } from "./service/tool.service";

const repo = new DrizzleToolRepository(db);

export const toolService = createToolService({
  repo,
  audit: createDrizzleAudit(db),
});

// Port cross-module para M4 (required_tools) e M6 (granted_scopes).
export const toolCatalogPort = createToolCatalogPort(repo);
