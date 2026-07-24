// Superfície pública do M11.
export { mappingService } from "./container";
export type { MappingService } from "./service/mapping.service";
export type { TaskAuthoringPort, ToolResolverPort } from "./service/ports";
export type {
  MappingDocument,
  MappingOpportunity,
  TaskCandidate,
  CandidateCompleteness,
} from "./domain/types";
