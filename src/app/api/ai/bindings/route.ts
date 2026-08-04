import { bindingsGET, bindingsPUT } from "@/modules/ai/api/routes";

export function GET(req: Request) {
  return bindingsGET(req);
}
export function PUT(req: Request) {
  return bindingsPUT(req);
}
