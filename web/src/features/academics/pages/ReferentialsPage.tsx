import { useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { SelectField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import {
  CYCLE_LABELS,
  ROOM_TYPE_LABELS,
  type Level,
  type Program,
  type Room,
  type SchoolCycle,
  type RoomType,
  type Subject,
} from '@/types/domain'
import {
  deleteReferential,
  listLevels,
  listPrograms,
  listRooms,
  listSubjects,
  upsertReferential,
} from '../api/academics.api'

/**
 * Gestionnaire générique de référentiel : même cycle liste / création /
 * édition / suppression pour les niveaux, filières, matières et salles.
 */
interface ReferentialManagerProps<T, S extends z.ZodTypeAny> {
  table: 'levels' | 'programs' | 'subjects' | 'rooms'
  queryKey: string
  singular: string
  emptyTitle: string
  emptyDescription: string
  fetch: (schoolId: string) => Promise<T[]>
  columns: Column<T>[]
  schema: S
  emptyValues: z.infer<S>
  toValues: (row: T) => z.infer<S>
  getId: (row: T) => string
  getLabel: (row: T) => string
  fields: (form: UseFormReturn<z.infer<S>>) => ReactNode
}

function ReferentialManager<T, S extends z.ZodTypeAny>({
  table,
  queryKey,
  singular,
  emptyTitle,
  emptyDescription,
  fetch,
  columns,
  schema,
  emptyValues,
  toValues,
  getId,
  getLabel,
  fields,
}: ReferentialManagerProps<T, S>) {
  const { schoolId, can } = useSchool()
  const canManage = can('academics:write')

  const [editing, setEditing] = useState<T | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<T | null>(null)

  const query = useQuery({
    queryKey: [queryKey, schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => fetch(schoolId!),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: [queryKey, schoolId] })

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      upsertReferential(table, {
        ...values,
        school_id: schoolId,
        ...(editing ? { id: getId(editing) } : {}),
      }),
    onSuccess: async () => {
      await refresh()
      toast.success(editing ? `${singular} mis à jour.` : `${singular} créé.`)
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReferential(table, id),
    onSuccess: async () => {
      await refresh()
      toast.success(`${singular} supprimé.`)
    },
  })

  const allColumns: Column<T>[] = canManage
    ? [
        ...columns,
        {
          id: 'actions',
          header: '',
          align: 'right',
          width: '96px',
          cell: (row) => (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Modifier"
                onClick={() => {
                  setEditing(row)
                  setDialogOpen(true)
                }}
              >
                <Pencil className="size-4" />
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
    : columns

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            Ajouter
          </Button>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={allColumns}
            rows={query.data ?? []}
            getRowId={getId}
            isLoading={query.isPending}
            className="[&>div]:rounded-none [&>div]:border-0"
            emptyState={
              <EmptyState icon={Layers} title={emptyTitle} description={emptyDescription} />
            }
          />
        </CardContent>
      </Card>

      <FormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        title={editing ? `Modifier — ${getLabel(editing)}` : `Nouveau ${singular.toLowerCase()}`}
        schema={schema}
        size="sm"
        defaultValues={editing ? toValues(editing) : emptyValues}
        onSubmit={(values) => saveMutation.mutateAsync(values as Record<string, unknown>)}
      >
        {fields}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Supprimer « ${getLabel(toDelete)} » ?` : ''}
        description="La suppression est refusée si des classes ou des notes y font référence."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (toDelete) await deleteMutation.mutateAsync(getId(toDelete))
          setToDelete(null)
        }}
      />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Schémas
// -----------------------------------------------------------------------------
const levelSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(60),
  code: z.string().max(15).nullable(),
  cycle: z.enum(['preschool', 'primary', 'middle', 'high', 'higher']),
  order_index: z.coerce.number().int().min(0).max(99),
})

const programSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(80),
  code: z.string().max(15).nullable(),
  level_id: z.string().nullable(),
})

const subjectSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(80),
  code: z.string().max(15).nullable(),
  category: z.string().max(60).nullable(),
})

const roomSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(60),
  code: z.string().max(15).nullable(),
  building: z.string().max(60).nullable(),
  capacity: z.coerce.number().int().min(1).max(2000).nullable(),
  type: z.enum(['classroom', 'lab', 'amphitheater', 'workshop', 'gym', 'library', 'other']),
})

export function ReferentialsPage() {
  const { schoolId, settings } = useSchool()

  const levelsQuery = useQuery({
    queryKey: ['levels', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listLevels(schoolId!),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Référentiels"
        description="Niveaux, filières, matières et salles — la base sur laquelle reposent les classes, les emplois du temps et les notes."
        breadcrumbs={[{ label: 'Accueil', to: '/' }, { label: 'Référentiels' }]}
      />

      <Tabs defaultValue="levels">
        <TabsList>
          <TabsTrigger value="levels">Niveaux</TabsTrigger>
          <TabsTrigger value="programs">Filières</TabsTrigger>
          <TabsTrigger value="subjects">{settings.vocabulary.subject}s</TabsTrigger>
          <TabsTrigger value="rooms">Salles</TabsTrigger>
        </TabsList>

        <TabsContent value="levels" className="pt-4">
          <ReferentialManager<Level, typeof levelSchema>
            table="levels"
            queryKey="levels"
            singular="Niveau"
            emptyTitle="Aucun niveau"
            emptyDescription="Créez les niveaux de votre établissement : CP, 6ème, Terminale, L1…"
            fetch={listLevels}
            getId={(row) => row.id}
            getLabel={(row) => row.name}
            schema={levelSchema}
            emptyValues={{ name: '', code: null, cycle: 'high', order_index: 0 }}
            toValues={(row) => ({
              name: row.name,
              code: row.code,
              cycle: row.cycle as SchoolCycle,
              order_index: row.order_index,
            })}
            columns={[
              { id: 'name', header: 'Niveau', cell: (row) => <span className="font-medium">{row.name}</span> },
              { id: 'code', header: 'Code', cell: (row) => row.code ?? '—' },
              {
                id: 'cycle',
                header: 'Cycle',
                cell: (row) => <Badge variant="outline">{CYCLE_LABELS[row.cycle as SchoolCycle]}</Badge>,
              },
              {
                id: 'order',
                header: 'Ordre',
                align: 'right',
                cell: (row) => <span className="tabular">{row.order_index}</span>,
              },
            ]}
            fields={(form) => (
              <div className="space-y-4">
                <TextField control={form.control} name="name" label="Nom" placeholder="Terminale" />
                <TextField control={form.control} name="code" label="Code" placeholder="TLE" />
                <SelectField
                  control={form.control}
                  name="cycle"
                  label="Cycle"
                  options={(Object.keys(CYCLE_LABELS) as SchoolCycle[]).map((value) => ({
                    value,
                    label: CYCLE_LABELS[value],
                  }))}
                />
                <TextField
                  control={form.control}
                  name="order_index"
                  label="Ordre d'affichage"
                  type="number"
                  description="Croissant : 1 pour le niveau le plus bas."
                />
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="programs" className="pt-4">
          <ReferentialManager<Program, typeof programSchema>
            table="programs"
            queryKey="programs"
            singular="Filière"
            emptyTitle="Aucune filière"
            emptyDescription="Série S, Génie logiciel, Économie-gestion… Facultatif si votre établissement n'en utilise pas."
            fetch={listPrograms}
            getId={(row) => row.id}
            getLabel={(row) => row.name}
            schema={programSchema}
            emptyValues={{ name: '', code: null, level_id: null }}
            toValues={(row) => ({ name: row.name, code: row.code, level_id: row.level_id })}
            columns={[
              { id: 'name', header: 'Filière', cell: (row) => <span className="font-medium">{row.name}</span> },
              { id: 'code', header: 'Code', cell: (row) => row.code ?? '—' },
              {
                id: 'level',
                header: 'Niveau',
                cell: (row) =>
                  levelsQuery.data?.find((level) => level.id === row.level_id)?.name ?? '—',
              },
            ]}
            fields={(form) => (
              <div className="space-y-4">
                <TextField control={form.control} name="name" label="Nom" placeholder="Série Scientifique" />
                <TextField control={form.control} name="code" label="Code" placeholder="S" />
                <SelectField
                  control={form.control}
                  name="level_id"
                  label="Niveau associé"
                  options={(levelsQuery.data ?? []).map((level) => ({
                    value: level.id,
                    label: level.name,
                  }))}
                />
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="subjects" className="pt-4">
          <ReferentialManager<Subject, typeof subjectSchema>
            table="subjects"
            queryKey="subjects"
            singular="Matière"
            emptyTitle="Aucune matière"
            emptyDescription="Les matières servent aux emplois du temps, aux notes et aux bulletins."
            fetch={listSubjects}
            getId={(row) => row.id}
            getLabel={(row) => row.name}
            schema={subjectSchema}
            emptyValues={{ name: '', code: null, category: null }}
            toValues={(row) => ({ name: row.name, code: row.code, category: row.category })}
            columns={[
              { id: 'name', header: 'Matière', cell: (row) => <span className="font-medium">{row.name}</span> },
              { id: 'code', header: 'Code', cell: (row) => row.code ?? '—' },
              { id: 'category', header: 'Catégorie', cell: (row) => row.category ?? '—' },
            ]}
            fields={(form) => (
              <div className="space-y-4">
                <TextField control={form.control} name="name" label="Nom" placeholder="Mathématiques" />
                <TextField control={form.control} name="code" label="Code" placeholder="MATH" />
                <TextField
                  control={form.control}
                  name="category"
                  label="Catégorie"
                  placeholder="Sciences"
                />
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="rooms" className="pt-4">
          <ReferentialManager<Room, typeof roomSchema>
            table="rooms"
            queryKey="rooms"
            singular="Salle"
            emptyTitle="Aucune salle"
            emptyDescription="Les salles alimentent la détection de conflits d'horaires et la répartition des examens."
            fetch={listRooms}
            getId={(row) => row.id}
            getLabel={(row) => row.name}
            schema={roomSchema}
            emptyValues={{ name: '', code: null, building: null, capacity: null, type: 'classroom' }}
            toValues={(row) => ({
              name: row.name,
              code: row.code,
              building: row.building,
              capacity: row.capacity,
              type: row.type as RoomType,
            })}
            columns={[
              { id: 'name', header: 'Salle', cell: (row) => <span className="font-medium">{row.name}</span> },
              { id: 'building', header: 'Bâtiment', cell: (row) => row.building ?? '—' },
              {
                id: 'type',
                header: 'Type',
                cell: (row) => <Badge variant="outline">{ROOM_TYPE_LABELS[row.type as RoomType]}</Badge>,
              },
              {
                id: 'capacity',
                header: 'Capacité',
                align: 'right',
                cell: (row) => <span className="tabular">{row.capacity ?? '—'}</span>,
              },
            ]}
            fields={(form) => (
              <div className="space-y-4">
                <TextField control={form.control} name="name" label="Nom" placeholder="Salle A1" />
                <TextField control={form.control} name="code" label="Code" placeholder="A1" />
                <TextField control={form.control} name="building" label="Bâtiment" />
                <TextField control={form.control} name="capacity" label="Capacité" type="number" />
                <SelectField
                  control={form.control}
                  name="type"
                  label="Type"
                  options={(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((value) => ({
                    value,
                    label: ROOM_TYPE_LABELS[value],
                  }))}
                />
              </div>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
