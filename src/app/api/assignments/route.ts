import { assignmentsGET, assignmentsPOST } from "@/modules/assignments/api/routes";

export function GET(req: Request) {
  return assignmentsGET(req);
}
export function POST(req: Request) {
  return assignmentsPOST(req);
}
