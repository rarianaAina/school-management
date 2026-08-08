import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { BookOpen, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { RoleGate } from '@/components/shared/RoleGate'
import { SelectField, TextField } from '@/components/shared/FormFields'
import { StatCard } from '@/components/shared/StatCard'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import { listTeachers } from '@/features/staff/api/teachers.api'
import type { ClassOverview } from '@/types/domain'
import {
  applySubjectTemplate,
  createClass,
  listClasses,
  listLevels,
  listPrograms,
  listRooms,
} from '../api/academics.api'

const classSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(60),
  code: z.string().max(15).nullable(),
  level_id: z.string().min(1, 'Niveau requis'),
  program_id: z.string().nullable(),
  capacity: z.coerce.number().int().min(1).max(500).nullable(),
  main_teacher_id: z.string().nullable(),
  default_room_id: z.string().nullable(),
})

type ClassValues = z.infer<typeof classSchema>

export function ClassesPage() {
  const navigate = useNavigate()
  const { schoolId, selectedYearId, settings, can, currentYear } = useSchool()
  const [dialogOpen, setDialogOpen] = useState(false)

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  const levelsQuery = useQuery({
    queryKey: ['levels', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listLevels(schoolId!),
  })

  const programsQuery = useQuery({
    queryKey: ['programs', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listPrograms(schoolId!),
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

  const createMutation = useMutation({
    mutationFn: async (values: ClassValues) => {
      const created = await createClass({
        school_id: schoolId!,
        academic_year_id: selectedYearId!,
        ...values,
      })
      // Reprend les coefficients définis pour le niveau : une classe créée
      // arrive avec ses matières prêtes plutôt que vide.
      const count = await applySubjectTemplate(created.id)
      return { created, count }
    },
    onSuccess: async ({ created, count }) => {
      await queryClient.invalidateQueries({ queryKey: ['classes', schoolId] })
      toast.success(
        count > 0
          ? `${created.name} créée avec ${count} matière${count > 1 ? 's' : ''} depuis le modèle du niveau.`
          : `${created.name} créée.`,
      )
      navigate(`/classes/${created.id}`)
    },
  })

  const rows = classesQuery.data ?? []
  const totalStudents = rows.reduce((sum, item) => sum + Number(item.enrolled_count ?? 0), 0)
  const totalCapacity = rows.reduce((sum, item) => sum + Number(item.capacity ?? 0), 0)
  const averageFill = totalCapacity > 0 ? (totalStudents / totalCapacity) * 100 : null

  const columns: Column<ClassOverview>[] = [
    {
      id: 'name',
      header: settings.vocabulary.class,
      cell: (item) => (
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {item.level_name}
            {item.program_name ? ` · ${item.program_name}` : ''}
          </p>
        </div>
      ),
    },
    {
      id: 'main_teacher',
      header: 'Professeur principal',
      hideOnMobile: true,
      cell: (item) => item.main_teacher_name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'subjects',
      header: settings.vocabulary.subject + 's',
      align: 'right',
      hideOnMobile: true,
      cell: (item) => <span className="tabular">{item.subject_count}</span>,
    },
    {
      id: 'occupancy',
      header: 'Effectif',
      width: '190px',
      cell: (item) => (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="tabular font-medium">
              {item.enrolled_count}
              {item.capacity ? ` / ${item.capacity}` : ''}
            </span>
            {item.fill_rate !== null ? (
              <span
                className={
                  Number(item.fill_rate) > 100 ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
                }
              >
                {item.fill_rate}%
              </span>
            ) : null}
          </div>
          {item.capacity ? (
            <Progress value={Math.min(Number(item.fill_rate ?? 0), 100)} className="h-1.5" />
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${settings.vocabulary.class}s`}
        description={
          currentYear ? `Année ${currentYear.name}` : 'Organisation des groupes et de leurs matières'
        }
        actions={
          <RoleGate permission="academics:write">
            <Button onClick={() => setDialogOpen(true)} disabled={levelsQuery.data?.length === 0}>
              <Plus className="size-4" />
              Nouvelle {settings.vocabulary.class.toLowerCase()}
            </Button>
          </RoleGate>
        }
      />

      {rows.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={`${settings.vocabulary.class}s`} value={rows.length} icon={BookOpen} />
          <StatCard label="Élèves inscrits" value={totalStudents} icon={Users} />
          <StatCard
            label="Taux de remplissage"
            value={averageFill !== null ? `${averageFill.toFixed(1)} %` : '—'}
            hint={totalCapacity > 0 ? `${totalStudents} / ${totalCapacity} places` : 'Capacités non renseignées'}
            tone={averageFill !== null && averageFill > 95 ? 'warning' : 'default'}
          />
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(item) => item.id!}
        isLoading={classesQuery.isPending}
        onRowClick={(item) => navigate(`/classes/${item.id}`)}
        emptyState={
          <EmptyState
            icon={BookOpen}
            title={`Aucune ${settings.vocabulary.class.toLowerCase()}`}
            description={
              levelsQuery.data?.length === 0
                ? "Créez d'abord au moins un niveau dans les référentiels."
                : "Créez vos classes pour y inscrire les élèves et bâtir les emplois du temps."
            }
            action={
              can('academics:write') ? (
                levelsQuery.data?.length === 0 ? (
                  <Button variant="outline" onClick={() => navigate('/referentiels')}>
                    Ouvrir les référentiels
                  </Button>
                ) : (
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4" />
                    Créer une {settings.vocabulary.class.toLowerCase()}
                  </Button>
                )
              ) : undefined
            }
          />
        }
      />

      {rows.some((item) => Number(item.fill_rate ?? 0) > 100) ? (
        <Card className="border-warning/40">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <Badge variant="outline" className="text-warning">
              Sureffectif
            </Badge>
            <span className="text-muted-foreground">
              {rows.filter((item) => Number(item.fill_rate ?? 0) > 100).map((item) => item.name).join(', ')} dépasse
              la capacité déclarée.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={`Nouvelle ${settings.vocabulary.class.toLowerCase()}`}
        description="Les matières du niveau sont reprises automatiquement avec leurs coefficients."
        schema={classSchema}
        defaultValues={{
          name: '',
          code: null,
          level_id: '',
          program_id: null,
          capacity: null,
          main_teacher_id: null,
          default_room_id: null,
        }}
        onSubmit={(values) => createMutation.mutateAsync(values)}
        submitLabel="Créer"
        size="sm"
      >
        {(form) => (
          <div className="space-y-4">
            <TextField control={form.control} name="name" label="Nom" placeholder="Seconde A" />
            <TextField control={form.control} name="code" label="Code" placeholder="2A" />
            <SelectField
              control={form.control}
              name="level_id"
              label="Niveau"
              options={(levelsQuery.data ?? []).map((level) => ({
                value: level.id,
                label: level.name,
              }))}
            />
            <SelectField
              control={form.control}
              name="program_id"
              label="Filière"
              placeholder="Aucune"
              options={(programsQuery.data ?? []).map((program) => ({
                value: program.id,
                label: program.name,
              }))}
            />
            <TextField control={form.control} name="capacity" label="Capacité" type="number" />
            <SelectField
              control={form.control}
              name="main_teacher_id"
              label="Professeur principal"
              placeholder="Aucun"
              options={(teachersQuery.data ?? []).map((teacher) => ({
                value: teacher.id,
                label: teacher.full_name ?? '',
              }))}
            />
            <SelectField
              control={form.control}
              name="default_room_id"
              label="Salle par défaut"
              placeholder="Aucune"
              options={(roomsQuery.data ?? []).map((room) => ({
                value: room.id,
                label: room.name,
              }))}
            />
          </div>
        )}
      </FormDialog>
    </div>
  )
}
