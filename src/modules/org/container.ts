// Composition root do M2 — único sítio que instancia deps reais.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { DrizzleAreaRepository } from "./data/area.repository";
import { DrizzleOrganizationRepository } from "./data/organization.repository";
import { DrizzleUserRepository } from "./data/user.repository";
import { createUserDirectory, createWorkerDirectory } from "./infra/directory";
import { createAreaService } from "./service/area.service";
import { createOrganizationService } from "./service/organization.service";
import { createUserService } from "./service/user.service";

const audit = createDrizzleAudit(db);
const userRepo = new DrizzleUserRepository(db);

export const organizationService = createOrganizationService({
  repo: new DrizzleOrganizationRepository(db),
  audit,
});
export const areaService = createAreaService({ repo: new DrizzleAreaRepository(db), audit });
export const userService = createUserService({ repo: userRepo, audit });

// Ports expostos — injetar nos containers de M1 (auth), M5 (assignments), M9 (archives).
export const userDirectoryPort = createUserDirectory(userRepo);
export const workerDirectoryPort = createWorkerDirectory(userRepo);
