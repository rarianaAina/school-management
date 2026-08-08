import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { BookOpen, Pencil, Plus, Sparkles, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatCard } from '@/components/shared/StatCard'
import { RoleGate } from '@/components/shared/RoleGate'
import { SelectField, SwitchField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { queryClient } from '@/lib/queryClient'
import { initials } from '@/lib/formatters'
import { listTeachers } from '@/features/staff/api/teachers.api'
import { enrollStudents, listStudents, withdrawEnrollment } from '@/features/students/api/students.api'
import type { StudentOverview } from '@/types/domain'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import {
  applySubjectTemplate,
  deleteClassSubject,
  getClass,
  listClassSubjects,
  listSubjects,
  upsertClassSubject,
  type ClassSubjectRow,
} from '../api/academics.api'

const classSubjectSchema = z.object({
  subject_id: z.string().min(1, 'Matière requise'),
  teacher_id: z.string().nullable(),
  coefficient: z.coerce.number().min(0.5).max(50),
  credits: z.coerce.number().min(0.5).max(60).nullable(),
  max_score: z.coerce.number().min(1).max(1000),
  weekly_hours: z.coerce.number().min(0).max(60).nullable(),
  is_optional: z.boolean(),
})

type ClassSubjectValues = z.infer<typeof classSubjectSchema>

export function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const { schoolId, selectedYearId, settings, can } = useSchool()
  const isEcts = settings.grading.mode === 'ects'

  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<ClassSubjectRow | null>(null)
  const [subjectToDelete, setSubjectToDelete] = useState<ClassSubjectRow | null>(null)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const debouncedCandidate = useDebouncedValue(candidateSearch, 300)
  const [candidateIds, setCandidateIds] = useState<string[]>([])
  const [toWithdraw, setToWithdraw] = useState<StudentOverview | null>(null)

  const classQuery = useQuery({
    queryKey: ['class', schoolId, classId],
    enabled: Boolean(classId),
    queryFn: () => getClass(classId!),
  })

  const subjectsQuery = useQuery({
    queryKey: ['class-subjects', schoolId, classId],
    enabled: Boolean(classId),
    queryFn: () => listClassSubjects(classId!),
  })

  const studentsQuery = useQuery({
    queryKey: ['students', schoolId, { classId, year: selectedYearId }],
    enabled: Boolean(classId && selectedYearId),
    queryFn: () =>
      listStudents(schoolId!, selectedYearId!, { classId }, 1, 200, {
        column: 'last_name',
        direction: 'asc',
      }),
  })

  const candidatesQuery = useQuery({
    queryKey: ['students-unassigned', schoolId, selectedYearId, debouncedCandidate],
    enabled: Boolean(enrollOpen && schoolId && selectedYearId),
    queryFn: () =>
      listStudents(
        schoolId!,
        selectedYearId!,
        { search: debouncedCandidate, unassigned: true },
        1,
        50,
        { column: 'last_name', direction: 'asc' },
      ),
  })

  const allSubjectsQuery = useQuery({
    queryKey: ['subjects', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listSubjects(schoolId!),
  })

  const teachersQuery = useQuery({
    queryKey: ['teachers', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listTeachers(schoolId!),
  })

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['class-subjects', schoolId, classId] }),
      queryClient.invalidateQueries({ queryKey: ['class', schoolId, classId] }),
      queryClient.invalidateQueries({ queryKey: ['classes', schoolId] }),
      queryClient.invalidateQueries({ queryKey: ['students', schoolId] }),
    ])
  }

  const saveSubjectMutation = useMutation({
    mutationFn: (values: ClassSubjectValues) =>
      upsertClassSubject({
        id: editingSubject?.id,
        school_id: schoolId!,
        class_id: classId!,
        ...values,
      }),
    onSuccess: async () => {
      await refreshAll()
      toast.success(editingSubject ? 'Matière mise à jour.' : 'Matière ajoutée.')
      setEditingSubject(null)
    },
  })

  const deleteSubjectMutation = useMutation({
    mutationFn: (id: string) => deleteClassSubject(id),
    onSuccess: async () => {
      await refreshAll()
      toast.success('Matière retirée.')
    },
  })

  const templateMutation = useMutation({
    mutationFn: () => applySubjectTemplate(classId!),
    onSuccess: async (count) => {
      await refreshAll()
      toast.success(
        count > 0
          ? `${count} matière${count > 1 ? 's' : ''} reprise${count > 1 ? 's' : ''} du modèle du niveau.`
          : 'Aucune nouvelle matière à reprendre.',
      )
    },
  })

  const enrollMutation = useMutation({
    mutationFn: (ids: string[]) => enrollStudents(classId!, ids),
    onSuccess: async (count) => {
      await refreshAll()
      setCandidateIds([])
      setEnrollOpen(false)
      toast.success(`${count} élève${count > 1 ? 's' : ''} inscrit${count > 1 ? 's' : ''}.`)
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: (enrollmentId: string) => withdrawEnrollment(enrollmentId, null),
    onSuccess: async () => {
      await refreshAll()
      toast.success('Élève retiré de la classe.')
    },
  })

  const klass = classQuery.data

  const totalCoefficient = useMemo(
    () => (subjectsQuery.data ?? []).reduce((sum, row) => sum + Number(row.coefficient), 0),
    [subjectsQuery.data],
  )
  const totalCredits = useMemo(
    () => (subjectsQuery.data ?? []).reduce((sum, row) => sum + Number(row.credits ?? 0), 0),
    [subjectsQuery.data],
  )
  const weeklyHours = useMemo(
    () => (subjectsQuery.data ?? []).reduce((sum, row) => sum + Number(row.weekly_hours ?? 0), 0),
    [subjectsQuery.data],
  )

  if (classQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!klass) return <NotFoundPage />

  const subjectColumns: Column<ClassSubjectRow>[] = [
    {
      id: 'subject',
      header: settings.vocabulary.subject,
      cell: (row) => <span className="font-medium">{row.subject?.name}</span>,
    },
    {
      id: 'teacher',
      header: 'Enseignant',
      cell: (row) =>
        row.teacher?.full_name ?? (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Non affecté
          </Badge>
        ),
    },
    {
      id: 'coefficient',
      header: isEcts ? 'Coef. / crédits' : 'Coefficient',
      align: 'right',
      cell: (row) => (
        <span className="tabular">
          {Number(row.coefficient)}
          {isEcts && row.credits ? ` · ${Number(row.credits)} ECTS` : ''}
        </span>
      ),
    },
    {
      id: 'max_score',
      header: 'Barème',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular">/ {Number(row.max_score)}</span>,
    },
    {
      id: 'weekly_hours',
      header: 'h/sem.',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular">{row.weekly_hours ?? '—'}</span>,
    },
    ...(can('academics:write')
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            width: '96px',
            cell: (row: ClassSubjectRow) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Modifier"
                  onClick={() => {
                    setEditingSubject(row)
                    setSubjectDialogOpen(true)
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Retirer"
                  className="text-destructive"
                  onClick={() => setSubjectToDelete(row)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]

  const studentColumns: Column<StudentOverview>[] = [
    {
      id: 'student',
      header: 'Élève',
      cell: (student) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarImage src={student.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-xs">
              {initials(student.first_name, student.last_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{student.full_name}</p>
            <p className="tabular truncate text-xs text-muted-foreground">{student.matricule}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'repeating',
      header: '',
      cell: (student) =>
        student.is_repeating ? <Badge variant="secondary">Redoublant</Badge> : null,
    },
    ...(can('student:write')
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            width: '60px',
            cell: (student: StudentOverview) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Retirer de la classe"
                className="text-destructive"
                onClick={(event) => {
                  event.stopPropagation()
                  setToWithdraw(student)
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={klass.name ?? ''}
        description={
          <span>
            {klass.level_name}
            {klass.program_name ? ` · ${klass.program_name}` : ''}
            {klass.main_teacher_name ? ` · professeur principal : ${klass.main_teacher_name}` : ''}
          </span>
        }
        breadcrumbs={[
          { label: 'Accueil', to: '/' },
          { label: `${settings.vocabulary.class}s`, to: '/classes' },
          { label: klass.name ?? '' },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Effectif"
          value={`${klass.enrolled_count}${klass.capacity ? ` / ${klass.capacity}` : ''}`}
          icon={Users}
          hint={klass.fill_rate !== null ? `${klass.fill_rate} % de remplissage` : undefined}
          tone={Number(klass.fill_rate ?? 0) > 100 ? 'destructive' : 'default'}
        />
        <StatCard label={`${settings.vocabulary.subject}s`} value={klass.subject_count ?? 0} icon={BookOpen} />
        <StatCard
          label={isEcts ? 'Crédits ECTS' : 'Somme des coefficients'}
          value={isEcts ? totalCredits : totalCoefficient}
        />
        <StatCard label="Heures hebdomadaires" value={weeklyHours || '—'} />
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Élèves ({klass.enrolled_count})</TabsTrigger>
          <TabsTrigger value="subjects">
            {settings.vocabulary.subject}s ({klass.subject_count})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4 pt-4">
          <RoleGate permission="student:write">
            <div className="flex justify-end">
              <Button onClick={() => setEnrollOpen(true)}>
                <UserPlus className="size-4" />
                Inscrire des élèves
              </Button>
            </div>
          </RoleGate>

          <DataTable
            columns={studentColumns}
            rows={studentsQuery.data?.rows ?? []}
            getRowId={(student) => student.id!}
            isLoading={studentsQuery.isPending}
            onRowClick={(student) => navigate(`/eleves/${student.id}`)}
            emptyState={
              <EmptyState
                icon={Users}
                title="Aucun élève inscrit"
                description="Inscrivez des élèves dans cette classe pour bâtir son emploi du temps et saisir ses notes."
              />
            }
          />
        </TabsContent>

        <TabsContent value="subjects" className="space-y-4 pt-4">
          <RoleGate permission="academics:write">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => templateMutation.mutate()}
                disabled={templateMutation.isPending}
              >
                <Sparkles className="size-4" />
                Reprendre le modèle du niveau
              </Button>
              <Button
                onClick={() => {
                  setEditingSubject(null)
                  setSubjectDialogOpen(true)
                }}
              >
                <Plus className="size-4" />
                Ajouter une {settings.vocabulary.subject.toLowerCase()}
              </Button>
            </div>
          </RoleGate>

          <DataTable
            columns={subjectColumns}
            rows={subjectsQuery.data ?? []}
            getRowId={(row) => row.id}
            isLoading={subjectsQuery.isPending}
            emptyState={
              <EmptyState
                icon={BookOpen}
                title="Aucune matière"
                description="Reprenez le modèle défini pour le niveau, ou ajoutez les matières une à une."
              />
            }
          />

          {(subjectsQuery.data ?? []).some((row) => !row.teacher_id) ? (
            <Card className="border-warning/40">
              <CardContent className="p-4 text-sm text-muted-foreground">
                Certaines matières n&apos;ont pas d&apos;enseignant affecté : elles ne pourront pas
                être placées à l&apos;emploi du temps ni recevoir de notes.
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      <FormDialog
        open={subjectDialogOpen}
        onOpenChange={(open) => {
          setSubjectDialogOpen(open)
          if (!open) setEditingSubject(null)
        }}
        title={editingSubject ? `Modifier — ${editingSubject.subject?.name}` : 'Ajouter une matière'}
        schema={classSubjectSchema}
        size="sm"
        defaultValues={{
          subject_id: editingSubject?.subject_id ?? '',
          teacher_id: editingSubject?.teacher_id ?? null,
          coefficient: Number(editingSubject?.coefficient ?? 1),
          credits: editingSubject?.credits ? Number(editingSubject.credits) : null,
          max_score: Number(editingSubject?.max_score ?? settings.grading.scale),
          weekly_hours: editingSubject?.weekly_hours ? Number(editingSubject.weekly_hours) : null,
          is_optional: editingSubject?.is_optional ?? false,
        }}
        onSubmit={(values) => saveSubjectMutation.mutateAsync(values)}
      >
        {(form) => (
          <div className="space-y-4">
            <SelectField
              control={form.control}
              name="subject_id"
              label={settings.vocabulary.subject}
              disabled={Boolean(editingSubject)}
              options={(allSubjectsQuery.data ?? []).map((subject) => ({
                value: subject.id,
                label: subject.name,
              }))}
            />
            <SelectField
              control={form.control}
              name="teacher_id"
              label="Enseignant"
              placeholder="Non affecté"
              options={(teachersQuery.data ?? []).map((teacher) => ({
                value: teacher.id,
                label: teacher.full_name ?? '',
              }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="coefficient" label="Coefficient" type="number" />
              {isEcts ? (
                <TextField control={form.control} name="credits" label="Crédits ECTS" type="number" />
              ) : null}
              <TextField control={form.control} name="max_score" label="Barème" type="number" />
              <TextField
                control={form.control}
                name="weekly_hours"
                label="Heures / semaine"
                type="number"
              />
            </div>
            <SwitchField
              control={form.control}
              name="is_optional"
              label="Matière optionnelle"
              description="Exclue du calcul de la moyenne générale si l'élève ne la suit pas."
            />
          </div>
        )}
      </FormDialog>

      {/* Inscription en masse */}
      <FormDialog
        open={enrollOpen}
        onOpenChange={(open) => {
          setEnrollOpen(open)
          if (!open) {
            setCandidateIds([])
            setCandidateSearch('')
          }
        }}
        title={`Inscrire des élèves en ${klass.name}`}
        description="Seuls les élèves sans classe pour l'année sélectionnée sont proposés."
        schema={z.object({})}
        defaultValues={{}}
        submitLabel={
          candidateIds.length > 0 ? `Inscrire ${candidateIds.length} élève(s)` : 'Inscrire'
        }
        onSubmit={() => {
          if (candidateIds.length === 0) {
            toast.error('Sélectionnez au moins un élève.')
            throw new Error('Aucun élève sélectionné')
          }
          return enrollMutation.mutateAsync(candidateIds)
        }}
      >
        {() => (
          <div className="space-y-4">
            <Input
              value={candidateSearch}
              onChange={(event) => setCandidateSearch(event.target.value)}
              placeholder="Rechercher par nom ou matricule…"
            />
            <DataTable
              columns={[
                {
                  id: 'name',
                  header: 'Élève',
                  cell: (student: StudentOverview) => (
                    <div>
                      <p className="font-medium">{student.full_name}</p>
                      <p className="tabular text-xs text-muted-foreground">{student.matricule}</p>
                    </div>
                  ),
                },
              ]}
              rows={candidatesQuery.data?.rows ?? []}
              getRowId={(student) => student.id!}
              isLoading={candidatesQuery.isPending}
              selection={{ selectedIds: candidateIds, onChange: setCandidateIds }}
              emptyState={
                <EmptyState
                  title="Aucun élève disponible"
                  description="Tous les élèves sont déjà affectés à une classe pour cette année."
                />
              }
            />
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(subjectToDelete)}
        onOpenChange={(open) => !open && setSubjectToDelete(null)}
        title={`Retirer « ${subjectToDelete?.subject?.name} » de la classe ?`}
        description="Les évaluations et notes rattachées à cette matière seront supprimées."
        confirmLabel="Retirer"
        destructive
        onConfirm={async () => {
          if (subjectToDelete) await deleteSubjectMutation.mutateAsync(subjectToDelete.id)
          setSubjectToDelete(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(toWithdraw)}
        onOpenChange={(open) => !open && setToWithdraw(null)}
        title={`Retirer ${toWithdraw?.full_name} de la classe ?`}
        description="L'inscription passe au statut « retiré ». L'historique et les notes déjà saisies sont conservés."
        confirmLabel="Retirer"
        destructive
        onConfirm={async () => {
          if (toWithdraw?.enrollment_id) await withdrawMutation.mutateAsync(toWithdraw.enrollment_id)
          setToWithdraw(null)
        }}
      />
    </div>
  )
}
