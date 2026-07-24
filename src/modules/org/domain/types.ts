import type { Role } from "@/lib/session";

export type { Role };

export type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

export type FunctionalArea = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

export type User = {
  id: string;
  organizationId: string;
  email: string;
  name: string | null;
  role: Role;
  suspended: boolean; // (migração recomendada; hoje derivado como false)
  createdAt: Date;
};

export type NewUser = {
  email: string;
  name?: string | null;
  role: Role;
  mappingRef?: string | null;
};
