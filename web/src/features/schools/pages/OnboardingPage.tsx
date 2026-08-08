import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { GraduationCap, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DateField, SelectField, TextField } from '@/components/shared/FormFields'
import { useAuth } from '@/features/auth/AuthProvider'
import { slugify } from '@/lib/formatters'
import { describeSupabaseError } from '@/lib/supabase'
import {
  HIGHER_EDUCATION_TYPES,
  SCHOOL_TYPE_LABELS,
  TERM_KIND_LABELS,
  type SchoolType,
  type TermKind,
} from '@/types/domain'
import {
  buildTermRanges,
  createAcademicYear,
  createSchool,
  createTerms,
} from '../api/schools.api'

const schema = z.object({
  name: z.string().min(2, "Nom de l'établissement requis").max(120),
  slug: z
    .string()
    .min(2, 'Identifiant requis')
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Minuscules, chiffres et tirets uniquement'),
  type: z.enum([
    'preschool',
    'primary',
    'middle_school',
    'high_school',
    'vocational',
    'university',
    'other',
  ]),
  currency: z
    .string()
    .length(3, 'Code ISO à 3 lettres')
    .regex(/^[A-Z]{3}$/, 'Majuscules uniquement (EUR, MGA, XOF…)'),
  timezone: z.string().min(1),
  year_name: z.string().min(4, 'Libellé requis').max(40),
  year_start: z.string().min(1, 'Date de début requise'),
  year_end: z.string().min(1, 'Date de fin requise'),
  term_kind: z.enum(['trimester', 'semester', 'quarter', 'year']),
  term_count: z.coerce.number().int().min(1).max(6),
})

type Values = z.infer<typeof schema>

const CURRENT_YEAR = new Date().getFullYear()

const SCHOOL_TYPE_OPTIONS = (Object.keys(SCHOOL_TYPE_LABELS) as SchoolType[]).map((value) => ({
  value,
  label: SCHOOL_TYPE_LABELS[value],
}))

const TERM_KIND_OPTIONS = (Object.keys(TERM_KIND_LABELS) as TermKind[]).map((value) => ({
  value,
  label: TERM_KIND_LABELS[value],
}))

/**
 * Premier écran d'un utilisateur sans établissement : création du tenant,
 * de sa première année scolaire et de ses périodes, en une transaction logique.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { reload, signOut, profile } = useAuth()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      slug: '',
      type: 'high_school',
      currency: 'EUR',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
      year_name: `${CURRENT_YEAR}-${CURRENT_YEAR + 1}`,
      year_start: `${CURRENT_YEAR}-09-01`,
      year_end: `${CURRENT_YEAR + 1}-07-05`,
      term_kind: 'trimester',
      term_count: 3,
    },
  })

  const name = form.watch('name')
  const type = form.watch('type')

  // Le slug suit le nom tant que l'utilisateur ne l'a pas édité lui-même.
  useEffect(() => {
    if (!form.getFieldState('slug').isDirty) {
      form.setValue('slug', slugify(name))
    }
  }, [name, form])

  // Le supérieur fonctionne en semestres : on ajuste la proposition par défaut.
  useEffect(() => {
    if (form.getFieldState('term_kind').isDirty) return
    const isHigherEd = HIGHER_EDUCATION_TYPES.includes(type)
    form.setValue('term_kind', isHigherEd ? 'semester' : 'trimester')
    form.setValue('term_count', isHigherEd ? 2 : 3)
  }, [type, form])

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const school = await createSchool({
        name: values.name,
        slug: values.slug,
        type: values.type,
        currency: values.currency,
        timezone: values.timezone,
      })

      const year = await createAcademicYear({
        school_id: school.id,
        name: values.year_name,
        start_date: values.year_start,
        end_date: values.year_end,
        is_current: true,
      })

      const ranges = buildTermRanges(
        values.year_start,
        values.year_end,
        values.term_count,
        values.term_kind,
      )
      await createTerms(school.id, year.id, ranges, 1)

      return school
    },
    onSuccess: async (school) => {
      await reload()
      toast.success(`${school.name} est prêt.`)
      navigate('/', { replace: true })
    },
  })

  const dateError =
    form.watch('year_end') <= form.watch('year_start')
      ? "La date de fin doit être postérieure à la date de début."
      : null

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
            <GraduationCap className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Bienvenue{profile?.first_name ? `, ${profile.first_name}` : ''}
            </h1>
            <p className="text-sm text-muted-foreground">
              Créez votre établissement pour commencer.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut className="size-4" />
          Quitter
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-pretty">
          Si vous attendez une invitation d&apos;un établissement existant, elle vous parviendra par
          e-mail : inutile d&apos;en créer un ici.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values))}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle>Établissement</CardTitle>
              <CardDescription>
                Ces informations apparaîtront sur les bulletins et les documents officiels.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="name"
                label="Nom"
                placeholder="Lycée Victor Hugo"
                className="sm:col-span-2"
              />
              <TextField
                control={form.control}
                name="slug"
                label="Identifiant"
                description="Utilisé dans les URL. Modifiable tant qu'aucune donnée n'existe."
              />
              <SelectField
                control={form.control}
                name="type"
                label="Type"
                options={SCHOOL_TYPE_OPTIONS}
              />
              <TextField
                control={form.control}
                name="currency"
                label="Devise"
                description="Code ISO : EUR, MGA, XOF, MAD…"
              />
              <TextField control={form.control} name="timezone" label="Fuseau horaire" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Première année scolaire</CardTitle>
              <CardDescription>
                Les périodes sont créées automatiquement en découpant l&apos;année ; vous pourrez
                ajuster chaque date ensuite.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="year_name"
                label="Libellé"
                placeholder="2025-2026"
                className="sm:col-span-2"
              />
              <DateField control={form.control} name="year_start" label="Début" />
              <DateField control={form.control} name="year_end" label="Fin" />
              <SelectField
                control={form.control}
                name="term_kind"
                label="Découpage"
                options={TERM_KIND_OPTIONS}
              />
              <TextField
                control={form.control}
                name="term_count"
                label="Nombre de périodes"
                type="number"
              />

              {dateError ? (
                <Alert variant="destructive" className="sm:col-span-2">
                  <AlertDescription>{dateError}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          {mutation.error ? (
            <Alert variant="destructive">
              <AlertDescription>{describeSupabaseError(mutation.error)}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={mutation.isPending || Boolean(dateError)}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Créer l&apos;établissement
          </Button>
        </form>
      </Form>
    </div>
  )
}
