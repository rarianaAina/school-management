import { supabase } from '@/lib/supabase'
import type {
  Enrollment,
  Guardian,
  Student,
  StudentDocument,
  StudentOverview,
  StudentStatus,
} from '@/types/domain'

export interface StudentFilters {
  search?: string
  classId?: string | null
  levelId?: string | null
  status?: StudentStatus | null
  /** true : uniquement les élèves sans inscription active sur l'année. */
  unassigned?: boolean
}

export interface StudentPage {
  rows: StudentOverview[]
  total: number
}

export async function listStudents(
  schoolId: string,
  academicYearId: string,
  filters: StudentFilters,
  page: number,
  pageSize: number,
  sort: { column: string; direction: 'asc' | 'desc' } | null,
): Promise<StudentPage> {
  let query = supabase
    .from('student_overview')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    // Une ligne par année : sans ce filtre, un élève réinscrit apparaîtrait
    // autant de fois qu'il a d'années. Les élèves sans inscription ont
    // academic_year_id à null, d'où le `or`.
    .or(`academic_year_id.eq.${academicYearId},academic_year_id.is.null`)

  if (filters.search) {
    const needle = `%${filters.search.trim()}%`
    query = query.or(`full_name.ilike.${needle},matricule.ilike.${needle},email.ilike.${needle}`)
  }
  if (filters.classId) query = query.eq('class_id', filters.classId)
  if (filters.levelId) query = query.eq('level_id', filters.levelId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.unassigned) query = query.is('class_id', null)

  const column = sort?.column ?? 'last_name'
  query = query
    .order(column, { ascending: sort?.direction !== 'desc' })
    .range((page - 1) * pageSize, page * pageSize - 1)

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getStudent(studentId: string): Promise<Student | null> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createStudent(row: {
  school_id: string
  first_name: string
  last_name: string
  [key: string]: unknown
}): Promise<Student> {
  // Le matricule est attribué par trigger : ne jamais l'envoyer depuis le client.
  const { matricule: _ignored, ...values } = row
  const { data, error } = await supabase
    .from('students')
    .insert(values as never)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateStudent(
  studentId: string,
  patch: Partial<Student>,
): Promise<void> {
  const { error } = await supabase.from('students').update(patch).eq('id', studentId)
  if (error) throw error
}

/** Suppression logique : les bulletins et le dossier financier restent traçables. */
export async function archiveStudent(studentId: string): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ deleted_at: new Date().toISOString(), status: 'withdrawn' })
    .eq('id', studentId)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Inscriptions
// -----------------------------------------------------------------------------
export interface EnrollmentRow extends Enrollment {
  class: { id: string; name: string; level: { name: string } | null } | null
  academic_year: { id: string; name: string } | null
}

export async function listStudentEnrollments(studentId: string): Promise<EnrollmentRow[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('*, class:classes(id, name, level:levels(name)), academic_year:academic_years(id, name)')
    .eq('student_id', studentId)
    .order('enrolled_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EnrollmentRow[]
}

/** Inscrit un lot d'élèves dans une classe (clôture l'inscription précédente). */
export async function enrollStudents(
  classId: string,
  studentIds: string[],
  isRepeating = false,
): Promise<number> {
  const { data, error } = await supabase.rpc('enroll_students', {
    p_class_id: classId,
    p_student_ids: studentIds,
    p_is_repeating: isRepeating,
  })
  if (error) throw error
  return data ?? 0
}

export async function withdrawEnrollment(
  enrollmentId: string,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('enrollments')
    .update({
      status: 'withdrawn',
      withdrawn_at: new Date().toISOString().slice(0, 10),
      withdrawal_reason: reason,
    })
    .eq('id', enrollmentId)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Tuteurs
// -----------------------------------------------------------------------------
export interface StudentGuardianRow {
  student_id: string
  guardian_id: string
  relationship: string
  is_primary: boolean
  is_legal_guardian: boolean
  receives_invoices: boolean
  can_pick_up: boolean
  guardian: Guardian | null
}

export async function listStudentGuardians(studentId: string): Promise<StudentGuardianRow[]> {
  const { data, error } = await supabase
    .from('student_guardians')
    .select('*, guardian:guardians(*)')
    .eq('student_id', studentId)
    .order('is_primary', { ascending: false })
  if (error) throw error
  return (data ?? []) as StudentGuardianRow[]
}

export interface AttachGuardianInput {
  school_id: string
  student_id: string
  guardian_id?: string
  guardian?: {
    first_name: string
    last_name: string
    email?: string | null
    phone?: string | null
    address?: string | null
    profession?: string | null
  }
  relationship: string
  is_primary: boolean
  receives_invoices: boolean
}

export async function attachGuardian(input: AttachGuardianInput): Promise<void> {
  let guardianId = input.guardian_id

  if (!guardianId && input.guardian) {
    const { data, error } = await supabase
      .from('guardians')
      .insert({ school_id: input.school_id, ...input.guardian })
      .select('id')
      .single()
    if (error) throw error
    guardianId = data.id
  }

  if (!guardianId) throw new Error('Aucun tuteur à rattacher.')

  // Un seul contact principal par élève (index unique partiel côté base).
  if (input.is_primary) {
    await supabase
      .from('student_guardians')
      .update({ is_primary: false })
      .eq('student_id', input.student_id)
      .eq('is_primary', true)
  }

  const { error } = await supabase.from('student_guardians').upsert(
    {
      school_id: input.school_id,
      student_id: input.student_id,
      guardian_id: guardianId,
      relationship: input.relationship as never,
      is_primary: input.is_primary,
      receives_invoices: input.receives_invoices,
    },
    { onConflict: 'student_id,guardian_id' },
  )
  if (error) throw error
}

export async function detachGuardian(studentId: string, guardianId: string): Promise<void> {
  const { error } = await supabase
    .from('student_guardians')
    .delete()
    .eq('student_id', studentId)
    .eq('guardian_id', guardianId)
  if (error) throw error
}

export async function searchGuardians(schoolId: string, search: string): Promise<Guardian[]> {
  if (search.trim().length < 2) return []
  const needle = `%${search.trim()}%`
  const { data, error } = await supabase
    .from('guardians')
    .select('*')
    .eq('school_id', schoolId)
    .or(`full_name.ilike.${needle},email.ilike.${needle},phone.ilike.${needle}`)
    .limit(10)
  if (error) throw error
  return data ?? []
}

// -----------------------------------------------------------------------------
// Documents
// -----------------------------------------------------------------------------
export async function listStudentDocuments(studentId: string): Promise<StudentDocument[]> {
  const { data, error } = await supabase
    .from('student_documents')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function uploadStudentDocument(input: {
  school_id: string
  student_id: string
  file: File
  label: string
  type: string
}): Promise<void> {
  const extension = input.file.name.split('.').pop() ?? 'bin'
  const path = `${input.school_id}/students/${input.student_id}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, input.file, { upsert: false })
  if (uploadError) throw uploadError

  const { error } = await supabase.from('student_documents').insert({
    school_id: input.school_id,
    student_id: input.student_id,
    label: input.label,
    type: input.type,
    storage_path: path,
    mime_type: input.file.type,
    size_bytes: input.file.size,
  })
  if (error) throw error
}

export async function getDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

export async function uploadStudentPhoto(
  schoolId: string,
  studentId: string,
  file: File,
): Promise<string> {
  const extension = file.name.split('.').pop() ?? 'jpg'
  const path = `${schoolId}/${studentId}.${extension}`

  const { error } = await supabase.storage
    .from('student-photos')
    .upload(path, file, { upsert: true })
  if (error) throw error

  await updateStudent(studentId, { photo_url: path })
  return path
}
