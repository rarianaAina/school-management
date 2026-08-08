import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Archive,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { RoleGate } from '@/components/shared/RoleGate'
import {
  DateField,
  FormSection,
  SelectField,
  SwitchField,
  TextField,
  TextareaField,
} from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import { formatDate, initials } from '@/lib/formatters'
import {
  ENROLLMENT_STATUS_LABELS,
  GENDER_LABELS,
  RELATIONSHIP_LABELS,
  STUDENT_STATUS_LABELS,
  type EnrollmentStatus,
  type GuardianRelationship,
  type StudentStatus,
} from '@/types/domain'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import {
  archiveStudent,
  attachGuardian,
  detachGuardian,
  getStudent,
  listStudentDocuments,
  listStudentEnrollments,
  listStudentGuardians,
  updateStudent,
  uploadStudentDocument,
  uploadStudentPhoto,
  getDocumentUrl,
  type EnrollmentRow,
  type StudentGuardianRow,
} from '../api/students.api'
import { guardianSchema, studentSchema, type StudentFormValues } from '../schemas/student.schema'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value ?? '—'}</dd>
    </div>
  )
}

export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const navigate = useNavigate()
  const { schoolId, can, settings } = useSchool()
  const canManage = can('student:write')

  const [editOpen, setEditOpen] = useState(false)
  const [guardianOpen, setGuardianOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [guardianToDetach, setGuardianToDetach] = useState<StudentGuardianRow | null>(null)

  const studentQuery = useQuery({
    queryKey: ['student', schoolId, studentId],
    enabled: Boolean(studentId),
    queryFn: () => getStudent(studentId!),
  })

  const guardiansQuery = useQuery({
    queryKey: ['student-guardians', schoolId, studentId],
    enabled: Boolean(studentId),
    queryFn: () => listStudentGuardians(studentId!),
  })

  const enrollmentsQuery = useQuery({
    queryKey: ['student-enrollments', schoolId, studentId],
    enabled: Boolean(studentId),
    queryFn: () => listStudentEnrollments(studentId!),
  })

  const documentsQuery = useQuery({
    queryKey: ['student-documents', schoolId, studentId],
    enabled: Boolean(studentId),
    queryFn: () => listStudentDocuments(studentId!),
  })

  const student = studentQuery.data

  const updateMutation = useMutation({
    mutationFn: (values: StudentFormValues) => updateStudent(studentId!, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student', schoolId, studentId] })
      await queryClient.invalidateQueries({ queryKey: ['students', schoolId] })
      toast.success('Fiche mise à jour.')
    },
  })

  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadStudentPhoto(schoolId!, studentId!, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student', schoolId, studentId] })
      toast.success('Photo enregistrée.')
    },
  })

  const guardianMutation = useMutation({
    mutationFn: (values: {
      mode: 'new' | 'existing'
      guardian_id?: string | null
      first_name?: string
      last_name?: string
      email?: string | null
      phone?: string | null
      address?: string | null
      profession?: string | null
      relationship: string
      is_primary: boolean
      receives_invoices: boolean
    }) =>
      attachGuardian({
        school_id: schoolId!,
        student_id: studentId!,
        guardian_id: values.mode === 'existing' ? (values.guardian_id ?? undefined) : undefined,
        guardian:
          values.mode === 'new'
            ? {
                first_name: values.first_name!,
                last_name: values.last_name!,
                email: values.email ?? null,
                phone: values.phone ?? null,
                address: values.address ?? null,
                profession: values.profession ?? null,
              }
            : undefined,
        relationship: values.relationship,
        is_primary: values.is_primary,
        receives_invoices: values.receives_invoices,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-guardians', schoolId, studentId] })
      toast.success('Tuteur rattaché.')
    },
  })

  const detachMutation = useMutation({
    mutationFn: (guardianId: string) => detachGuardian(studentId!, guardianId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-guardians', schoolId, studentId] })
      toast.success('Tuteur retiré.')
    },
  })

  const documentMutation = useMutation({
    mutationFn: (file: File) =>
      uploadStudentDocument({
        school_id: schoolId!,
        student_id: studentId!,
        file,
        label: file.name,
        type: 'other',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-documents', schoolId, studentId] })
      toast.success('Document ajouté.')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: () => archiveStudent(studentId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['students', schoolId] })
      toast.success('Élève archivé.')
      navigate('/eleves')
    },
  })

  if (studentQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!student) return <NotFoundPage />

  const enrollmentColumns: Column<EnrollmentRow>[] = [
    {
      id: 'year',
      header: 'Année',
      cell: (row) => <span className="font-medium">{row.academic_year?.name ?? '—'}</span>,
    },
    {
      id: 'class',
      header: settings.vocabulary.class,
      cell: (row) => (
        <div>
          <p className="text-sm">{row.class?.name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{row.class?.level?.name}</p>
        </div>
      ),
    },
    {
      id: 'enrolled_at',
      header: 'Inscrit le',
      hideOnMobile: true,
      cell: (row) => <span className="tabular text-sm">{formatDate(row.enrolled_at)}</span>,
    },
    {
      id: 'status',
      header: 'Statut',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Badge variant={row.status === 'active' ? 'default' : 'outline'}>
            {ENROLLMENT_STATUS_LABELS[row.status as EnrollmentStatus]}
          </Badge>
          {row.is_repeating ? <Badge variant="secondary">Redoublant</Badge> : null}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.full_name ?? ''}
        description={
          <span className="tabular">
            Matricule {student.matricule}
            {student.birth_date ? ` · né(e) le ${formatDate(student.birth_date)}` : ''}
          </span>
        }
        breadcrumbs={[
          { label: 'Accueil', to: '/' },
          { label: 'Élèves', to: '/eleves' },
          { label: student.full_name ?? '' },
        ]}
        actions={
          <RoleGate permission="student:write">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Modifier
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="size-4" />
              Archiver
            </Button>
          </RoleGate>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar className="size-24">
                <AvatarImage src={student.photo_url ?? undefined} alt="" />
                <AvatarFallback className="text-2xl">
                  {initials(student.first_name, student.last_name)}
                </AvatarFallback>
              </Avatar>

              {canManage ? (
                <label className="cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {photoMutation.isPending ? 'Envoi…' : 'Changer la photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) photoMutation.mutate(file)
                    }}
                  />
                </label>
              ) : null}

              <Badge variant={student.status === 'enrolled' ? 'default' : 'outline'}>
                {STUDENT_STATUS_LABELS[student.status as StudentStatus]}
              </Badge>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              {student.email ? (
                <p className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{student.email}</span>
                </p>
              ) : null}
              {student.phone ? (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  {student.phone}
                </p>
              ) : null}
              {student.address || student.city ? (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>{[student.address, student.city].filter(Boolean).join(', ')}</span>
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="identity">
          <TabsList>
            <TabsTrigger value="identity">Identité</TabsTrigger>
            <TabsTrigger value="guardians">
              Tuteurs
              {guardiansQuery.data?.length ? ` (${guardiansQuery.data.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="enrollments">Scolarité</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="pt-4">
            <Card>
              <CardContent className="p-6">
                <dl className="divide-y">
                  <InfoRow label="Prénom" value={student.first_name} />
                  <InfoRow label="Nom" value={student.last_name} />
                  <InfoRow label="Date de naissance" value={formatDate(student.birth_date)} />
                  <InfoRow label="Lieu de naissance" value={student.birth_place} />
                  <InfoRow
                    label="Sexe"
                    value={student.gender ? GENDER_LABELS[student.gender] : null}
                  />
                  <InfoRow label="Nationalité" value={student.nationality} />
                  <InfoRow label="Groupe sanguin" value={student.blood_group} />
                  <InfoRow label="Établissement précédent" value={student.previous_school} />
                  <InfoRow label="Date d'entrée" value={formatDate(student.entry_date)} />
                  <InfoRow label="Notes médicales" value={student.medical_notes} />
                  <InfoRow label="Observations" value={student.notes} />
                </dl>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guardians" className="space-y-4 pt-4">
            <RoleGate permission="student:write">
              <div className="flex justify-end">
                <Button onClick={() => setGuardianOpen(true)}>
                  <Plus className="size-4" />
                  Rattacher un tuteur
                </Button>
              </div>
            </RoleGate>

            {guardiansQuery.data?.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={Users}
                    title="Aucun tuteur"
                    description="Rattachez un parent ou un tuteur légal pour lui donner accès au suivi et lui adresser les factures."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {(guardiansQuery.data ?? []).map((link) => (
                  <Card key={link.guardian_id}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-base">
                          {link.guardian?.full_name}
                          {link.is_primary ? (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="size-3" />
                              Principal
                            </Badge>
                          ) : null}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {RELATIONSHIP_LABELS[link.relationship as GuardianRelationship]}
                        </p>
                      </div>
                      <RoleGate permission="student:write">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          aria-label="Retirer"
                          onClick={() => setGuardianToDetach(link)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </RoleGate>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-sm">
                      {link.guardian?.email ? (
                        <p className="flex items-center gap-2">
                          <Mail className="size-4 text-muted-foreground" />
                          <span className="truncate">{link.guardian.email}</span>
                        </p>
                      ) : null}
                      {link.guardian?.phone ? (
                        <p className="flex items-center gap-2">
                          <Phone className="size-4 text-muted-foreground" />
                          {link.guardian.phone}
                        </p>
                      ) : null}
                      {link.receives_invoices ? (
                        <Badge variant="outline" className="mt-2 font-normal">
                          Destinataire des factures
                        </Badge>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="enrollments" className="pt-4">
            <DataTable
              columns={enrollmentColumns}
              rows={enrollmentsQuery.data ?? []}
              getRowId={(row) => row.id}
              isLoading={enrollmentsQuery.isPending}
              emptyState={
                <EmptyState
                  icon={GraduationCap}
                  title="Aucune inscription"
                  description="Inscrivez cet élève dans une classe depuis la liste des élèves ou la fiche de la classe."
                />
              }
            />
          </TabsContent>

          <TabsContent value="documents" className="space-y-4 pt-4">
            <RoleGate permission="student:write">
              <div className="flex justify-end">
                <label className="inline-flex">
                  <Button asChild variant="outline">
                    <span className="cursor-pointer">
                      <Upload className="size-4" />
                      {documentMutation.isPending ? 'Envoi…' : 'Ajouter un document'}
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) documentMutation.mutate(file)
                    }}
                  />
                </label>
              </div>
            </RoleGate>

            {documentsQuery.data?.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={FileText}
                    title="Aucun document"
                    description="Acte de naissance, certificat de scolarité, justificatifs…"
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {(documentsQuery.data ?? []).map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                      onClick={async () => {
                        try {
                          const url = await getDocumentUrl(document.storage_path)
                          window.open(url, '_blank', 'noopener')
                        } catch {
                          toast.error('Document indisponible.')
                        }
                      }}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{document.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(document.created_at)}
                          {document.size_bytes
                            ? ` · ${Math.round(document.size_bytes / 1024)} Ko`
                            : ''}
                        </span>
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <FormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Modifier la fiche"
        schema={studentSchema}
        size="lg"
        defaultValues={{
          first_name: student.first_name,
          last_name: student.last_name,
          birth_date: student.birth_date,
          birth_place: student.birth_place,
          gender: student.gender as 'male' | 'female' | 'other' | null,
          nationality: student.nationality,
          email: student.email,
          phone: student.phone,
          address: student.address,
          city: student.city,
          previous_school: student.previous_school,
          entry_date: student.entry_date,
          status: student.status as StudentStatus,
          blood_group: student.blood_group,
          medical_notes: student.medical_notes,
          notes: student.notes,
        }}
        onSubmit={(values) => updateMutation.mutateAsync(values)}
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

            <FormSection title="Scolarité et santé">
              <TextField control={form.control} name="previous_school" label="Établissement précédent" />
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
              <TextField control={form.control} name="blood_group" label="Groupe sanguin" />
              <TextareaField
                control={form.control}
                name="medical_notes"
                label="Notes médicales"
                className="sm:col-span-2"
              />
              <TextareaField
                control={form.control}
                name="notes"
                label="Observations"
                className="sm:col-span-2"
              />
            </FormSection>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={guardianOpen}
        onOpenChange={setGuardianOpen}
        title="Rattacher un tuteur"
        description="Le tuteur pourra suivre la scolarité de l'élève une fois son compte créé."
        schema={guardianSchema}
        size="md"
        defaultValues={{
          mode: 'new',
          guardian_id: null,
          first_name: '',
          last_name: '',
          email: null,
          phone: null,
          address: null,
          profession: null,
          relationship: 'father',
          is_primary: (guardiansQuery.data?.length ?? 0) === 0,
          receives_invoices: true,
        }}
        onSubmit={(values) => guardianMutation.mutateAsync(values)}
        submitLabel="Rattacher"
      >
        {(form) => (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="first_name" label="Prénom" />
              <TextField control={form.control} name="last_name" label="Nom" />
              <SelectField
                control={form.control}
                name="relationship"
                label="Lien de parenté"
                options={(Object.keys(RELATIONSHIP_LABELS) as GuardianRelationship[]).map(
                  (value) => ({ value, label: RELATIONSHIP_LABELS[value] }),
                )}
              />
              <TextField control={form.control} name="profession" label="Profession" />
              <TextField control={form.control} name="email" label="E-mail" type="email" />
              <TextField control={form.control} name="phone" label="Téléphone" />
              <TextField
                control={form.control}
                name="address"
                label="Adresse"
                className="sm:col-span-2"
              />
            </div>

            <SwitchField
              control={form.control}
              name="is_primary"
              label="Contact principal"
              description="Destinataire des convocations et des communications prioritaires."
            />
            <SwitchField
              control={form.control}
              name="receives_invoices"
              label="Destinataire des factures"
              description="Recevra les échéanciers et les relances de paiement."
            />
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archiver ${student.full_name} ?`}
        description="La fiche disparaît des listes mais reste conservée : bulletins, historique financier et inscriptions passées demeurent consultables."
        confirmLabel="Archiver"
        destructive
        onConfirm={() => archiveMutation.mutateAsync()}
      />

      <ConfirmDialog
        open={Boolean(guardianToDetach)}
        onOpenChange={(open) => !open && setGuardianToDetach(null)}
        title={`Retirer ${guardianToDetach?.guardian?.full_name} ?`}
        description="Le lien avec l'élève est supprimé. La fiche du tuteur est conservée."
        confirmLabel="Retirer"
        destructive
        onConfirm={async () => {
          if (guardianToDetach) await detachMutation.mutateAsync(guardianToDetach.guardian_id)
          setGuardianToDetach(null)
        }}
      />
    </div>
  )
}
