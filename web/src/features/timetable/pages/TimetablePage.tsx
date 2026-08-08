import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { CalendarDays, CalendarPlus, Clock, Plus, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatCard } from '@/components/shared/StatCard'
import { RoleGate } from '@/components/shared/RoleGate'
import { DateField, SelectField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { useAuth } from '@/features/auth/AuthProvider'
import { queryClient } from '@/lib/queryClient'
import { supabase, describeSupabaseError } from '@/lib/supabase'
import { WEEKDAY_LABELS } from '@/lib/formatters'
import { listClasses, listClassSubjects, listRooms } from '@/features/academics/api/academics.api'
import { listTeachers } from '@/features/staff/api/teachers.api'
import type { TimetableEntry } from '@/types/domain'
import { WeekGrid, toMinutes, toTimeString } from '../components/WeekGrid'
import {
  createSlot,
  deleteSlot,
  generateLessons,
  listTimetable,
  moveSlot,
  type TimetableScope,
} from '../api/timetable.api'

const slotSchema = z
  .object({
    class_subject_id: z.string().min(1, 'Matière requise'),
    room_id: z.string().nullable(),
    day_of_week: z.coerce.number().int().min(1).max(7),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Format attendu : HH:MM'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Format attendu : HH:MM'),
  })
  .refine((values) => values.end_time > values.start_time, {
    message: 'La fin doit suivre le début',
    path: ['end_time'],
  })

type SlotValues = z.infer<typeof slotSchema>

const generateSchema = z
  .object({
    from: z.string().min(1, 'Date requise'),
    to: z.string().min(1, 'Date requise'),
  })
  .refine((values) => values.to >= values.from, {
    message: 'La fin doit suivre le début',
    path: ['to'],
  })

export function TimetablePage() {
  const { schoolId, selectedYearId, settings, role, can, currentYear } = useSchool()
  const { user } = useAuth()
  const editable = can('timetable:write')

  const [scope, setScope] = useState<TimetableScope>('class')
  const [targetId, setTargetId] = useState<string>('')
  const [slotDialogOpen, setSlotDialogOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [selected, setSelected] = useState<TimetableEntry | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  const teachersQuery = useQuery({
    queryKey: ['teachers', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listTeachers(schoolId!),
  })

  const roomsQuery = useQuery({
    queryKey: ['rooms', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listRooms(schoolId!),
  })

  // Élève et parent n'ont pas de sélecteur : on affiche directement la classe
  // de l'élève rattaché. L'enseignant arrive sur son propre emploi du temps.
  const ownContextQuery = useQuery({
    queryKey: ['timetable-own-context', schoolId, selectedYearId, user?.id],
    enabled: Boolean(schoolId && selectedYearId && user),
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('class_id')
        .eq('academic_year_id', selectedYearId!)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('school_id', schoolId!)
        .eq('profile_id', user!.id)
        .is('deleted_at', null)
        .maybeSingle()

      return { classId: enrollment?.class_id ?? null, teacherId: teacher?.id ?? null }
    },
  })

  // Choix du périmètre par défaut, une fois le contexte connu.
  useEffect(() => {
    if (targetId || !ownContextQuery.data) return

    const { classId, teacherId } = ownContextQuery.data

    if (role === 'teacher' && teacherId) {
      setScope('teacher')
      setTargetId(teacherId)
      return
    }
    if ((role === 'student' || role === 'parent') && classId) {
      setScope('class')
      setTargetId(classId)
      return
    }
    const firstClass = classesQuery.data?.[0]
    if (firstClass?.id) setTargetId(firstClass.id)
  }, [ownContextQuery.data, classesQuery.data, role, targetId])

  const timetableQuery = useQuery({
    queryKey: ['timetable', schoolId, selectedYearId, scope, targetId],
    enabled: Boolean(schoolId && selectedYearId && targetId),
    queryFn: () => listTimetable(schoolId!, selectedYearId!, scope, targetId),
  })

  const classSubjectsQuery = useQuery({
    queryKey: ['class-subjects', schoolId, targetId],
    enabled: Boolean(scope === 'class' && targetId),
    queryFn: () => listClassSubjects(targetId),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['timetable', schoolId] })

  const moveMutation = useMutation({
    mutationFn: ({
      slotId,
      day,
      start,
      end,
    }: {
      slotId: string
      day: number
      start: string
      end: string
    }) => moveSlot(slotId, { day_of_week: day, start_time: start, end_time: end }),

    onMutate: async (variables) => {
      setConflict(null)
      const key = ['timetable', schoolId, selectedYearId, scope, targetId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TimetableEntry[]>(key)

      // Déplacement optimiste : la grille suit le curseur sans attendre le
      // serveur. En cas de conflit, on restaure l'état précédent.
      queryClient.setQueryData<TimetableEntry[]>(key, (current) =>
        (current ?? []).map((entry) =>
          entry.id === variables.slotId
            ? {
                ...entry,
                day_of_week: variables.day,
                start_time: variables.start,
                end_time: variables.end,
              }
            : entry,
        ),
      )

      return { previous, key }
    },

    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous)
      const message = describeSupabaseError(error)
      setConflict(message)
      toast.error(message)
    },

    onSuccess: () => {
      toast.success('Créneau déplacé.')
    },

    onSettled: () => refresh(),
  })

  const createMutation = useMutation({
    mutationFn: (values: SlotValues) => {
      const classSubject = classSubjectsQuery.data?.find(
        (item) => item.id === values.class_subject_id,
      )
      return createSlot({
        school_id: schoolId!,
        academic_year_id: selectedYearId!,
        class_subject_id: values.class_subject_id,
        class_id: targetId,
        teacher_id: classSubject?.teacher_id ?? null,
        room_id: values.room_id,
        day_of_week: values.day_of_week,
        start_time: `${values.start_time}:00`,
        end_time: `${values.end_time}:00`,
      })
    },
    onSuccess: async () => {
      await refresh()
      toast.success('Créneau ajouté.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slotId: string) => deleteSlot(slotId),
    onSuccess: async () => {
      await refresh()
      toast.success('Créneau supprimé.')
    },
  })

  const generateMutation = useMutation({
    mutationFn: (values: z.infer<typeof generateSchema>) =>
      generateLessons(scope === 'class' ? targetId : '', values.from, values.to),
    onSuccess: (count) => {
      toast.success(
        count > 0
          ? `${count} séance${count > 1 ? 's' : ''} générée${count > 1 ? 's' : ''}, jours fériés exclus.`
          : 'Aucune nouvelle séance : elles existaient déjà.',
      )
    },
  })

  const entries = timetableQuery.data ?? []

  const stats = useMemo(() => {
    const totalMinutes = entries.reduce(
      (sum, entry) => sum + (toMinutes(entry.end_time!) - toMinutes(entry.start_time!)),
      0,
    )
    const unassigned = entries.filter((entry) => !entry.teacher_name).length
    const roomless = entries.filter((entry) => !entry.room_name).length
    return { hours: totalMinutes / 60, unassigned, roomless }
  }, [entries])

  const targetOptions = useMemo(() => {
    if (scope === 'class') {
      return (classesQuery.data ?? []).map((item) => ({ value: item.id!, label: item.name! }))
    }
    if (scope === 'teacher') {
      return (teachersQuery.data ?? []).map((item) => ({
        value: item.id,
        label: item.full_name ?? '',
      }))
    }
    return (roomsQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))
  }, [scope, classesQuery.data, teachersQuery.data, roomsQuery.data])

  const canChooseScope = role !== 'student' && role !== 'parent'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emploi du temps"
        description={currentYear ? `Année ${currentYear.name}` : undefined}
        actions={
          <RoleGate permission="timetable:write">
            {scope === 'class' && targetId ? (
              <>
                <Button variant="outline" onClick={() => setGenerateOpen(true)}>
                  <CalendarPlus className="size-4" />
                  Générer les séances
                </Button>
                <Button onClick={() => setSlotDialogOpen(true)}>
                  <Plus className="size-4" />
                  Ajouter un créneau
                </Button>
              </>
            ) : null}
          </RoleGate>
        }
      />

      {canChooseScope ? (
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={scope}
            onValueChange={(value) => {
              setScope(value as TimetableScope)
              setTargetId('')
            }}
          >
            <TabsList>
              <TabsTrigger value="class">Par {settings.vocabulary.class.toLowerCase()}</TabsTrigger>
              <TabsTrigger value="teacher">Par enseignant</TabsTrigger>
              <TabsTrigger value="room">Par salle</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={targetId || undefined} onValueChange={setTargetId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {targetOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {conflict ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{conflict}</AlertDescription>
        </Alert>
      ) : null}

      {entries.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Heures hebdomadaires"
            value={stats.hours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
            icon={Clock}
          />
          <StatCard
            label="Créneaux sans enseignant"
            value={stats.unassigned}
            tone={stats.unassigned > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Créneaux sans salle"
            value={stats.roomless}
            tone={stats.roomless > 0 ? 'warning' : 'default'}
          />
        </div>
      ) : null}

      {timetableQuery.isPending && targetId ? (
        <Skeleton className="h-[28rem] w-full" />
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarDays}
              title="Aucun créneau"
              description={
                targetId
                  ? "Ajoutez des créneaux : la base refusera d'elle-même toute superposition de salle, d'enseignant ou de classe."
                  : 'Sélectionnez un élément pour afficher son emploi du temps.'
              }
              action={
                editable && scope === 'class' && targetId ? (
                  <Button onClick={() => setSlotDialogOpen(true)}>
                    <Plus className="size-4" />
                    Ajouter un créneau
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <WeekGrid
            entries={entries}
            weekDays={settings.week_days}
            dayStart={settings.day_start}
            dayEnd={settings.day_end}
            editable={editable && scope === 'class'}
            showClass={scope !== 'class'}
            onSelect={editable ? setSelected : undefined}
            onMove={(slotId, day, start, end) =>
              moveMutation.mutate({ slotId, day, start, end })
            }
          />

          {editable && scope === 'class' ? (
            <p className="text-sm text-muted-foreground text-pretty">
              Glissez un cours pour le déplacer. Un conflit de salle, d&apos;enseignant ou de
              classe est refusé par la base de données : la grille revient alors à son état
              précédent.
            </p>
          ) : null}
        </>
      )}

      <FormDialog
        open={slotDialogOpen}
        onOpenChange={setSlotDialogOpen}
        title="Ajouter un créneau"
        description="L'enseignant est repris de la matière ; le conflit éventuel est détecté à l'enregistrement."
        schema={slotSchema}
        size="sm"
        defaultValues={{
          class_subject_id: '',
          room_id: null,
          day_of_week: settings.week_days[0] ?? 1,
          start_time: settings.day_start.slice(0, 5),
          end_time: toTimeString(toMinutes(settings.day_start) + 60).slice(0, 5),
        }}
        onSubmit={(values) => createMutation.mutateAsync(values)}
        submitLabel="Ajouter"
      >
        {(form) => (
          <div className="space-y-4">
            <SelectField
              control={form.control}
              name="class_subject_id"
              label={settings.vocabulary.subject}
              options={(classSubjectsQuery.data ?? []).map((item) => ({
                value: item.id,
                label: item.teacher?.full_name
                  ? `${item.subject?.name} — ${item.teacher.full_name}`
                  : `${item.subject?.name} (sans enseignant)`,
              }))}
            />
            <SelectField
              control={form.control}
              name="day_of_week"
              label="Jour"
              options={settings.week_days.map((day) => ({
                value: String(day),
                label: WEEKDAY_LABELS[day] ?? String(day),
              }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="start_time" label="Début" type="time" />
              <TextField control={form.control} name="end_time" label="Fin" type="time" />
            </div>
            <SelectField
              control={form.control}
              name="room_id"
              label="Salle"
              placeholder="Aucune"
              options={(roomsQuery.data ?? []).map((room) => ({
                value: room.id,
                label: room.capacity ? `${room.name} (${room.capacity} places)` : room.name,
              }))}
            />
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        title="Générer les séances"
        description="Déplie la grille hebdomadaire en séances datées, en sautant vacances et fermetures. Les séances déjà créées sont conservées."
        schema={generateSchema}
        size="sm"
        defaultValues={{
          from: currentYear?.start_date ?? new Date().toISOString().slice(0, 10),
          to: currentYear?.end_date ?? new Date().toISOString().slice(0, 10),
        }}
        onSubmit={(values) => generateMutation.mutateAsync(values)}
        submitLabel="Générer"
      >
        {(form) => (
          <div className="grid grid-cols-2 gap-4">
            <DateField control={form.control} name="from" label="Du" />
            <DateField control={form.control} name="to" label="Au" />
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={`Supprimer ${selected?.subject_name} du ${
          WEEKDAY_LABELS[selected?.day_of_week ?? 1]?.toLowerCase()
        } ?`}
        description={
          <span>
            Créneau de {selected?.start_time?.slice(0, 5)} à {selected?.end_time?.slice(0, 5)}
            {selected?.room_name ? ` en ${selected.room_name}` : ''}. Les séances déjà générées
            pour ce créneau ne sont pas supprimées.
          </span>
        }
        confirmLabel="Supprimer le créneau"
        destructive
        onConfirm={async () => {
          if (selected?.id) await deleteMutation.mutateAsync(selected.id)
          setSelected(null)
        }}
      />

      {scope === 'teacher' && entries.length > 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <Badge variant="secondary">
              {stats.hours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h / semaine
            </Badge>
            <span className="text-muted-foreground">
              réparties sur {new Set(entries.map((entry) => entry.class_id)).size} classe(s).
            </span>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
