import { GET as listGET } from "@/modules/archives/api/archives-list.route";

// GET /api/archives?workerId=&period= — lista arquivos mensais (M9).
// Worker vê os seus; admin vê os da org (acesso aplicado no service).
export function GET(req: Request) {
  return listGET(req);
}
