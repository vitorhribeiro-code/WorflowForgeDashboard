// Superfície pública do M5.
export {
  assignmentService,
  assignmentSuspender,
  assignmentReadPort,
} from "./container";
export type { AssignmentService } from "./service/assignment.service";
export type {
  AssignmentSuspenderPort,
  AssignmentReadPort,
  AssignmentForRun,
  AssignmentMatrix,
  MatrixCell,
  WorkerSummary,
} from "./service/ports";
export type {
  TaskAssignment,
  NewAssignment,
  AssignmentReadiness,
  ConnectionReadiness,
  MissingDep,
} from "./domain/types";
