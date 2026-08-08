import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  ArrowLeft,
  ArrowUpFromLine,
  CalendarClock,
  Gavel,
  MapPin,
  Plus,
  Save,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { StatCard } from '@/components/shared/StatCard'
import { RoleGate } from '@/components/shared/RoleGate'
import { DateField, SelectField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import { formatDate, formatNumber, formatTime } from '@/lib/formatters'
import { listClasses, listRooms, listSubjects } from '@/features/academics/api/academics.api'
import { listTeachers } from '@/features/staff/api/teachers.api'
import {
  EXAM_DECISION_LABELS,
  EXAM_SESSION_STATUS_LABELS,
  EXAM_SESSION_TYPE_LABELS,
  type ExamDecision,
  type ExamSessionOverview,
  type ExamSessionStatus,
  type ExamSessionType,
} from '@/types/domain'
import {
  addExamRoom,
  listSessions,
  addSupervisor,
  assignSeats,
  computeDeliberations,
  createExam,
  createSession,
  deleteExam,
  deleteSession,
  getExamResultSheet,
  listDeliberations,
  listExams,
  listRegistrations,
  overrideDecision,
  pushExamToGrades,
  registerClass,
  saveExamResults,
  updateSession,
  type ExamResultSheetRow,
  type ExamRow,
} from '../api/exams.api'

const sessionSchema = z
  .object({
    name: z.string().min(1, 'Intitulé requis').max(120),
    type: z.enum(['regular', 'resit', 'entrance', 'final', 'mock']),
    term_id: z.string().nullable(),
    start_date: z.string().min(1),
    end_date: z.string().min(1),
  })
  .refine((values) => values.end_date >= values.start_date, {
    message: 'La fin doit suivre le début',
    path: ['end_date'],
  })

const examSchema = z.object({
  subject_id: z.string().min(1, 'Matière requise'),
  class_id: z.string().nullable(),
  date: z.string().min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  duration_minutes: z.coerce.number().int().min(15).max(480),
  max_score: z.coerce.number().min(1).max(1000),
  coefficient: z.coerce.number().min(0.5).max(20),
})

const roomSchema = z.object({
  room_id: z.string().min(1, 'Salle requise'),
  capacity: z.coerce.number().int().min(1).max(2000).nullable(),
  teacher_id: z.string().nullable(),
  role: z.enum(['invigilator', 'chief', 'floater']),
})

const STATUS_VARIANT: Record<ExamSessionStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'outline',
  scheduled: 'secondary',
  ongoing: 'default',
  graded: 'secondary',
  deliberated: 'default',
  closed: 'outline',
}

const DECISION_VARIANT: Record<ExamDecision, 'default' | 'secondary' | 'outline'> = {
  admitted: 'default',
  resit: 'secondary',
  deferred: 'outline',
  failed: 'outline',
  excluded: 'outline',
}

export function ExamsPage() {
  const { schoolId, selectedYearId, settings, terms, currentTerm, can } = useSchool()
  const canManage = can('exam:write')

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionDialog, setSessionDialog] = useState(false)
  const [examDialog, setExamDialog] = useState(false)
  const [roomDialogFor, setRoomDialogFor] = useState<ExamRow | null>(null)
  const [registerFor, setRegisterFor] = useState('')
  const [gradingExam, setGradingExam] = useState<ExamRow | null>(null)
  const [sheet, setSheet] = useState<ExamResultSheetRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [toDelete, setToDelete] = useState<ExamSessionOverview | null>(null)

  const sessionsQuery = useQuery({
    queryKey: ['exam-sessions', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listSessions(schoolId!, selectedYearId!),
  })

  const session = sessionsQuery.data?.find((item) => item.id === sessionId) ?? null

  const examsQuery = useQuery({
    queryKey: ['exams', schoolId, sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => listExams(sessionId!),
  })

  const registrationsQuery = useQuery({
    queryKey: ['exam-registrations', schoolId, sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => listRegistrations(sessionId!),
  })

  const deliberationsQuery = useQuery({
    queryKey: ['deliberations', schoolId, sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => listDeliberations(sessionId!),
  })

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  const subjectsQuery = useQuery({
    queryKey: ['subjects', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listSubjects(schoolId!),
  })

  const roomsQuery = useQuery({
    queryKey: ['rooms', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listRooms(schoolId!),
  })

  const teachersQuery = useQuery({
    queryKey: ['teachers', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listTeachers(schoolId!),
  })

  const sheetQuery = useQuery({
    queryKey: ['exam-result-sheet', gradingExam?.id, sessionId],
    enabled: Boolean(gradingExam && sessionId),
    queryFn: () => getExamResultSheet(gradingExam!.id, sessionId!),
  })

  useEffect(() => {
    if (sheetQuery.data) {
      setSheet(sheetQuery.data)
      setDirty(false)
    }
  }, [sheetQuery.data])

  const invalidate = (key: string) =>
    queryClient.invalidateQueries({ queryKey: [key, schoolId] })

  const createSessionMutation = useMutation({
    mutationFn: (values: z.infer<typeof sessionSchema>) =>
      createSession({ school_id: schoolId!, academic_year_id: selectedYearId!, ...values }),
    onSuccess: async (created) => {
      await invalidate('exam-sessions')
      setSessionId(created.id)
      toast.success('Session créée.')
    },
  })

  const createExamMutation = useMutation({
    mutationFn: (values: z.infer<typeof examSchema>) =>
      createExam({
        school_id: schoolId!,
        exam_session_id: sessionId!,
        level_id: null,
        ...values,
        start_time: `${values.start_time}:00`,
      }),
    onSuccess: async () => {
      await Promise.all([invalidate('exams'), invalidate('exam-sessions')])
      toast.success('Épreuve planifiée.')
    },
  })

  const roomMutation = useMutation({
    mutationFn: async (values: z.infer<typeof roomSchema>) => {
      const examRoomId = await addExamRoom({
        school_id: schoolId!,
        exam_id: roomDialogFor!.id,
        room_id: values.room_id,
        capacity: values.capacity,
      })
      if (values.teacher_id) {
        await addSupervisor({
          school_id: schoolId!,
          exam_room_id: examRoomId,
          teacher_id: values.teacher_id,
          role: values.role,
        })
      }
    },
    onSuccess: async () => {
      await invalidate('exams')
      toast.success('Salle et surveillance enregistrées.')
    },
  })

  const registerMutation = useMutation({
    mutationFn: (classId: string) => registerClass(sessionId!, classId),
    onSuccess: async (count) => {
      await Promise.all([invalidate('exam-registrations'), invalidate('exam-sessions')])
      toast.success(
        count > 0
          ? `${count} convocation${count > 1 ? 's' : ''} générée${count > 1 ? 's' : ''}.`
          : 'Ces élèves étaient déjà convoqués.',
      )
    },
  })

  const seatsMutation = useMutation({
    mutationFn: (examId: string) => assignSeats(examId),
    onSuccess: async (count) => {
      await invalidate('exam-registrations')
      toast.success(`${count} place(s) attribuée(s) selon la capacité des salles.`)
    },
  })

  const saveResultsMutation = useMutation({
    mutationFn: () => saveExamResults(schoolId!, gradingExam!.id, sheet),
    onSuccess: async () => {
      await Promise.all([invalidate('exams'), invalidate('exam-result-sheet')])
      setDirty(false)
      toast.success('Résultats enregistrés.')
    },
  })

  const pushMutation = useMutation({
    mutationFn: (examId: string) => pushExamToGrades(examId, currentTerm!.id),
    onSuccess: (count) =>
      toast.success(`${count} note(s) reportée(s) dans les moyennes de la période.`),
  })

  const deliberateMutation = useMutation({
    mutationFn: () => computeDeliberations(sessionId!),
    onSuccess: async (count) => {
      await Promise.all([invalidate('deliberations'), invalidate('exam-sessions')])
      toast.success(`${count} délibération(s) calculée(s). Le jury peut désormais arbitrer.`)
    },
  })

  const decisionMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      overrideDecision(id, decision, null),
    onSuccess: async () => {
      await invalidate('deliberations')
      toast.success('Décision du jury enregistrée.')
    },
  })

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: async () => {
      await invalidate('exam-sessions')
      setSessionId(null)
      toast.success('Session supprimée.')
    },
  })

  const deleteExamMutation = useMutation({
    mutationFn: (id: string) => deleteExam(id),
    onSuccess: async () => {
      await invalidate('exams')
      setGradingExam(null)
      toast.success('Épreuve supprimée.')
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ExamSessionStatus }) =>
      updateSession(id, { status }),
    onSuccess: async () => {
      await invalidate('exam-sessions')
      toast.success('Statut mis à jour.')
    },
  })

  const deliberations = deliberationsQuery.data ?? []
  const admitted = deliberations.filter((row) => row.decision === 'admitted').length
  const successRate =
    deliberations.length > 0 ? (admitted / deliberations.length) * 100 : null

  // ---------------------------------------------------------------------------
  // Liste des sessions
  // ---------------------------------------------------------------------------
  const sessionColumns: Column<ExamSessionOverview>[] = [
    {
      id: 'name',
      header: 'Session',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {EXAM_SESSION_TYPE_LABELS[row.type as ExamSessionType]}
          </p>
        </div>
      ),
    },
    {
      id: 'dates',
      header: 'Dates',
      hideOnMobile: true,
      cell: (row) => (
        <span className="tabular text-sm text-muted-foreground">
          {formatDate(row.start_date)} → {formatDate(row.end_date)}
        </span>
      ),
    },
    {
      id: 'exams',
      header: 'Épreuves',
      align: 'right',
      cell: (row) => <span className="tabular">{row.exam_count}</span>,
    },
    {
      id: 'registered',
      header: 'Convoqués',
      align: 'right',
      cell: (row) => <span className="tabular">{row.registered_count}</span>,
    },
    {
      id: 'status',
      header: 'Statut',
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status as ExamSessionStatus]}>
          {EXAM_SESSION_STATUS_LABELS[row.status as ExamSessionStatus]}
        </Badge>
      ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            width: '56px',
            cell: (row: ExamSessionOverview) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Supprimer"
                className="text-destructive"
                onClick={(event) => {
                  event.stopPropagation()
                  setToDelete(row)
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            ),
          },
        ]
      : []),
  ]

  if (!sessionId || !session) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Examens"
          description="Sessions, convocations, surveillance, résultats et délibérations."
          actions={
            <RoleGate permission="exam:write">
              <Button onClick={() => setSessionDialog(true)}>
                <Plus className="size-4" />
                Nouvelle session
              </Button>
            </RoleGate>
          }
        />

        <DataTable
          columns={sessionColumns}
          rows={sessionsQuery.data ?? []}
          getRowId={(row) => row.id!}
          isLoading={sessionsQuery.isPending}
          onRowClick={(row) => setSessionId(row.id!)}
          emptyState={
            <EmptyState
              icon={CalendarClock}
              title="Aucune session d'examen"
              description="Créez une session pour planifier les épreuves, convoquer les élèves et organiser la surveillance."
            />
          }
        />

        <SessionDialog
          open={sessionDialog}
          onOpenChange={setSessionDialog}
          terms={terms}
          currentTermId={currentTerm?.id ?? null}
          onSubmit={(values) => createSessionMutation.mutateAsync(values)}
        />

        <ConfirmDialog
          open={Boolean(toDelete)}
          onOpenChange={(open) => !open && setToDelete(null)}
          title={`Supprimer « ${toDelete?.name} » ?`}
          description="Épreuves, convocations, résultats et délibérations de cette session seront supprimés."
          confirmLabel="Supprimer"
          destructive
          onConfirm={async () => {
            if (toDelete?.id) await deleteSessionMutation.mutateAsync(toDelete.id)
            setToDelete(null)
          }}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Détail d'une session
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <PageHeader
        title={session.name ?? ''}
        description={
          <span>
            {EXAM_SESSION_TYPE_LABELS[session.type as ExamSessionType]} ·{' '}
            {formatDate(session.start_date)} → {formatDate(session.end_date)}
          </span>
        }
        breadcrumbs={[{ label: 'Examens', to: '#' }, { label: session.name ?? '' }]}
        actions={
          <>
            <Button variant="ghost" onClick={() => setSessionId(null)}>
              <ArrowLeft className="size-4" />
              Toutes les sessions
            </Button>
            <RoleGate permission="exam:deliberate">
              <Select
                value={session.status ?? undefined}
                onValueChange={(status) =>
                  statusMutation.mutate({ id: session.id!, status: status as ExamSessionStatus })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXAM_SESSION_STATUS_LABELS) as ExamSessionStatus[]).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {EXAM_SESSION_STATUS_LABELS[value]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </RoleGate>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Épreuves" value={session.exam_count ?? 0} icon={CalendarClock} />
        <StatCard label="Convoqués" value={session.registered_count ?? 0} icon={Users} />
        <StatCard label="Délibérés" value={session.deliberated_count ?? 0} icon={Gavel} />
        <StatCard
          label="Taux de réussite"
          value={successRate !== null ? `${formatNumber(successRate, 1)} %` : '—'}
          tone={successRate !== null && successRate >= 60 ? 'success' : 'warning'}
        />
      </div>

      <Tabs defaultValue="exams">
        <TabsList>
          <TabsTrigger value="exams">Épreuves</TabsTrigger>
          <TabsTrigger value="convocations">Convocations</TabsTrigger>
          <TabsTrigger value="results">Résultats</TabsTrigger>
          <TabsTrigger value="jury">Délibération</TabsTrigger>
        </TabsList>

        {/* Épreuves ------------------------------------------------------- */}
        <TabsContent value="exams" className="space-y-4 pt-4">
          <RoleGate permission="exam:write">
            <div className="flex justify-end">
              <Button onClick={() => setExamDialog(true)}>
                <Plus className="size-4" />
                Planifier une épreuve
              </Button>
            </div>
          </RoleGate>

          <div className="grid gap-4 md:grid-cols-2">
            {(examsQuery.data ?? []).map((exam) => (
              <Card key={exam.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{exam.subject?.name}</p>
                      <p className="tabular text-sm text-muted-foreground">
                        {formatDate(exam.date)} · {formatTime(exam.start_time)} ·{' '}
                        {exam.duration_minutes} min
                      </p>
                      {exam.class?.name ? (
                        <p className="text-xs text-muted-foreground">{exam.class.name}</p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="tabular shrink-0">
                      /{formatNumber(Number(exam.max_score), 0)} · coef{' '}
                      {formatNumber(Number(exam.coefficient), 1)}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    {exam.exam_rooms.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune salle affectée.</p>
                    ) : (
                      exam.exam_rooms.map((room) => (
                        <div key={room.id} className="flex items-center gap-2 text-sm">
                          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                          <span>{room.room?.name}</span>
                          <span className="tabular text-xs text-muted-foreground">
                            {room.capacity ?? room.room?.capacity ?? '—'} places
                          </span>
                          {room.exam_supervisors.length > 0 ? (
                            <span className="truncate text-xs text-muted-foreground">
                              · {room.exam_supervisors.map((s) => s.teacher?.full_name).join(', ')}
                            </span>
                          ) : (
                            <Badge variant="outline" className="text-warning">
                              sans surveillant
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <RoleGate permission="exam:write">
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setRoomDialogFor(exam)}>
                        <MapPin className="size-4" />
                        Salle & surveillance
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => seatsMutation.mutate(exam.id)}
                        disabled={exam.exam_rooms.length === 0}
                      >
                        <UserCheck className="size-4" />
                        Répartir les places
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setGradingExam(exam)}>
                        Saisir les résultats ({exam.result_count})
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Supprimer"
                        className="text-destructive"
                        onClick={() => deleteExamMutation.mutate(exam.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </RoleGate>
                </CardContent>
              </Card>
            ))}
          </div>

          {examsQuery.data?.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={CalendarClock}
                  title="Aucune épreuve"
                  description="Planifiez les épreuves de la session, puis affectez salles et surveillants."
                />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* Convocations --------------------------------------------------- */}
        <TabsContent value="convocations" className="space-y-4 pt-4">
          <RoleGate permission="exam:write">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Select value={registerFor || undefined} onValueChange={setRegisterFor}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder={`Convoquer une ${settings.vocabulary.class.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {(classesQuery.data ?? []).map((item) => (
                    <SelectItem key={item.id!} value={item.id!}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => registerFor && registerMutation.mutate(registerFor)}
                disabled={!registerFor || registerMutation.isPending}
              >
                <Users className="size-4" />
                Convoquer
              </Button>
            </div>
          </RoleGate>

          <DataTable
            columns={[
              {
                id: 'convocation',
                header: 'N° convocation',
                cell: (row) => <span className="tabular font-medium">{row.convocation_number}</span>,
              },
              {
                id: 'student',
                header: 'Élève',
                cell: (row) => (
                  <div>
                    <p className="font-medium">{row.student?.full_name}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {row.student?.matricule}
                    </p>
                  </div>
                ),
              },
              {
                id: 'room',
                header: 'Salle',
                cell: (row) =>
                  row.exam_room?.room?.name ?? (
                    <span className="text-muted-foreground">Non affectée</span>
                  ),
              },
              {
                id: 'seat',
                header: 'Place',
                align: 'right',
                cell: (row) => <span className="tabular">{row.seat_number ?? '—'}</span>,
              },
            ]}
            rows={registrationsQuery.data ?? []}
            getRowId={(row) => row.id}
            isLoading={registrationsQuery.isPending}
            emptyState={
              <EmptyState
                icon={Users}
                title="Aucun convoqué"
                description="Convoquez une classe : chaque élève reçoit un numéro de convocation unique et séquentiel."
              />
            }
          />
        </TabsContent>

        {/* Résultats ------------------------------------------------------ */}
        <TabsContent value="results" className="space-y-4 pt-4">
          {!gradingExam ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  title="Choisissez une épreuve"
                  description="Depuis l'onglet Épreuves, cliquez sur « Saisir les résultats »."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{gradingExam.subject?.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(gradingExam.date)} · barème /
                      {formatNumber(Number(gradingExam.max_score), 0)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <RoleGate permission="exam:grade">
                      <Button
                        onClick={() => saveResultsMutation.mutate()}
                        disabled={!dirty || saveResultsMutation.isPending}
                      >
                        <Save className="size-4" />
                        Enregistrer
                      </Button>
                    </RoleGate>
                    <RoleGate permission="exam:write">
                      <Button
                        variant="outline"
                        onClick={() => pushMutation.mutate(gradingExam.id)}
                        disabled={!currentTerm || pushMutation.isPending}
                      >
                        <ArrowUpFromLine className="size-4" />
                        Reporter dans les notes
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
                        <th className="w-24 px-3 py-2 text-center font-medium">Exclu</th>
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
                              type="number"
                              step="0.25"
                              min={0}
                              max={Number(gradingExam.max_score)}
                              value={row.score ?? ''}
                              disabled={row.is_absent || row.is_disqualified}
                              className="tabular h-8 text-right"
                              onChange={(event) => {
                                const score =
                                  event.target.value === '' ? null : Number(event.target.value)
                                setSheet((current) =>
                                  current.map((item, position) =>
                                    position === index ? { ...item, score } : item,
                                  ),
                                )
                                setDirty(true)
                              }}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Checkbox
                              checked={row.is_absent}
                              onCheckedChange={(checked) => {
                                setSheet((current) =>
                                  current.map((item, position) =>
                                    position === index
                                      ? { ...item, is_absent: Boolean(checked), score: null }
                                      : item,
                                  ),
                                )
                                setDirty(true)
                              }}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Checkbox
                              checked={row.is_disqualified}
                              onCheckedChange={(checked) => {
                                setSheet((current) =>
                                  current.map((item, position) =>
                                    position === index
                                      ? { ...item, is_disqualified: Boolean(checked), score: null }
                                      : item,
                                  ),
                                )
                                setDirty(true)
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Délibération ---------------------------------------------------- */}
        <TabsContent value="jury" className="space-y-4 pt-4">
          <RoleGate permission="exam:deliberate">
            <div className="flex justify-end">
              <Button
                onClick={() => deliberateMutation.mutate()}
                disabled={deliberateMutation.isPending}
              >
                <Gavel className="size-4" />
                Calculer les délibérations
              </Button>
            </div>
          </RoleGate>

          <DataTable
            columns={[
              {
                id: 'student',
                header: 'Étudiant',
                cell: (row) => (
                  <div>
                    <p className="font-medium">{row.student?.full_name}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {row.student?.matricule}
                    </p>
                  </div>
                ),
              },
              {
                id: 'average',
                header: 'Moyenne',
                align: 'right',
                cell: (row) => (
                  <span className="tabular font-semibold">
                    {row.computed_average !== null
                      ? formatNumber(Number(row.computed_average), 2)
                      : '—'}
                  </span>
                ),
              },
              {
                id: 'computed',
                header: 'Calcul',
                hideOnMobile: true,
                cell: (row) => (
                  <span className="text-sm text-muted-foreground">
                    {row.computed_decision
                      ? EXAM_DECISION_LABELS[row.computed_decision as ExamDecision]
                      : '—'}
                  </span>
                ),
              },
              {
                id: 'decision',
                header: 'Décision du jury',
                cell: (row) =>
                  canManage ? (
                    <Select
                      value={row.decision ?? undefined}
                      onValueChange={(decision) =>
                        decisionMutation.mutate({ id: row.id, decision })
                      }
                    >
                      <SelectTrigger size="sm" className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(EXAM_DECISION_LABELS) as ExamDecision[]).map((value) => (
                          <SelectItem key={value} value={value}>
                            {EXAM_DECISION_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={DECISION_VARIANT[row.decision as ExamDecision]}>
                      {row.decision ? EXAM_DECISION_LABELS[row.decision as ExamDecision] : '—'}
                    </Badge>
                  ),
              },
              {
                id: 'override',
                header: '',
                cell: (row) =>
                  row.decision && row.decision !== row.computed_decision ? (
                    <Badge variant="secondary">Arbitrage</Badge>
                  ) : null,
              },
            ]}
            rows={deliberations}
            getRowId={(row) => row.id}
            isLoading={deliberationsQuery.isPending}
            emptyState={
              <EmptyState
                icon={Gavel}
                title="Aucune délibération"
                description="Lancez le calcul une fois les résultats saisis. Le jury pourra ensuite arbitrer chaque cas ; l'écart avec la décision calculée reste visible."
              />
            }
          />
        </TabsContent>
      </Tabs>

      {/* Dialogues ------------------------------------------------------- */}
      <FormDialog
        open={examDialog}
        onOpenChange={setExamDialog}
        title="Planifier une épreuve"
        schema={examSchema}
        size="sm"
        defaultValues={{
          subject_id: '',
          class_id: null,
          date: session.start_date ?? new Date().toISOString().slice(0, 10),
          start_time: '08:00',
          duration_minutes: 120,
          max_score: settings.grading.scale,
          coefficient: 1,
        }}
        onSubmit={(values) => createExamMutation.mutateAsync(values)}
        submitLabel="Planifier"
      >
        {(form) => (
          <div className="space-y-4">
            <SelectField
              control={form.control}
              name="subject_id"
              label={settings.vocabulary.subject}
              options={(subjectsQuery.data ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <SelectField
              control={form.control}
              name="class_id"
              label={settings.vocabulary.class}
              placeholder="Toutes"
              description="Nécessaire pour reporter les résultats dans les notes."
              options={(classesQuery.data ?? []).map((item) => ({
                value: item.id!,
                label: item.name!,
              }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <DateField control={form.control} name="date" label="Date" />
              <TextField control={form.control} name="start_time" label="Début" type="time" />
              <TextField
                control={form.control}
                name="duration_minutes"
                label="Durée (min)"
                type="number"
              />
              <TextField control={form.control} name="max_score" label="Barème" type="number" />
              <TextField
                control={form.control}
                name="coefficient"
                label="Coefficient"
                type="number"
              />
            </div>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(roomDialogFor)}
        onOpenChange={(open) => !open && setRoomDialogFor(null)}
        title={`Salle et surveillance — ${roomDialogFor?.subject?.name ?? ''}`}
        schema={roomSchema}
        size="sm"
        defaultValues={{ room_id: '', capacity: null, teacher_id: null, role: 'invigilator' }}
        onSubmit={(values) => roomMutation.mutateAsync(values)}
        submitLabel="Ajouter"
      >
        {(form) => (
          <div className="space-y-4">
            <SelectField
              control={form.control}
              name="room_id"
              label="Salle"
              options={(roomsQuery.data ?? []).map((room) => ({
                value: room.id,
                label: room.capacity ? `${room.name} (${room.capacity} places)` : room.name,
              }))}
            />
            <TextField
              control={form.control}
              name="capacity"
              label="Capacité en configuration examen"
              type="number"
              description="Souvent inférieure à la capacité normale."
            />
            <SelectField
              control={form.control}
              name="teacher_id"
              label="Surveillant"
              placeholder="Aucun"
              options={(teachersQuery.data ?? []).map((teacher) => ({
                value: teacher.id,
                label: teacher.full_name ?? '',
              }))}
            />
            <SelectField
              control={form.control}
              name="role"
              label="Rôle"
              options={[
                { value: 'invigilator', label: 'Surveillant' },
                { value: 'chief', label: 'Responsable de salle' },
                { value: 'floater', label: 'Surveillant volant' },
              ]}
            />
          </div>
        )}
      </FormDialog>

      <SessionDialog
        open={sessionDialog}
        onOpenChange={setSessionDialog}
        terms={terms}
        currentTermId={currentTerm?.id ?? null}
        onSubmit={(values) => createSessionMutation.mutateAsync(values)}
      />
    </div>
  )
}

function SessionDialog({
  open,
  onOpenChange,
  terms,
  currentTermId,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  terms: Array<{ id: string; name: string }>
  currentTermId: string | null
  onSubmit: (values: z.infer<typeof sessionSchema>) => Promise<unknown>
}) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle session d'examen"
      schema={sessionSchema}
      size="sm"
      defaultValues={{
        name: '',
        type: 'regular',
        term_id: currentTermId,
        start_date: today,
        end_date: today,
      }}
      onSubmit={onSubmit}
      submitLabel="Créer"
    >
      {(form) => (
        <div className="space-y-4">
          <TextField
            control={form.control}
            name="name"
            label="Intitulé"
            placeholder="Composition du 1er trimestre"
          />
          <SelectField
            control={form.control}
            name="type"
            label="Type"
            options={(Object.keys(EXAM_SESSION_TYPE_LABELS) as ExamSessionType[]).map((value) => ({
              value,
              label: EXAM_SESSION_TYPE_LABELS[value],
            }))}
          />
          <SelectField
            control={form.control}
            name="term_id"
            label="Période"
            placeholder="Aucune"
            options={terms.map((term) => ({ value: term.id, label: term.name }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <DateField control={form.control} name="start_date" label="Du" />
            <DateField control={form.control} name="end_date" label="Au" />
          </div>
        </div>
      )}
    </FormDialog>
  )
}
