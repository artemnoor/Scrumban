import { z } from 'zod';

export const roleSchema = z.enum(['user', 'admin']);
export const emailVerificationStatusSchema = z.enum(['pending', 'verified']);

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  role: roleSchema,
  emailVerificationStatus: emailVerificationStatusSchema,
  emailVerifiedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const authSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.string().datetime()
});

export const authSessionResponseSchema = z.object({
  sessionId: z.string(),
  expiresAt: z.string().datetime(),
  user: userSchema
});

export const authErrorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown().optional()
});

export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(120)
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

export const registerResponseSchema = z.object({
  email: z.string().email(),
  verificationExpiresAt: z.string().datetime(),
  resent: z.boolean()
});

export const resendVerificationInputSchema = z.object({
  email: z.string().email()
});

export const verifyEmailInputSchema = z.object({
  token: z.string().min(1).max(512)
});

export const verifyEmailResponseSchema = z.object({
  email: z.string().email(),
  verifiedAt: z.string().datetime()
});

export type Role = z.infer<typeof roleSchema>;
export type EmailVerificationStatus = z.infer<typeof emailVerificationStatusSchema>;
export type UserDto = z.infer<typeof userSchema>;
export type AuthSessionDto = z.infer<typeof authSessionSchema>;
export type AuthSessionResponseDto = z.infer<typeof authSessionResponseSchema>;
export type AuthErrorResponseDto = z.infer<typeof authErrorResponseSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type RegisterResponseDto = z.infer<typeof registerResponseSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationInputSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;
export type VerifyEmailResponseDto = z.infer<typeof verifyEmailResponseSchema>;
