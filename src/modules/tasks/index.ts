// Superfície pública do M4.
export { taskService, taskCatalogPort } from "./container";
export type { TaskService } from "./service/task.service";
export type { TaskCatalogPort, TaskContext } from "./service/ports";
export type { Task, TaskType, NewTask, TaskPatch, RequiredTool } from "./domain/types";
export type { Publishability, PublishBlocker } from "./domain/publishability";
