import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarRange, Check, Lock, LockOpen, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { DateField, SelectField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { supabase } from '@/lib/supabase'
import { invalidateSchool, queryKeys } from '@/lib/queryClient'
import { formatDate } from '@/lib/formatters'
import { TERM_KIND_LABELS, type AcademicYear, type Term, type TermKind } from '@/types/domain'
import {
  buildTermRanges,
  createAcademicYear,
  createTerms,
  deleteAcademicYear,
  deleteTerm,
  setCurrentAcademicYear,
  setCurrentTerm,
  setTermLocked,
} from '../api/schools.api'

const yearSchema = z
  .object({
    name: z.string().min(4, 'Libellé requis').max(40),
    start_date: z.string().min(1, 'Date de début requise'),
    end_date: z.string().min(1, 'Date de fin requise'),
    term_kind: z.enum(['trimester', 'semester', 'quarter', 'year']),
    term_count: z.coerce.number().int().min(1).max(6),
    is_current: z.boolean(),
  })
  .refine((values) => values.end_date > values.start_date, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['end_date'],
  })

type YearValues = z.infer<typeof yearSchema>

const TERM_KIND_OPTIONS = (Object.keys(TERM_KIND_LABELS) as TermKind[]).map((value) => ({
  value,
  label: TERM_KIND_LABELS[value],
}))

function TermsCard({ year }: { year: AcademicYear }) {
  const { schoolId, can } = useSchool()
  const canManage = can('school:manage_years')
  const [termToDelete, setTermToDelete] = useState<Term | null>(null)

  const termsQuery = useQuery({
    queryKey: queryKeys.terms(schoolId ?? 'none', year.id),
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('academic_year_id', year.id)
        .order('sequence')
      if (error) throw error
      return data ?? []
    },
  })

  const refresh = async () => {
    if (schoolId) await invalidateSchool(schoolId)
  }

  const currentMutation = useMutation({
    mutationFn: (termId: string) => setCurrentTerm(schoolId!, termId),
    onSuccess: async () => {
      await refresh()
      toast.success('Période en cours mise à jour.')
    },
  })

  const lockMutation = useMutation({
    mutationFn: ({ termId, locked }: { termId: string; locked: boolean }) =>
      setTermLocked(termId, locked),
    onSuccess: async (_, variables) => {
      await refresh()
      toast.success(variables.locked ? 'Période verrouillée.' : 'Période déverrouillée.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (termId: string) => deleteTerm(termId),
    onSuccess: async () => {
      await refresh()
      toast.success('Période supprimée.')
    },
  })

  const columns: Column<Term>[] = [
    {
      id: 'name',
      header: 'Période',
      cell: (term) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{term.name}</span>
          {term.is_current ? <Badge variant="secondary">En cours</Badge> : null}
          {term.is_locked ? (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" />
              Verrouillée
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: 'dates',
      header: 'Dates',
      hideOnMobile: true,
      cell: (term) => (
        <span className="tabular text-muted-foreground">
          {formatDate(term.start_date)} → {formatDate(term.end_date)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      width: '210px',
      cell: (term) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            {!term.is_current ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => currentMutation.mutate(term.id)}
                disabled={currentMutation.isPending}
              >
                <Check className="size-4" />
                En cours
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={term.is_locked ? 'Déverrouiller' : 'Verrouiller'}
              onClick={() => lockMutation.mutate({ termId: term.id, locked: !term.is_locked })}
              disabled={lockMutation.isPending}
            >
              {term.is_locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Supprimer"
              className="text-destructive"
              onClick={() => setTermToDelete(term)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={termsQuery.data ?? []}
        getRowId={(term) => term.id}
        isLoading={termsQuery.isPending}
        emptyState={
          <EmptyState
            icon={CalendarRange}
            title="Aucune période"
            description="Cette année scolaire n'a pas encore de trimestre ou de semestre."
          />
        }
      />

      <ConfirmDialog
        open={Boolean(termToDelete)}
        onOpenChange={(open) => !open && setTermToDelete(null)}
        title={`Supprimer « ${termToDelete?.name} » ?`}
        description="Les notes et bulletins rattachés à cette période seront supprimés. Action irréversible."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (termToDelete) await deleteMutation.mutateAsync(termToDelete.id)
          setTermToDelete(null)
        }}
      />
    </>
  )
}

export function AcademicYearsPage() {
  const { schoolId, academicYears, can, isLoading } = useSchool()
  const canManage = can('school:manage_years')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [yearToDelete, setYearToDelete] = useState<AcademicYear | null>(null)

  const refresh = async () => {
    if (schoolId) await invalidateSchool(schoolId)
  }

  const createMutation = useMutation({
    mutationFn: async (values: YearValues) => {
      const year = await createAcademicYear({
        school_id: schoolId!,
        name: values.name,
        start_date: values.start_date,
        end_date: values.end_date,
        is_current: values.is_current,
      })

      const ranges = buildTermRanges(
        values.start_date,
        values.end_date,
        values.term_count,
        values.term_kind,
      )
      await createTerms(schoolId!, year.id, ranges, values.is_current ? 1 : undefined)
      return year
    },
    onSuccess: async () => {
      await refresh()
      toast.success('Année scolaire créée.')
    },
  })

  const currentMutation = useMutation({
    mutationFn: (yearId: string) => setCurrentAcademicYear(schoolId!, yearId),
    onSuccess: async () => {
      await refresh()
      toast.success('Année en cours mise à jour.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (yearId: string) => deleteAcademicYear(yearId),
    onSuccess: async () => {
      await refresh()
      toast.success('Année scolaire supprimée.')
    },
  })

  const nextYear = new Date().getFullYear() + (new Date().getMonth() >= 7 ? 0 : -1)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Années scolaires</h2>
          <p className="text-sm text-muted-foreground">
            L&apos;année en cours sert de référence par défaut dans toute l&apos;application.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Nouvelle année
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Chargement…
          </CardContent>
        </Card>
      ) : academicYears.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarRange}
              title="Aucune année scolaire"
              description="Créez une première année pour pouvoir enregistrer des classes, des inscriptions et des notes."
              action={
                canManage ? (
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4" />
                    Créer une année
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        academicYears.map((year) => (
          <Card key={year.id}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  {year.name}
                  {year.is_current ? <Badge>En cours</Badge> : null}
                  {year.is_closed ? <Badge variant="outline">Clôturée</Badge> : null}
                </CardTitle>
                <CardDescription className="tabular">
                  {formatDate(year.start_date)} → {formatDate(year.end_date)}
                </CardDescription>
              </div>

              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {!year.is_current ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => currentMutation.mutate(year.id)}
                      disabled={currentMutation.isPending}
                    >
                      <Check className="size-4" />
                      Définir comme année en cours
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setYearToDelete(year)}
                  >
                    <Trash2 className="size-4" />
                    Supprimer
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              <TermsCard year={year} />
            </CardContent>
          </Card>
        ))
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouvelle année scolaire"
        description="Les périodes sont générées automatiquement en découpant l'année en parts égales."
        schema={yearSchema}
        defaultValues={{
          name: `${nextYear}-${nextYear + 1}`,
          start_date: `${nextYear}-09-01`,
          end_date: `${nextYear + 1}-07-05`,
          term_kind: 'trimester',
          term_count: 3,
          is_current: academicYears.length === 0,
        }}
        onSubmit={(values) => createMutation.mutateAsync(values)}
        submitLabel="Créer"
      >
        {(form) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="name"
              label="Libellé"
              placeholder="2026-2027"
              className="sm:col-span-2"
            />
            <DateField control={form.control} name="start_date" label="Début" />
            <DateField control={form.control} name="end_date" label="Fin" />
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
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(yearToDelete)}
        onOpenChange={(open) => !open && setYearToDelete(null)}
        title={`Supprimer l'année « ${yearToDelete?.name} » ?`}
        description="Toutes les périodes, classes, inscriptions et notes de cette année seront supprimées. Action irréversible."
        confirmLabel="Supprimer définitivement"
        destructive
        onConfirm={async () => {
          if (yearToDelete) await deleteMutation.mutateAsync(yearToDelete.id)
          setYearToDelete(null)
        }}
      />
    </div>
  )
}
