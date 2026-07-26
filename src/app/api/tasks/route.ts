import { tasksGET, tasksPOST } from "@/modules/tasks/api/routes";

export function GET(req: Request) {
  return tasksGET(req);
}
export function POST(req: Request) {
  return tasksPOST(req);
}
