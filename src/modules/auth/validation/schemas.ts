import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

export const requestResetSchema = z.object({
  email: z.string().email().max(320),
});

export const confirmResetSchema = z.object({
  token: z.string().min(10).max(500),
  password: z.string().min(8).max(200), // política mínima
});
