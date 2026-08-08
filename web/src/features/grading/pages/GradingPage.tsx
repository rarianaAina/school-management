import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  ClipboardList,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { RoleGate } from '@/components/shared/RoleGate'
import { DateField, SelectField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import { formatDate, formatNumber } from '@/lib/formatters'
import { listClasses, listClassSubjects } from '@/features/academics/api/academics.api'
import {
  createAssessment,
  deleteAssessment,
  getGradeSheet,
  listAssessmentTypes,
  listAssessments,
  saveGrades,
  updateAssessment,
  type AssessmentRow,
  type GradeInput,
} from '../api/grading.api'

const assessmentSchema = z.object({
  title: z.string().min(1, 'Intitulé requis').max(120),
  assessment_type_id: z.string().nullable(),
  date: z.string().min(1, 'Date requise'),
  max_score: z.coerce.number().min(1).max(1000),
  weight: z.coerce.number().min(0.25).max(20),
})

type AssessmentValues = z.infer<typeof assessmentSchema>

interface SheetEntry extends GradeInput {
  full_name: string
  matricule: string
}

export function GradingPage() {
  const { schoolId, selectedYearId, settings, terms, currentTerm, can } = useSchool()

  const [classId, setClassId] = useState('')
  const [classSubjectId, setClassSubjectId] = useState('')
  const [termId, setTermId] = useState('')
  const [assessment, setAssessment] = useState<AssessmentRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<AssessmentRow | null>(null)
  const [sheet, setSheet] = useState<SheetEntry[]>([])
  const [dirty, setDirty] = useState(false)
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (!termId && currentTerm) setTermId(currentTerm.id)
  }, [currentTerm, termId])

  const lockedTerm = terms.find((term) => term.id === termId)?.is_locked ?? false

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  useEffect(() => {
    if (!classId && classesQuery.data?.[0]?.id) setClassId(classesQuery.data[0].id!)
  }, [classesQuery.data, classId])

  const subjectsQuery = useQuery({
    queryKey: ['class-subjects', schoolId, classId],
    enabled: Boolean(classId),
    queryFn: () => listClassSubjects(classId),
  })

  useEffect(() => {
    setClassSubjectId('')
    setAssessment(null)
  }, [classId])

  const typesQuery = useQuery({
    queryKey: ['assessment-types', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listAssessmentTypes(schoolId!),
  })

  const assessmentsQuery = useQuery({
    queryKey: ['assessments', schoolId, classSubjectId, termId],
    enabled: Boolean(classSubjectId && termId),
    queryFn: () => listAssessments(classSubjectId, termId),
  })

  const sheetQuery = useQuery({
    queryKey: ['grade-sheet', schoolId, assessment?.id, classId],
    enabled: Boolean(assessment && classId),
    queryFn: () => getGradeSheet(assessment!.id, classId),
  })

  // La feuille est éditée localement puis enregistrée d'un bloc : saisir vingt
  // notes ne doit pas déclencher vingt requêtes.
  useEffect(() => {
    if (!sheetQuery.data) return
    setSheet(
      sheetQuery.data.map((row) => ({
        student_id: row.student_id,
        full_name: row.full_name,
        matricule: row.matricule,
        score: row.grade?.score !== null && row.grade?.score !== undefined ? Number(row.grade.score) : null,
        is_absent: row.grade?.is_absent ?? false,
        is_excused: row.grade?.is_excused ?? false,
        comment: row.grade?.comment ?? null,
      })),
    )
    setDirty(false)
  }, [sheetQuery.data])

  const refreshAssessments = () =>
    queryClient.invalidateQueries({ queryKey: ['assessments', schoolId] })

  const createMutation = useMutation({
    mutationFn: (values: AssessmentValues) =>
      createAssessment({
        school_id: schoolId!,
        class_subject_id: classSubjectId,
        term_id: termId,
        ...values,
      }),
    onSuccess: async () => {
      await refreshAssessments()
      toast.success('Évaluation créée.')
    },
  })

  const publishMutation = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      updateAssessment(id, { is_published: published }),
    onSuccess: async (_, variables) => {
      await refreshAssessments()
      toast.success(
        variables.published
          ? 'Notes visibles par les élèves et les parents.'
          : 'Notes masquées.',
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAssessment(id),
    onSuccess: async () => {
      await refreshAssessments()
      setAssessment(null)
      toast.success('Évaluation supprimée.')
    },
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      saveGrades(
        schoolId!,
        assessment!.id,
        sheet.map(({ student_id, score, is_absent, is_excused, comment }) => ({
          student_id,
          score,
          is_absent,
          is_excused,
          comment,
        })),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['grade-sheet', schoolId] })
      await refreshAssessments()
      setDirty(false)
      toast.success('Notes enregistrées.')
    },
  })

  function updateRow(index: number, patch: Partial<SheetEntry>) {
    setSheet((current) =>
      current.map((row, position) => (position === index ? { ...row, ...patch } : row)),
    )
    setDirty(true)
  }

  const stats = useMemo(() => {
    const scored = sheet.filter((row) => row.score !== null && !row.is_absent)
    const total = scored.reduce((sum, row) => sum + (row.score ?? 0), 0)
    return {
      entered: scored.length,
      missing: sheet.length - scored.length - sheet.filter((row) => row.is_absent).length,
      absent: sheet.filter((row) => row.is_absent).length,
      average: scored.length > 0 ? total / scored.length : null,
    }
  }, [sheet])

  const assessmentColumns: Column<AssessmentRow>[] = [
    {
      id: 'title',
      header: 'Évaluation',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">
            {row.type?.name ?? 'Sans type'} · {formatDate(row.date)}
          </p>
        </div>
      ),
    },
    {
      id: 'weight',
      header: 'Poids',
      align: 'right',
      cell: (row) => <span className="tabular">×{formatNumber(Number(row.weight), 2)}</span>,
    },
    {
      id: 'max',
      header: 'Barème',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular">/ {formatNumber(Number(row.max_score), 0)}</span>,
    },
    {
      id: 'graded',
      header: 'Saisies',
      align: 'right',
      cell: (row) => <span className="tabular">{row.graded_count}</span>,
    },
    {
      id: 'published',
      header: 'Visibilité',
      cell: (row) =>
        row.is_published ? (
          <Badge variant="secondary" className="gap-1">
            <Eye className="size-3" />
            Publiée
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <EyeOff className="size-3" />
            Brouillon
          </Badge>
        ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      width: '120px',
      cell: (row) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => publishMutation.mutate({ id: row.id, published: !row.is_published })}
          >
            {row.is_published ? 'Masquer' : 'Publier'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Supprimer"
            className="text-destructive"
            onClick={() => setToDelete(row)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notes"
        description="Évaluations, saisie et moyennes par matière."
        actions={
          <RoleGate permission="grade:write">
            <Button
              onClick={() => setDialogOpen(true)}
              disabled={!classSubjectId || !termId || lockedTerm}
            >
              <Plus className="size-4" />
              Nouvelle évaluation
            </Button>
          </RoleGate>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Select value={classId || undefined} onValueChange={setClassId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={settings.vocabulary.class} />
            </SelectTrigger>
            <SelectContent>
              {(classesQuery.data ?? []).map((item) => (
                <SelectItem key={item.id!} value={item.id!}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={classSubjectId || undefined} onValueChange={setClassSubjectId}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder={settings.vocabulary.subject} />
            </SelectTrigger>
            <SelectContent>
              {(subjectsQuery.data ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.subject?.name}
                  {item.teacher?.full_name ? ` — ${item.teacher.full_name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={termId || undefined} onValueChange={setTermId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={settings.vocabulary.term} />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name}
                  {term.is_locked ? ' (verrouillée)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {lockedTerm ? (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            Cette période est verrouillée : la saisie y est close pour les enseignants. Seule
            l&apos;administration peut encore intervenir.
          </AlertDescription>
        </Alert>
      ) : null}

      {!classSubjectId ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={GraduationCap}
              title="Choisissez une matière"
              description="Sélectionnez une classe puis une matière pour afficher ses évaluations."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <DataTable
            columns={assessmentColumns}
            rows={assessmentsQuery.data ?? []}
            getRowId={(row) => row.id}
            isLoading={assessmentsQuery.isPending}
            onRowClick={setAssessment}
            emptyState={
              <EmptyState
                icon={ClipboardList}
                title="Aucune évaluation"
                description="Créez une évaluation pour saisir les notes de cette matière sur la période."
              />
            }
          />

          {assessment ? (
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{assessment.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      Barème / {formatNumber(Number(assessment.max_score), 0)} · poids ×
                      {formatNumber(Number(assessment.weight), 2)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {stats.entered} saisie{stats.entered > 1 ? 's' : ''}
                      {stats.absent > 0 ? ` · ${stats.absent} absent(s)` : ''}
                      {stats.missing > 0 ? ` · ${stats.missing} manquante(s)` : ''}
                    </span>
                    {stats.average !== null ? (
                      <Badge variant="secondary" className="tabular">
                        Moyenne {formatNumber(stats.average, 2)}
                      </Badge>
                    ) : null}
                    <RoleGate permission="grade:write">
                      <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={!dirty || saveMutation.isPending || lockedTerm}
                      >
                        <Save className="size-4" />
                        Enregistrer
                      </Button>
                    </RoleGate>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Élève</th>
                        <th className="w-28 px-3 py-2 text-right font-medium">Note</th>
                        <th className="w-24 px-3 py-2 text-center font-medium">Absent</th>
                        <th className="w-28 px-3 py-2 text-center font-medium">Justifié</th>
                        <th className="px-3 py-2 text-left font-medium">Appréciation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sheet.map((row, index) => (
                        <tr key={row.student_id} className="hover:bg-accent/30">
                          <td className="px-3 py-1.5">
                            <p className="font-medium">{row.full_name}</p>
                            <p className="tabular text-xs text-muted-foreground">{row.matricule}</p>
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              ref={(element) => {
                                inputsRef.current[index] = element
                              }}
                              type="number"
                              inputMode="decimal"
                              step="0.25"
                              min={0}
                              max={Number(assessment.max_score)}
                              value={row.score ?? ''}
                              disabled={row.is_absent || lockedTerm || !can('grade:write')}
                              className="tabular h-8 text-right"
                              onChange={(event) =>
                                updateRow(index, {
                                  score: event.target.value === '' ? null : Number(event.target.value),
                                })
                              }
                              onKeyDown={(event) => {
                                // Entrée descend d'une ligne : la saisie d'une
                                // classe entière se fait au clavier, sans souris.
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  inputsRef.current[index + 1]?.focus()
                                }
                              }}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Checkbox
                              checked={row.is_absent}
                              disabled={lockedTerm || !can('grade:write')}
                              onCheckedChange={(checked) =>
                                updateRow(index, {
                                  is_absent: Boolean(checked),
                                  score: checked ? null : row.score,
                                  is_excused: checked ? row.is_excused : false,
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Checkbox
                              checked={row.is_excused}
                              disabled={!row.is_absent || lockedTerm || !can('grade:write')}
                              onCheckedChange={(checked) =>
                                updateRow(index, { is_excused: Boolean(checked) })
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              value={row.comment ?? ''}
                              disabled={lockedTerm || !can('grade:write')}
                              className="h-8"
                              placeholder="Facultatif"
                              onChange={(event) =>
                                updateRow(index, { comment: event.target.value || null })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground text-pretty">
                  Une absence non justifiée compte comme zéro dans la moyenne ; une absence
                  justifiée en est exclue.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouvelle évaluation"
        schema={assessmentSchema}
        size="sm"
        defaultValues={{
          title: '',
          assessment_type_id: null,
          date: new Date().toISOString().slice(0, 10),
          max_score: settings.grading.scale,
          weight: 1,
        }}
        onSubmit={(values) => createMutation.mutateAsync(values)}
        submitLabel="Créer"
      >
        {(form) => (
          <div className="space-y-4">
            <TextField
              control={form.control}
              name="title"
              label="Intitulé"
              placeholder="Devoir surveillé n°1"
            />
            <SelectField
              control={form.control}
              name="assessment_type_id"
              label="Type"
              placeholder="Aucun"
              options={(typesQuery.data ?? []).map((type) => ({
                value: type.id,
                label: type.name,
              }))}
            />
            <DateField control={form.control} name="date" label="Date" />
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="max_score" label="Barème" type="number" />
              <TextField
                control={form.control}
                name="weight"
                label="Poids"
                type="number"
                description="Dans la moyenne de la matière."
              />
            </div>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Supprimer « ${toDelete?.title} » ?`}
        description="Toutes les notes saisies pour cette évaluation seront supprimées."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (toDelete) await deleteMutation.mutateAsync(toDelete.id)
          setToDelete(null)
        }}
      />
    </div>
  )
}
