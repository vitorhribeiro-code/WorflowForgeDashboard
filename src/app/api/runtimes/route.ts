import { runtimesGET, runtimesPOST } from "@/modules/tasks/api/runtime-routes";

// Catálogo de runtimes (v52). GET lista (dropdown do form); POST cria generated.
export function GET(req: Request) {
  return runtimesGET(req);
}
export function POST(req: Request) {
  return runtimesPOST(req);
}
