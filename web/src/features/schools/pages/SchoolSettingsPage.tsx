import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { SelectField, SwitchField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { invalidateSchool } from '@/lib/queryClient'
import { SCHOOL_TYPE_LABELS, type SchoolType } from '@/types/domain'
import { updateSchool, updateSchoolSettings } from '../api/schools.api'

const schema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum([
    'preschool',
    'primary',
    'middle_school',
    'high_school',
    'vocational',
    'university',
    'other',
  ]),
  email: z.string().email('Adresse invalide').or(z.literal('')).nullable(),
  phone: z.string().max(30).nullable(),
  address: z.string().max(200).nullable(),
  city: z.string().max(80).nullable(),
  country: z.string().max(80).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Code ISO à 3 lettres majuscules'),
  timezone: z.string().min(1),

  grading_mode: z.enum(['weighted_average', 'ects']),
  grading_scale: z.coerce.number().min(1).max(100),
  passing_score: z.coerce.number().min(0).max(100),
  compensation: z.boolean(),
  compensation_floor: z.coerce.number().min(0).max(100),

  matricule_prefix: z.string().max(10),
  vocabulary_class: z.string().min(1).max(30),
  vocabulary_term: z.string().min(1).max(30),
  vocabulary_subject: z.string().min(1).max(30),
})

type Values = z.infer<typeof schema>

const SCHOOL_TYPE_OPTIONS = (Object.keys(SCHOOL_TYPE_LABELS) as SchoolType[]).map((value) => ({
  value,
  label: SCHOOL_TYPE_LABELS[value],
}))

export function SchoolSettingsPage() {
  const { school, settings, schoolId, can } = useSchool()
  const readOnly = !can('school:update')

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: school?.name ?? '',
      type: school?.type ?? 'high_school',
      email: school?.email ?? '',
      phone: school?.phone ?? '',
      address: school?.address ?? '',
      city: school?.city ?? '',
      country: school?.country ?? '',
      currency: school?.currency ?? 'EUR',
      timezone: school?.timezone ?? 'Europe/Paris',
      grading_mode: settings.grading.mode,
      grading_scale: settings.grading.scale,
      passing_score: settings.grading.passing_score,
      compensation: settings.grading.compensation,
      compensation_floor: settings.grading.compensation_floor,
      matricule_prefix: settings.matricule_prefix,
      vocabulary_class: settings.vocabulary.class,
      vocabulary_term: settings.vocabulary.term,
      vocabulary_subject: settings.vocabulary.subject,
    },
  })

  // L'établissement peut changer via le sélecteur : le formulaire suit.
  useEffect(() => {
    if (!school) return
    form.reset({
      name: school.name,
      type: school.type,
      email: school.email ?? '',
      phone: school.phone ?? '',
      address: school.address ?? '',
      city: school.city ?? '',
      country: school.country ?? '',
      currency: school.currency,
      timezone: school.timezone,
      grading_mode: settings.grading.mode,
      grading_scale: settings.grading.scale,
      passing_score: settings.grading.passing_score,
      compensation: settings.grading.compensation,
      compensation_floor: settings.grading.compensation_floor,
      matricule_prefix: settings.matricule_prefix,
      vocabulary_class: settings.vocabulary.class,
      vocabulary_term: settings.vocabulary.term,
      vocabulary_subject: settings.vocabulary.subject,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id])

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      if (!schoolId) throw new Error('Aucun établissement actif.')

      await updateSchool(schoolId, {
        name: values.name,
        type: values.type,
        email: values.email || null,
        phone: values.phone || null,
        address: values.address || null,
        city: values.city || null,
        country: values.country || null,
        currency: values.currency,
        timezone: values.timezone,
      })

      await updateSchoolSettings(schoolId, {
        ...settings,
        grading: {
          mode: values.grading_mode,
          scale: values.grading_scale,
          passing_score: values.passing_score,
          compensation: values.compensation,
          compensation_floor: values.compensation_floor,
        },
        matricule_prefix: values.matricule_prefix,
        vocabulary: {
          class: values.vocabulary_class,
          term: values.vocabulary_term,
          subject: values.vocabulary_subject,
        },
      })
    },
    onSuccess: async () => {
      if (schoolId) await invalidateSchool(schoolId)
      toast.success('Paramètres enregistrés.')
    },
  })

  const isEcts = form.watch('grading_mode') === 'ects'

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values))}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
            <CardDescription>Coordonnées reprises sur les documents officiels.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="name" label="Nom" disabled={readOnly} />
            <SelectField
              control={form.control}
              name="type"
              label="Type"
              options={SCHOOL_TYPE_OPTIONS}
              disabled={readOnly}
            />
            <TextField control={form.control} name="email" label="E-mail" type="email" disabled={readOnly} />
            <TextField control={form.control} name="phone" label="Téléphone" disabled={readOnly} />
            <TextField control={form.control} name="address" label="Adresse" disabled={readOnly} className="sm:col-span-2" />
            <TextField control={form.control} name="city" label="Ville" disabled={readOnly} />
            <TextField control={form.control} name="country" label="Pays" disabled={readOnly} />
            <TextField control={form.control} name="currency" label="Devise" disabled={readOnly} />
            <TextField control={form.control} name="timezone" label="Fuseau horaire" disabled={readOnly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notation</CardTitle>
            <CardDescription>
              Détermine le calcul des moyennes et le format des bulletins.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="grading_mode"
              label="Mode"
              disabled={readOnly}
              options={[
                { value: 'weighted_average', label: 'Moyenne pondérée par coefficient' },
                { value: 'ects', label: 'Crédits ECTS (UE, compensation)' },
              ]}
              description={
                isEcts
                  ? 'Les matières sont regroupées en unités d’enseignement créditées.'
                  : 'Moyennes par matière pondérées par coefficient, puis moyenne générale et rang.'
              }
            />
            <TextField
              control={form.control}
              name="grading_scale"
              label="Barème"
              type="number"
              description="20 en France, 100 ailleurs."
              disabled={readOnly}
            />
            <TextField
              control={form.control}
              name="passing_score"
              label="Seuil de réussite"
              type="number"
              disabled={readOnly}
            />

            {isEcts ? (
              <>
                <TextField
                  control={form.control}
                  name="compensation_floor"
                  label="Note plancher de compensation"
                  type="number"
                  description="En dessous, une UE ne peut pas être compensée."
                  disabled={readOnly}
                />
                <SwitchField
                  control={form.control}
                  name="compensation"
                  label="Compensation entre UE"
                  description="Valide une UE sous le seuil si la moyenne du semestre est atteinte."
                  disabled={readOnly}
                  className="sm:col-span-2"
                />
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vocabulaire et numérotation</CardTitle>
            <CardDescription>
              Adapte les libellés au niveau de l&apos;établissement (classe / promotion, trimestre /
              semestre…).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="matricule_prefix"
              label="Préfixe des matricules"
              description="Exemple : LVH → LVH-2025-0001"
              disabled={readOnly}
            />
            <TextField control={form.control} name="vocabulary_class" label="Terme « classe »" disabled={readOnly} />
            <TextField control={form.control} name="vocabulary_term" label="Terme « période »" disabled={readOnly} />
            <TextField control={form.control} name="vocabulary_subject" label="Terme « matière »" disabled={readOnly} />
          </CardContent>
        </Card>

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  )
}
