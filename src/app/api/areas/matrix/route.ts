import { areasMatrixGET } from "@/modules/assignments/api/routes";

export function GET(req: Request) {
  return areasMatrixGET(req);
}
