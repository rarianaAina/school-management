import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { GraduationCap, Plus, Search, Upload, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column, type SortState } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { RoleGate } from '@/components/shared/RoleGate'
import {
  DateField,
  FormSection,
  SelectField,
  TextField,
} from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { queryClient } from '@/lib/queryClient'
import { formatDate, initials } from '@/lib/formatters'
import {
  GENDER_LABELS,
  STUDENT_STATUS_LABELS,
  type StudentOverview,
  type StudentStatus,
} from '@/types/domain'
import { listClasses, listLevels } from '@/features/academics/api/academics.api'
import { createStudent, enrollStudents, listStudents } from '../api/students.api'
import { studentSchema, type StudentFormValues } from '../schemas/student.schema'
import { ImportStudentsDialog } from '../components/ImportStudentsDialog'

const PAGE_SIZE = 25

const STATUS_VARIANT: Record<StudentStatus, 'default' | 'secondary' | 'outline'> = {
  enrolled: 'default',
  graduated: 'secondary',
  transferred: 'outline',
  withdrawn: 'outline',
  suspended: 'outline',
}

export function StudentsPage() {
  const navigate = useNavigate()
  const { schoolId, selectedYearId, settings, can } = useSchool()
  const canManage = can('student:write')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [classId, setClassId] = useState<string>('all')
  const [levelId, setLevelId] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState | null>({ column: 'last_name', direction: 'asc' })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const filters = useMemo(
    () => ({
      search: debouncedSearch,
      classId: classId === 'all' ? null : classId,
      levelId: levelId === 'all' ? null : levelId,
      status: status === 'all' ? null : (status as StudentStatus),
      unassigned: classId === 'none',
    }),
    [debouncedSearch, classId, levelId, status],
  )

  const studentsQuery = useQuery({
    queryKey: ['students', schoolId, { ...filters, page, sort, year: selectedYearId }],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () =>
      listStudents(
        schoolId!,
        selectedYearId!,
        { ...filters, classId: filters.unassigned ? null : filters.classId },
        page,
        PAGE_SIZE,
        sort,
      ),
  })

  const levelsQuery = useQuery({
    queryKey: ['levels', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listLevels(schoolId!),
  })

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['students', schoolId] })

  const createMutation = useMutation({
    mutationFn: (values: StudentFormValues) =>
      createStudent({ school_id: schoolId!, ...values }),
    onSuccess: async (student) => {
      await refresh()
      toast.success(`${student.full_name} créé — matricule ${student.matricule}.`)
      navigate(`/eleves/${student.id}`)
    },
  })

  const enrollMutation = useMutation({
    mutationFn: ({ classIdTarget, ids }: { classIdTarget: string; ids: string[] }) =>
      enrollStudents(classIdTarget, ids),
    onSuccess: async (count) => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['classes', schoolId] }),
      ])
      setSelectedIds([])
      toast.success(`${count} élève${count > 1 ? 's' : ''} inscrit${count > 1 ? 's' : ''}.`)
    },
  })

  const columns: Column<StudentOverview>[] = [
    {
      id: 'last_name',
      header: 'Élève',
      sortable: true,
      cell: (student) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
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
      id: 'class_name',
      header: settings.vocabulary.class,
      sortable: true,
      cell: (student) =>
        student.class_name ? (
          <div>
            <p className="text-sm">{student.class_name}</p>
            <p className="text-xs text-muted-foreground">{student.level_name}</p>
          </div>
        ) : (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Non affecté
          </Badge>
        ),
    },
    {
      id: 'birth_date',
      header: 'Naissance',
      sortable: true,
      hideOnMobile: true,
      cell: (student) => <span className="tabular text-sm">{formatDate(student.birth_date)}</span>,
    },
    {
      id: 'gender',
      header: 'Sexe',
      hideOnMobile: true,
      cell: (student) => (
        <span className="text-sm text-muted-foreground">
          {student.gender ? (GENDER_LABELS[student.gender] ?? student.gender) : '—'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Statut',
      cell: (student) => (
        <Badge variant={STATUS_VARIANT[student.status as StudentStatus]}>
          {STUDENT_STATUS_LABELS[student.status as StudentStatus]}
        </Badge>
      ),
    },
  ]

  const total = studentsQuery.data?.total ?? 0
  const hasFilters =
    Boolean(debouncedSearch) || classId !== 'all' || levelId !== 'all' || status !== 'all'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Élèves"
        description={
          total > 0
            ? `${total} élève${total > 1 ? 's' : ''} sur l'année sélectionnée`
            : "Fiches, inscriptions et suivi des élèves de l'établissement"
        }
        actions={
          <RoleGate permission="student:write">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Importer
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Nouvel élève
            </Button>
          </RoleGate>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Nom, matricule ou e-mail…"
              className="pl-9"
            />
          </div>

          <Select
            value={classId}
            onValueChange={(value) => {
              setClassId(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={settings.vocabulary.class} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              <SelectItem value="none">Sans classe</SelectItem>
              {(classesQuery.data ?? []).map((item) => (
                <SelectItem key={item.id!} value={item.id!}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={levelId}
            onValueChange={(value) => {
              setLevelId(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les niveaux</SelectItem>
              {(levelsQuery.data ?? []).map((level) => (
                <SelectItem key={level.id} value={level.id}>
                  {level.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {(Object.keys(STUDENT_STATUS_LABELS) as StudentStatus[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {STUDENT_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('')
                setClassId('all')
                setLevelId('all')
                setStatus('all')
                setPage(1)
              }}
            >
              Réinitialiser
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        rows={studentsQuery.data?.rows ?? []}
        getRowId={(student) => student.id!}
        isLoading={studentsQuery.isPending}
        onRowClick={(student) => navigate(`/eleves/${student.id}`)}
        sort={sort}
        onSortChange={(next) => {
          setSort(next)
          setPage(1)
        }}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        selection={
          canManage
            ? { selectedIds, onChange: setSelectedIds }
            : undefined
        }
        bulkActions={(ids) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <GraduationCap className="size-4" />
                Inscrire dans une classe
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Classe de destination</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(classesQuery.data ?? []).map((item) => (
                <DropdownMenuItem
                  key={item.id!}
                  onSelect={() =>
                    enrollMutation.mutate({ classIdTarget: item.id!, ids })
                  }
                >
                  <span className="flex-1">{item.name}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {item.enrolled_count}
                    {item.capacity ? `/${item.capacity}` : ''}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        emptyState={
          <EmptyState
            icon={Users}
            title={hasFilters ? 'Aucun élève ne correspond' : 'Aucun élève'}
            description={
              hasFilters
                ? 'Ajustez ou réinitialisez les filtres.'
                : "Créez une fiche élève ou importez un fichier CSV pour démarrer l'année."
            }
            action={
              canManage && !hasFilters ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setImportOpen(true)}>
                    <Upload className="size-4" />
                    Importer un CSV
                  </Button>
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    Nouvel élève
                  </Button>
                </div>
              ) : undefined
            }
          />
        }
      />

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nouvel élève"
        description="Le matricule est attribué automatiquement à l'enregistrement."
        schema={studentSchema}
        defaultValues={{
          first_name: '',
          last_name: '',
          birth_date: null,
          birth_place: null,
          gender: null,
          nationality: null,
          email: null,
          phone: null,
          address: null,
          city: null,
          previous_school: null,
          entry_date: new Date().toISOString().slice(0, 10),
          status: 'enrolled',
          blood_group: null,
          medical_notes: null,
          notes: null,
        }}
        onSubmit={(values) => createMutation.mutateAsync(values)}
        submitLabel="Créer la fiche"
        size="lg"
      >
        {(form) => (
          <div className="space-y-6">
            <FormSection title="Identité">
              <TextField control={form.control} name="first_name" label="Prénom" />
              <TextField control={form.control} name="last_name" label="Nom" />
              <DateField control={form.control} name="birth_date" label="Date de naissance" />
              <TextField control={form.control} name="birth_place" label="Lieu de naissance" />
              <SelectField
                control={form.control}
                name="gender"
                label="Sexe"
                options={Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <TextField control={form.control} name="nationality" label="Nationalité" />
            </FormSection>

            <FormSection title="Coordonnées">
              <TextField control={form.control} name="email" label="E-mail" type="email" />
              <TextField control={form.control} name="phone" label="Téléphone" />
              <TextField control={form.control} name="address" label="Adresse" />
              <TextField control={form.control} name="city" label="Ville" />
            </FormSection>

            <FormSection title="Scolarité">
              <TextField
                control={form.control}
                name="previous_school"
                label="Établissement précédent"
              />
              <DateField control={form.control} name="entry_date" label="Date d'entrée" />
              <SelectField
                control={form.control}
                name="status"
                label="Statut"
                options={(Object.keys(STUDENT_STATUS_LABELS) as StudentStatus[]).map((value) => ({
                  value,
                  label: STUDENT_STATUS_LABELS[value],
                }))}
              />
            </FormSection>
          </div>
        )}
      </FormDialog>

      <ImportStudentsDialog open={importOpen} onOpenChange={setImportOpen} onImported={refresh} />
    </div>
  )
}
