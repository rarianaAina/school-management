import { z } from 'zod'

const email = z
  .string()
  .min(1, 'Adresse e-mail requise')
  .email('Adresse e-mail invalide')
  .transform((value) => value.trim().toLowerCase())

export const passwordLoginSchema = z.object({
  email,
  password: z.string().min(1, 'Mot de passe requis'),
})

export const magicLinkSchema = z.object({ email })

export const forgotPasswordSchema = z.object({ email })

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, 'Au moins 10 caractères')
      .regex(/[a-z]/, 'Au moins une minuscule')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[0-9]/, 'Au moins un chiffre'),
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    message: 'Les deux mots de passe ne correspondent pas',
    path: ['confirmation'],
  })

export const profileSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis').max(80),
  last_name: z.string().min(1, 'Nom requis').max(80),
  phone: z.string().max(30).optional().nullable(),
})

export type PasswordLoginValues = z.infer<typeof passwordLoginSchema>
export type MagicLinkValues = z.infer<typeof magicLinkSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type NewPasswordValues = z.infer<typeof newPasswordSchema>
export type ProfileValues = z.infer<typeof profileSchema>
