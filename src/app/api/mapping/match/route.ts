import { matchPOST } from "@/modules/mapping/api/routes";

// Matcher de runtimes no import (v53): candidatos → propostas (reuse-first).
export function POST(req: Request) {
  return matchPOST(req);
}
