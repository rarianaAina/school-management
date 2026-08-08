import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Archive, Mail, Pencil, Phone, Plus, Search, UserSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { RoleGate } from '@/components/shared/RoleGate'
import { DateField, FormSection, SelectField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import { formatDate, initials } from '@/lib/formatters'
import { GENDER_LABELS, STAFF_STATUS_LABELS, type StaffStatus, type Teacher } from '@/types/domain'
import { archiveTeacher, createTeacher, listTeachers, updateTeacher } from '../api/teachers.api'

const teacherSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis').max(80),
  last_name: z.string().min(1, 'Nom requis').max(80),
  employee_no: z.string().max(30).nullable(),
  email: z
    .string()
    .email('Adresse e-mail invalide')
    .or(z.literal(''))
    .nullable()
    .transform((value) => (value ? value : null)),
  phone: z.string().max(30).nullable(),
  gender: z.enum(['male', 'female', 'other']).nullable(),
  birth_date: z.string().nullable(),
  hire_date: z.string().nullable(),
  contract_type: z.string().max(60).nullable(),
  speciality: z.string().max(80).nullable(),
  address: z.string().max(200).nullable(),
  status: z.enum(['active', 'on_leave', 'suspended', 'left']),
})

type TeacherValues = z.infer<typeof teacherSchema>

const STATUS_VARIANT: Record<StaffStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  on_leave: 'secondary',
  suspended: 'outline',
  left: 'outline',
}

export function TeachersPage() {
  const { schoolId, can } = useSchool()
  const canManage = can('teacher:write')

  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [toArchive, setToArchive] = useState<Teacher | null>(null)

  const teachersQuery = useQuery({
    queryKey: ['teachers', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listTeachers(schoolId!),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['teachers', schoolId] })

  const saveMutation = useMutation({
    mutationFn: (values: TeacherValues) =>
      editing
        ? updateTeacher(editing.id, values)
        : createTeacher({ school_id: schoolId!, ...values }).then(() => undefined),
    onSuccess: async () => {
      await refresh()
      toast.success(editing ? 'Fiche mise à jour.' : 'Enseignant ajouté.')
      setEditing(null)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveTeacher(id),
    onSuccess: async () => {
      await refresh()
      toast.success('Enseignant archivé.')
    },
  })

  const rows = useMemo(() => {
    const all = teachersQuery.data ?? []
    const needle = search.trim().toLowerCase()
    if (!needle) return all
    return all.filter((teacher) =>
      [teacher.full_name, teacher.email, teacher.speciality, teacher.employee_no]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    )
  }, [teachersQuery.data, search])

  const columns: Column<Teacher>[] = [
    {
      id: 'name',
      header: 'Enseignant',
      cell: (teacher) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarFallback className="text-xs">
              {initials(teacher.first_name, teacher.last_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{teacher.full_name}</p>
            {teacher.employee_no ? (
              <p className="tabular truncate text-xs text-muted-foreground">
                {teacher.employee_no}
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      id: 'speciality',
      header: 'Spécialité',
      cell: (teacher) => teacher.speciality ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'contact',
      header: 'Contact',
      hideOnMobile: true,
      cell: (teacher) => (
        <div className="space-y-0.5 text-sm">
          {teacher.email ? (
            <p className="flex items-center gap-1.5">
              <Mail className="size-3.5 text-muted-foreground" />
              <span className="truncate">{teacher.email}</span>
            </p>
          ) : null}
          {teacher.phone ? (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="size-3.5" />
              {teacher.phone}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'hire_date',
      header: 'Arrivée',
      hideOnMobile: true,
      cell: (teacher) => <span className="tabular text-sm">{formatDate(teacher.hire_date)}</span>,
    },
    {
      id: 'account',
      header: 'Compte',
      hideOnMobile: true,
      cell: (teacher) =>
        teacher.profile_id ? (
          <Badge variant="secondary">Actif</Badge>
        ) : (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Sans accès
          </Badge>
        ),
    },
    {
      id: 'status',
      header: 'Statut',
      cell: (teacher) => (
        <Badge variant={STATUS_VARIANT[teacher.status as StaffStatus]}>
          {STAFF_STATUS_LABELS[teacher.status as StaffStatus]}
        </Badge>
      ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            width: '96px',
            cell: (teacher: Teacher) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Modifier"
                  onClick={() => {
                    setEditing(teacher)
                    setDialogOpen(true)
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Archiver"
                  className="text-destructive"
                  onClick={() => setToArchive(teacher)}
                >
                  <Archive className="size-4" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enseignants"
        description="Fiches du corps enseignant. L'accès à l'application se gère séparément, dans Paramètres → Membres."
        actions={
          <RoleGate permission="teacher:write">
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="size-4" />
              Nouvel enseignant
            </Button>
          </RoleGate>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nom, e-mail, spécialité…"
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(teacher) => teacher.id}
            isLoading={teachersQuery.isPending}
            className="[&>div]:rounded-none [&>div]:border-0"
            emptyState={
              <EmptyState
                icon={UserSquare}
                title={search ? 'Aucun enseignant ne correspond' : 'Aucun enseignant'}
                description={
                  search
                    ? 'Essayez un autre terme de recherche.'
                    : "Créez les fiches du corps enseignant : elles servent aux emplois du temps, aux notes et aux surveillances d'examens."
                }
              />
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
        title={editing ? `Modifier — ${editing.full_name}` : 'Nouvel enseignant'}
        description="La fiche peut exister sans compte : l'accès s'ouvre plus tard par invitation."
        schema={teacherSchema}
        size="md"
        defaultValues={{
          first_name: editing?.first_name ?? '',
          last_name: editing?.last_name ?? '',
          employee_no: editing?.employee_no ?? null,
          email: editing?.email ?? null,
          phone: editing?.phone ?? null,
          gender: (editing?.gender as 'male' | 'female' | 'other' | null) ?? null,
          birth_date: editing?.birth_date ?? null,
          hire_date: editing?.hire_date ?? null,
          contract_type: editing?.contract_type ?? null,
          speciality: editing?.speciality ?? null,
          address: editing?.address ?? null,
          status: (editing?.status as StaffStatus) ?? 'active',
        }}
        onSubmit={(values) => saveMutation.mutateAsync(values)}
      >
        {(form) => (
          <div className="space-y-6">
            <FormSection title="Identité">
              <TextField control={form.control} name="first_name" label="Prénom" />
              <TextField control={form.control} name="last_name" label="Nom" />
              <TextField control={form.control} name="employee_no" label="Matricule interne" />
              <SelectField
                control={form.control}
                name="gender"
                label="Sexe"
                options={Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <DateField control={form.control} name="birth_date" label="Date de naissance" />
              <TextField control={form.control} name="address" label="Adresse" />
            </FormSection>

            <FormSection title="Contact">
              <TextField control={form.control} name="email" label="E-mail" type="email" />
              <TextField control={form.control} name="phone" label="Téléphone" />
            </FormSection>

            <FormSection title="Poste">
              <TextField control={form.control} name="speciality" label="Spécialité" />
              <TextField
                control={form.control}
                name="contract_type"
                label="Type de contrat"
                placeholder="Titulaire, vacataire…"
              />
              <DateField control={form.control} name="hire_date" label="Date d'arrivée" />
              <SelectField
                control={form.control}
                name="status"
                label="Statut"
                options={(Object.keys(STAFF_STATUS_LABELS) as StaffStatus[]).map((value) => ({
                  value,
                  label: STAFF_STATUS_LABELS[value],
                }))}
              />
            </FormSection>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(toArchive)}
        onOpenChange={(open) => !open && setToArchive(null)}
        title={`Archiver ${toArchive?.full_name} ?`}
        description="La fiche disparaît des listes et des sélecteurs. Les classes et notes déjà rattachées restent intactes."
        confirmLabel="Archiver"
        destructive
        onConfirm={async () => {
          if (toArchive) await archiveMutation.mutateAsync(toArchive.id)
          setToArchive(null)
        }}
      />
    </div>
  )
}
