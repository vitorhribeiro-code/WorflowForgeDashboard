// Superfície pública do M5.
export {
  assignmentService,
  assignmentSuspender,
  assignmentReadPort,
  areaMembershipService,
} from "./container";
export type { AssignmentService } from "./service/assignment.service";
export type {
  AreaMembershipService,
  AvailabilityMap,
} from "./service/area-membership.service";
export type {
  AssignmentSuspenderPort,
  AssignmentReadPort,
  AssignmentForRun,
  AssignmentMatrix,
  MatrixCell,
  WorkerSummary,
  WorkerAssignmentView,
} from "./service/ports";
export type {
  TaskAssignment,
  NewAssignment,
  AssignmentReadiness,
  ConnectionReadiness,
  MissingDep,
} from "./domain/types";
