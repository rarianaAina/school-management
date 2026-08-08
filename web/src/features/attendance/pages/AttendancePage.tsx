import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCheck, ClipboardCheck, Save, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { EmptyState } from '@/components/shared/EmptyState'
import { StatCard } from '@/components/shared/StatCard'
import { RoleGate } from '@/components/shared/RoleGate'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import { formatDate, formatNumber, formatTime } from '@/lib/formatters'
import { listClasses } from '@/features/academics/api/academics.api'
import {
  ATTENDANCE_STATUS_LABELS,
  JUSTIFICATION_STATUS_LABELS,
  type AttendanceStatus,
  type JustificationStatus,
} from '@/types/domain'
import {
  approveJustification,
  getAttendanceSheet,
  listAbsenteeismAlerts,
  listJustifications,
  listLessonsOfDay,
  openAttendanceSheet,
  saveAttendance,
  type AlertRow,
  type AttendanceSheetRow,
  type JustificationRow,
  type LessonAttendanceRow,
} from '../api/attendance.api'

const STATUS_ORDER: AttendanceStatus[] = ['present', 'absent', 'late', 'excused', 'left_early']

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-success/15 text-success border-success/30',
  absent: 'bg-destructive/15 text-destructive border-destructive/30',
  late: 'bg-warning/20 text-warning border-warning/40',
  excused: 'bg-muted text-muted-foreground border-border',
  left_early: 'bg-muted text-muted-foreground border-border',
}

export function AttendancePage() {
  const { schoolId, selectedYearId, settings, can } = useSchool()

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [classId, setClassId] = useState('all')
  const [lesson, setLesson] = useState<LessonAttendanceRow | null>(null)
  const [sheet, setSheet] = useState<AttendanceSheetRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [threshold, setThreshold] = useState(5)

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  const lessonsQuery = useQuery({
    queryKey: ['lessons-of-day', schoolId, date, classId],
    enabled: Boolean(schoolId),
    queryFn: () => listLessonsOfDay(schoolId!, date, classId === 'all' ? null : classId),
  })

  const sheetQuery = useQuery({
    queryKey: ['attendance-sheet', lesson?.lesson_id],
    enabled: Boolean(lesson),
    queryFn: () => getAttendanceSheet(lesson!.lesson_id!, lesson!.class_id!),
  })

  const alertsQuery = useQuery({
    queryKey: ['absenteeism', schoolId, threshold],
    enabled: Boolean(schoolId),
    queryFn: () => listAbsenteeismAlerts(schoolId!, threshold),
  })

  const justificationsQuery = useQuery({
    queryKey: ['justifications', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listJustifications(schoolId!),
  })

  useEffect(() => {
    if (sheetQuery.data) {
      setSheet(sheetQuery.data)
      setDirty(false)
    }
  }, [sheetQuery.data])

  const openMutation = useMutation({
    mutationFn: (lessonId: string) => openAttendanceSheet(lessonId),
    onSuccess: async (count) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-sheet'] }),
        queryClient.invalidateQueries({ queryKey: ['lessons-of-day', schoolId] }),
      ])
      toast.success(
        count > 0
          ? `Feuille ouverte : ${count} élève(s) marqués présents par défaut.`
          : 'Feuille déjà ouverte.',
      )
    },
  })

  const saveMutation = useMutation({
    mutationFn: () => saveAttendance(schoolId!, lesson!.lesson_id!, sheet),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-sheet'] }),
        queryClient.invalidateQueries({ queryKey: ['lessons-of-day', schoolId] }),
        queryClient.invalidateQueries({ queryKey: ['absenteeism', schoolId] }),
      ])
      setDirty(false)
      toast.success('Appel enregistré.')
    },
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: JustificationStatus }) =>
      approveJustification(id, status),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['justifications', schoolId] }),
        queryClient.invalidateQueries({ queryKey: ['absenteeism', schoolId] }),
      ])
      toast.success(
        variables.status === 'approved'
          ? 'Justificatif approuvé : les absences de la période sont requalifiées.'
          : 'Justificatif refusé.',
      )
    },
  })

  const counts = useMemo(() => {
    const by = (status: AttendanceStatus) => sheet.filter((row) => row.status === status).length
    return {
      present: by('present'),
      absent: by('absent'),
      late: by('late'),
      excused: by('excused'),
    }
  }, [sheet])

  function setStatus(index: number, status: AttendanceStatus) {
    setSheet((current) =>
      current.map((row, position) =>
        position === index
          ? { ...row, status, minutes_late: status === 'late' ? (row.minutes_late ?? 5) : null }
          : row,
      ),
    )
    setDirty(true)
  }

  const lessonColumns: Column<LessonAttendanceRow>[] = [
    {
      id: 'time',
      header: 'Horaire',
      cell: (row) => (
        <span className="tabular font-medium">
          {formatTime(row.start_time)}
        </span>
      ),
    },
    {
      id: 'class',
      header: settings.vocabulary.class,
      cell: (row) => (
        <div>
          <p className="font-medium">{row.class_name}</p>
          <p className="text-xs text-muted-foreground">{row.subject_name}</p>
        </div>
      ),
    },
    {
      id: 'teacher',
      header: 'Enseignant',
      hideOnMobile: true,
      cell: (row) => row.teacher_name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'state',
      header: 'Appel',
      cell: (row) =>
        row.is_taken ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="gap-1">
              <CheckCheck className="size-3" />
              Fait
            </Badge>
            {Number(row.absent_count) > 0 ? (
              <Badge variant="outline" className="text-destructive">
                {row.absent_count} absent(s)
              </Badge>
            ) : null}
            {Number(row.late_count) > 0 ? (
              <Badge variant="outline" className="text-warning">
                {row.late_count} retard(s)
              </Badge>
            ) : null}
          </div>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            À faire
          </Badge>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Présences"
        description="Feuilles d'appel par séance, justificatifs et suivi de l'absentéisme."
      />

      <Tabs defaultValue="sheet">
        <TabsList>
          <TabsTrigger value="sheet">Appel du jour</TabsTrigger>
          <TabsTrigger value="alerts">Absentéisme</TabsTrigger>
          <TabsTrigger value="justifications">Justificatifs</TabsTrigger>
        </TabsList>

        {/* Appel ---------------------------------------------------------- */}
        <TabsContent value="sheet" className="space-y-4 pt-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <Input
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value)
                  setLesson(null)
                }}
                className="w-44"
              />
              <Select
                value={classId}
                onValueChange={(value) => {
                  setClassId(value)
                  setLesson(null)
                }}
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
                  {(classesQuery.data ?? []).map((item) => (
                    <SelectItem key={item.id!} value={item.id!}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <DataTable
            columns={lessonColumns}
            rows={lessonsQuery.data ?? []}
            getRowId={(row) => row.lesson_id!}
            isLoading={lessonsQuery.isPending}
            onRowClick={(row) => {
              setLesson(row)
              if (!row.is_taken) openMutation.mutate(row.lesson_id!)
            }}
            emptyState={
              <EmptyState
                icon={ClipboardCheck}
                title="Aucune séance ce jour"
                description="Les séances proviennent de l'emploi du temps. Générez-les depuis le module Emploi du temps si ce n'est pas encore fait."
              />
            }
          />

          {lesson ? (
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {lesson.class_name} — {lesson.subject_name}
                    </h2>
                    <p className="tabular text-sm text-muted-foreground">
                      {formatDate(lesson.date)} · {formatTime(lesson.start_time)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {counts.present} présents · {counts.absent} absents · {counts.late} retards
                    </span>
                    <RoleGate permission="attendance:write">
                      <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={!dirty || saveMutation.isPending}
                      >
                        <Save className="size-4" />
                        Enregistrer
                      </Button>
                    </RoleGate>
                  </div>
                </div>

                <div className="divide-y rounded-md border">
                  {sheet.map((row, index) => (
                    <div
                      key={row.student_id}
                      className="flex flex-wrap items-center gap-3 px-3 py-2"
                    >
                      <div className="min-w-40 flex-1">
                        <p className="font-medium">{row.full_name}</p>
                        <p className="tabular text-xs text-muted-foreground">{row.matricule}</p>
                      </div>

                      {/* Boutons plutôt qu'un menu : l'appel se fait en un clic
                          par élève, souvent sur tablette, en début de cours. */}
                      <div className="flex flex-wrap gap-1">
                        {STATUS_ORDER.map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={!can('attendance:write')}
                            onClick={() => setStatus(index, status)}
                            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                              row.status === status
                                ? STATUS_STYLE[status]
                                : 'border-transparent text-muted-foreground hover:bg-accent'
                            }`}
                          >
                            {ATTENDANCE_STATUS_LABELS[status]}
                          </button>
                        ))}
                      </div>

                      {row.status === 'late' ? (
                        <Input
                          type="number"
                          min={0}
                          max={240}
                          value={row.minutes_late ?? ''}
                          onChange={(event) => {
                            const minutes =
                              event.target.value === '' ? null : Number(event.target.value)
                            setSheet((current) =>
                              current.map((item, position) =>
                                position === index ? { ...item, minutes_late: minutes } : item,
                              ),
                            )
                            setDirty(true)
                          }}
                          className="tabular h-8 w-20 text-right"
                          placeholder="min"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* Absentéisme ---------------------------------------------------- */}
        <TabsContent value="alerts" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Seuil d&apos;alerte :</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value) || 1)}
              className="tabular w-24"
            />
            <span className="text-sm text-muted-foreground">
              absences non justifiées sur l&apos;année
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Élèves au-dessus du seuil"
              value={alertsQuery.data?.length ?? 0}
              icon={AlertTriangle}
              tone={(alertsQuery.data?.length ?? 0) > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label="Absences cumulées"
              value={(alertsQuery.data ?? []).reduce(
                (sum, row) => sum + Number(row.absent_count),
                0,
              )}
            />
            <StatCard
              label="Assiduité la plus basse"
              value={
                alertsQuery.data?.length
                  ? `${formatNumber(
                      Math.min(
                        ...alertsQuery.data.map((row) => Number(row.attendance_rate ?? 100)),
                      ),
                      1,
                    )} %`
                  : '—'
              }
              tone="warning"
            />
          </div>

          <DataTable
            columns={
              [
                {
                  id: 'student',
                  header: 'Élève',
                  cell: (row: AlertRow) => (
                    <div>
                      <p className="font-medium">{row.full_name}</p>
                      <p className="tabular text-xs text-muted-foreground">{row.matricule}</p>
                    </div>
                  ),
                },
                {
                  id: 'class',
                  header: settings.vocabulary.class,
                  cell: (row: AlertRow) => row.class_name,
                },
                {
                  id: 'absences',
                  header: 'Absences',
                  align: 'right',
                  cell: (row: AlertRow) => (
                    <span className="tabular font-semibold text-destructive">
                      {row.absent_count}
                    </span>
                  ),
                },
                {
                  id: 'rate',
                  header: 'Assiduité',
                  align: 'right',
                  cell: (row: AlertRow) => (
                    <span className="tabular">
                      {row.attendance_rate !== null
                        ? `${formatNumber(Number(row.attendance_rate), 1)} %`
                        : '—'}
                    </span>
                  ),
                },
              ] as Column<AlertRow>[]
            }
            rows={alertsQuery.data ?? []}
            getRowId={(row) => row.student_id}
            isLoading={alertsQuery.isPending}
            emptyState={
              <EmptyState
                icon={CheckCheck}
                title="Aucune alerte"
                description={`Aucun élève n'atteint ${threshold} absences non justifiées.`}
              />
            }
          />
        </TabsContent>

        {/* Justificatifs --------------------------------------------------- */}
        <TabsContent value="justifications" className="pt-4">
          <DataTable
            columns={
              [
                {
                  id: 'student',
                  header: 'Élève',
                  cell: (row: JustificationRow) => row.student?.full_name ?? '—',
                },
                {
                  id: 'period',
                  header: 'Période',
                  cell: (row: JustificationRow) => (
                    <span className="tabular text-sm">
                      {formatDate(row.start_date)} → {formatDate(row.end_date)}
                    </span>
                  ),
                },
                {
                  id: 'reason',
                  header: 'Motif',
                  hideOnMobile: true,
                  cell: (row: JustificationRow) => (
                    <span className="text-sm text-muted-foreground">{row.reason}</span>
                  ),
                },
                {
                  id: 'status',
                  header: 'Statut',
                  cell: (row: JustificationRow) => (
                    <Badge
                      variant={
                        row.status === 'approved'
                          ? 'default'
                          : row.status === 'rejected'
                            ? 'outline'
                            : 'secondary'
                      }
                    >
                      {JUSTIFICATION_STATUS_LABELS[row.status as JustificationStatus]}
                    </Badge>
                  ),
                },
                {
                  id: 'actions',
                  header: '',
                  align: 'right',
                  width: '170px',
                  cell: (row: JustificationRow) =>
                    row.status === 'pending' && can('attendance:write') ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            approveMutation.mutate({ id: row.id, status: 'approved' })
                          }
                        >
                          Approuver
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            approveMutation.mutate({ id: row.id, status: 'rejected' })
                          }
                        >
                          Refuser
                        </Button>
                      </div>
                    ) : null,
                },
              ] as Column<JustificationRow>[]
            }
            rows={justificationsQuery.data ?? []}
            getRowId={(row) => row.id}
            isLoading={justificationsQuery.isPending}
            emptyState={
              <EmptyState
                icon={TriangleAlert}
                title="Aucun justificatif"
                description="Les justificatifs déposés par les familles apparaissent ici. Une approbation requalifie automatiquement les absences de la période couverte."
              />
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
