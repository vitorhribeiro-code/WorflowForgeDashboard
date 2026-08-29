import { areaAssignmentPOST, areaAssignmentDELETE } from "@/modules/assignments/api/routes";

export function POST(req: Request) {
  return areaAssignmentPOST(req);
}
export function DELETE(req: Request) {
  return areaAssignmentDELETE(req);
}
