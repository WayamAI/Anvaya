import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";
import { id, optionalText, text } from "./common";

/** Request bodies for users, roles and company settings. */

const roleIds = (message: string) => z.array(id).min(1, message).max(20)
  .refine((ids) => new Set(ids).size === ids.length, "lists a role more than once");

/** POST /api/v1/users */
export const createUserBody = z.object({
  email: emailSchema,
  name: text(100).min(1, "Name is required"),
  roleIds: roleIds("give the user at least one role"),
  /** Omitted → a random temporary password is generated and returned once. */
  password: passwordSchema.optional(),
}).strict();

export type CreateUserInput = z.infer<typeof createUserBody>;

/** PATCH /api/v1/users/:id */
export const updateUserBody = z.object({
  name: text(100).min(1).optional(),
  isActive: z.boolean().optional(),
  roleIds: roleIds("a user needs at least one role").optional(),
}).strict().refine((b) => Object.keys(b).length > 0, "send at least one field to change");

export type UpdateUserInput = z.infer<typeof updateUserBody>;

/** POST /api/v1/users/:id/reset-password */
export const resetPasswordBody = z.object({
  password: passwordSchema.optional(),
}).strict();

export type ResetPasswordInput = z.infer<typeof resetPasswordBody>;

const permissionCodes = z.array(z.string().regex(/^[a-z-]+:[a-z-]+$/, "is not a permission code"))
  .min(1, "a role needs at least one permission").max(200)
  .refine((c) => new Set(c).size === c.length, "lists a permission more than once");

/** POST /api/v1/roles */
export const createRoleBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, "use 2–40 capitals, digits or underscores, starting with a letter"),
  name: text(100).min(1),
  description: optionalText(500),
  permissions: permissionCodes,
}).strict();

export type CreateRoleInput = z.infer<typeof createRoleBody>;

/** PATCH /api/v1/roles/:id — custom roles only. */
export const updateRoleBody = z.object({
  name: text(100).min(1).optional(),
  description: text(500).nullable().optional(),
  permissions: permissionCodes.optional(),
}).strict().refine((b) => Object.keys(b).length > 0, "send at least one field to change");

export type UpdateRoleInput = z.infer<typeof updateRoleBody>;
