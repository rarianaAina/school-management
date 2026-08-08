import { z } from 'zod'

const optionalText = (max = 120) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value?.trim() ? value.trim() : null))

export const studentSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis').max(80),
  last_name: z.string().min(1, 'Nom requis').max(80),
  birth_date: z.string().nullable().optional(),
  birth_place: optionalText(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  nationality: optionalText(80),
  email: z
    .string()
    .email('Adresse e-mail invalide')
    .or(z.literal(''))
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  phone: optionalText(30),
  address: optionalText(200),
  city: optionalText(80),
  previous_school: optionalText(),
  entry_date: z.string().nullable().optional(),
  status: z.enum(['enrolled', 'graduated', 'transferred', 'withdrawn', 'suspended']),
  blood_group: optionalText(10),
  medical_notes: optionalText(500),
  notes: optionalText(500),
})

export type StudentFormValues = z.infer<typeof studentSchema>

export const guardianSchema = z
  .object({
    mode: z.enum(['new', 'existing']),
    guardian_id: z.string().nullable().optional(),
    first_name: z.string().max(80).optional(),
    last_name: z.string().max(80).optional(),
    email: z
      .string()
      .email('Adresse e-mail invalide')
      .or(z.literal(''))
      .optional()
      .transform((value) => (value ? value : null)),
    phone: optionalText(30),
    address: optionalText(200),
    profession: optionalText(80),
    relationship: z.enum([
      'father',
      'mother',
      'stepparent',
      'grandparent',
      'sibling',
      'tutor',
      'other',
    ]),
    is_primary: z.boolean(),
    receives_invoices: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'existing' && !values.guardian_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sélectionnez un tuteur existant',
        path: ['guardian_id'],
      })
      return
    }
    if (values.mode === 'new') {
      if (!values.first_name?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Prénom requis', path: ['first_name'] })
      }
      if (!values.last_name?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nom requis', path: ['last_name'] })
      }
    }
  })

export type GuardianFormValues = z.infer<typeof guardianSchema>
