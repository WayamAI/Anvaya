import { z } from "zod";

/**
 * Authentication input schemas.
 *
 * Shared by the API and the client form, so the rules cannot drift apart —
 * the client gets fast feedback, the server does the enforcing.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email address")
  .transform((v) => v.toLowerCase());

/**
 * Password policy for new and changed passwords.
 *
 * Length is the rule that actually matters, so the floor is 12 rather than
 * the traditional 8. The character-class rules are kept modest deliberately:
 * stacking requirements pushes people towards "Password1!" and a sticky
 * note, which is worse than a long passphrase.
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200, "Password must be at most 200 characters")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), "Password must contain upper and lower case letters")
  .refine((v) => /\d/.test(v), "Password must contain a number");

export const loginSchema = z.object({
  email: emailSchema,
  /*
    Deliberately NOT passwordSchema. Validating a login attempt against the
    policy would reject a password that predates a policy change, and would
    also tell an attacker which candidates are even worth submitting.
  */
  password: z.string().min(1, "Password is required").max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "The new password must be different from the current one",
    path: ["newPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
