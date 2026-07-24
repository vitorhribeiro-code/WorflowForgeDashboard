import { z } from "zod";

export const renameOrgSchema = z.object({
  name: z.string().min(1).max(160),
});

export const createAreaSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullish(),
});

export const updateAreaSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(1000).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar" });

export const inviteUserSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["super_admin", "worker"]).default("worker"),
  name: z.string().max(160).nullish(),
});

export const updateUserSchema = z.object({
  role: z.enum(["super_admin", "worker"]).optional(),
  suspended: z.boolean().optional(),
});
