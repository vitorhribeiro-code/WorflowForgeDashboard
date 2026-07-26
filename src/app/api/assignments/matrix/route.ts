import { matrixGET } from "@/modules/assignments/api/routes";

export function GET(req: Request) {
  return matrixGET(req);
}
