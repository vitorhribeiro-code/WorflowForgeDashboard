import { usersGET, usersPOST } from "@/modules/org/api/routes";

export function GET(req: Request) {
  return usersGET(req);
}
export function POST(req: Request) {
  return usersPOST(req);
}
