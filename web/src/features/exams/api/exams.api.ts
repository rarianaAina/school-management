import { supabase } from '@/lib/supabase'
import type {
  Deliberation,
  Exam,
  ExamRegistration,
  ExamSession,
  ExamSessionOverview,
} from '@/types/domain'

export async function listSessions(
  schoolId: string,
  academicYearId: string,
): Promise<ExamSessionOverview[]> {
  const { data, error } = await supabase
    .from('exam_session_overview')
    .select('*')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .order('start_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createSession(row: {
  school_id: string
  academic_year_id: string
  term_id: string | null
  name: string
  type: string
  start_date: string
  end_date: string
}): Promise<ExamSession> {
  const { data, error } = await supabase
    .from('exam_sessions')
    .insert(row as never)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSession(
  sessionId: string,
  patch: Partial<ExamSession>,
): Promise<void> {
  const { error } = await supabase.from('exam_sessions').update(patch).eq('id', sessionId)
  if (error) throw error
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('exam_sessions').delete().eq('id', sessionId)
  if (error) throw error
}

export interface ExamRow extends Exam {
  subject: { name: string; code: string | null } | null
  class: { name: string } | null
  exam_rooms: Array<{
    id: string
    capacity: number | null
    room: { name: string; capacity: number | null } | null
    exam_supervisors: Array<{ id: string; role: string; teacher: { full_name: string | null } | null }>
  }>
  result_count: number
}

export async function listExams(sessionId: string): Promise<ExamRow[]> {
  const { data, error } = await supabase
    .from('exams')
    .select(
      '*, subject:subjects(name, code), class:classes(name), ' +
        'exam_rooms(id, capacity, room:rooms(name, capacity), exam_supervisors(id, role, teacher:teachers(full_name))), ' +
        'exam_results(count)',
    )
    .eq('exam_session_id', sessionId)
    .order('date')
    .order('start_time')
  if (error) throw error

  // PostgREST renvoie l'agregat sous forme de tableau : on l'aplatit en compteur.
  return (data ?? []).map((row) => {
    const record = row as unknown as Record<string, unknown>
    const counts = record.exam_results as Array<{ count: number }> | undefined
    const { exam_results: _ignored, ...rest } = record
    return { ...rest, result_count: counts?.[0]?.count ?? 0 } as unknown as ExamRow
  })
}

export async function createExam(row: {
  school_id: string
  exam_session_id: string
  subject_id: string
  class_id: string | null
  level_id: string | null
  date: string
  start_time: string
  duration_minutes: number
  max_score: number
  coefficient: number
}): Promise<Exam> {
  const { data, error } = await supabase.from('exams').insert(row).select().single()
  if (error) throw error
  return data
}

export async function deleteExam(examId: string): Promise<void> {
  const { error } = await supabase.from('exams').delete().eq('id', examId)
  if (error) throw error
}

export async function addExamRoom(row: {
  school_id: string
  exam_id: string
  room_id: string
  capacity: number | null
}): Promise<string> {
  const { data, error } = await supabase.from('exam_rooms').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

export async function addSupervisor(row: {
  school_id: string
  exam_room_id: string
  teacher_id: string
  role: string
}): Promise<void> {
  const { error } = await supabase.from('exam_supervisors').insert(row as never)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Convocations
// -----------------------------------------------------------------------------
export interface RegistrationRow extends ExamRegistration {
  student: { id: string; full_name: string | null; matricule: string } | null
  exam_room: { room: { name: string } | null } | null
}

export async function listRegistrations(sessionId: string): Promise<RegistrationRow[]> {
  const { data, error } = await supabase
    .from('exam_registrations')
    .select('*, student:students(id, full_name, matricule), exam_room:exam_rooms(room:rooms(name))')
    .eq('exam_session_id', sessionId)
    .order('convocation_number')
  if (error) throw error
  return (data ?? []) as unknown as RegistrationRow[]
}

export async function registerClass(sessionId: string, classId: string): Promise<number> {
  const { data, error } = await supabase.rpc('register_class_for_session', {
    p_session_id: sessionId,
    p_class_id: classId,
  })
  if (error) throw error
  return data ?? 0
}

export async function assignSeats(examId: string): Promise<number> {
  const { data, error } = await supabase.rpc('assign_exam_seats', { p_exam_id: examId })
  if (error) throw error
  return data ?? 0
}

// -----------------------------------------------------------------------------
// Résultats
// -----------------------------------------------------------------------------
export interface ExamResultSheetRow {
  student_id: string
  full_name: string
  matricule: string
  score: number | null
  is_absent: boolean
  is_disqualified: boolean
}

export async function getExamResultSheet(
  examId: string,
  sessionId: string,
): Promise<ExamResultSheetRow[]> {
  const [{ data: registrations, error: regError }, { data: results, error: resError }] =
    await Promise.all([
      supabase
        .from('exam_registrations')
        .select('student_id, student:students(full_name, matricule)')
        .eq('exam_session_id', sessionId)
        .eq('status', 'registered'),
      supabase.from('exam_results').select('*').eq('exam_id', examId),
    ])

  if (regError) throw regError
  if (resError) throw resError

  const byStudent = new Map((results ?? []).map((row) => [row.student_id, row]))

  return (registrations ?? [])
    .map((registration) => {
      const student = registration.student as unknown as {
        full_name: string | null
        matricule: string
      } | null
      const result = byStudent.get(registration.student_id)
      return {
        student_id: registration.student_id,
        full_name: student?.full_name ?? '',
        matricule: student?.matricule ?? '',
        score: result?.score !== null && result?.score !== undefined ? Number(result.score) : null,
        is_absent: result?.is_absent ?? false,
        is_disqualified: result?.is_disqualified ?? false,
      }
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'))
}

export async function saveExamResults(
  schoolId: string,
  examId: string,
  rows: ExamResultSheetRow[],
): Promise<void> {
  const { error } = await supabase.from('exam_results').upsert(
    rows.map((row) => ({
      school_id: schoolId,
      exam_id: examId,
      student_id: row.student_id,
      score: row.is_absent || row.is_disqualified ? null : row.score,
      is_absent: row.is_absent,
      is_disqualified: row.is_disqualified,
      graded_at: new Date().toISOString(),
    })),
    { onConflict: 'exam_id,student_id' },
  )
  if (error) throw error
}

export async function pushExamToGrades(examId: string, termId: string): Promise<number> {
  const { data, error } = await supabase.rpc('push_exam_to_grades', {
    p_exam_id: examId,
    p_term_id: termId,
  })
  if (error) throw error
  return data ?? 0
}

// -----------------------------------------------------------------------------
// Délibérations
// -----------------------------------------------------------------------------
export interface DeliberationRow extends Deliberation {
  student: { id: string; full_name: string | null; matricule: string } | null
}

export async function listDeliberations(sessionId: string): Promise<DeliberationRow[]> {
  const { data, error } = await supabase
    .from('deliberations')
    .select('*, student:students(id, full_name, matricule)')
    .eq('exam_session_id', sessionId)
    .order('computed_average', { ascending: false })
  if (error) throw error
  return (data ?? []) as DeliberationRow[]
}

export async function computeDeliberations(sessionId: string): Promise<number> {
  const { data, error } = await supabase.rpc('compute_deliberations', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return data ?? 0
}

export async function overrideDecision(
  deliberationId: string,
  decision: string,
  comment: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('deliberations')
    .update({
      decision: decision as never,
      jury_comment: comment,
      decided_at: new Date().toISOString(),
    })
    .eq('id', deliberationId)
  if (error) throw error
}
