import { toolsGET, toolsPOST } from "@/modules/tools/api/routes";

export function GET(req: Request) {
  return toolsGET(req);
}
export function POST(req: Request) {
  return toolsPOST(req);
}
