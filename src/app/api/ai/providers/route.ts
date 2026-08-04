import { providersGET, providersPOST } from "@/modules/ai/api/routes";

export function GET(req: Request) {
  return providersGET(req);
}
export function POST(req: Request) {
  return providersPOST(req);
}
