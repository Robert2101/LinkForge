import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .pipe(z.email("Enter a valid email address"));

export const registerBody = z.object({
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "Use at most 128 characters")
    .regex(/[a-z]/, "Add a lowercase letter")
    .regex(/[A-Z]/, "Add an uppercase letter")
    .regex(/\d/, "Add a number"),
  name: z.string().trim().min(2, "Use at least 2 characters").max(120).optional(),
});

export const loginBody = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});
