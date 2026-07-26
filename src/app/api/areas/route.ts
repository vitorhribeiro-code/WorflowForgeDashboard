import { areasGET, areasPOST } from "@/modules/org/api/routes";

export function GET(req: Request) {
  return areasGET(req);
}
export function POST(req: Request) {
  return areasPOST(req);
}
