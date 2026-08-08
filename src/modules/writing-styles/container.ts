import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { createDrizzleWritingStyleRepository } from "./data/writing-style.repository";
import {
  createWritingStyleService,
  type WritingStyleService,
} from "./service/writing-style.service";

let cached: WritingStyleService | null = null;

export function getWritingStyleService(): WritingStyleService {
  if (cached) return cached;
  cached = createWritingStyleService({
    repo: createDrizzleWritingStyleRepository(db),
    audit: createDrizzleAudit(db),
  });
  return cached;
}
