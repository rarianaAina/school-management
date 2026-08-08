import { supabase } from '@/lib/supabase'
import type {
  AbsenceJustification,
  AttendanceStatus,
  JustificationStatus,
  LessonAttendance,
} from '@/types/domain'

export type LessonAttendanceRow = LessonAttendance

export async function listLessonsOfDay(
  schoolId: string,
  date: string,
  classId: string | null,
): Promise<LessonAttendanceRow[]> {
  let query = supabase
    .from('lesson_attendance')
    .select('*')
    .eq('school_id', schoolId)
    .eq('date', date)
    .order('start_time')

  if (classId) query = query.eq('class_id', classId)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export interface AttendanceSheetRow {
  student_id: string
  full_name: string
  matricule: string
  status: AttendanceStatus
  minutes_late: number | null
  comment: string | null
}

export async function getAttendanceSheet(
  lessonId: string,
  classId: string,
): Promise<AttendanceSheetRow[]> {
  const [{ data: students, error: studentsError }, { data: records, error: recordsError }] =
    await Promise.all([
      supabase
        .from('student_overview')
        .select('id, full_name, matricule')
        .eq('class_id', classId)
        .order('last_name'),
      supabase.from('attendance_records').select('*').eq('lesson_id', lessonId),
    ])

  if (studentsError) throw studentsError
  if (recordsError) throw recordsError

  const byStudent = new Map((records ?? []).map((row) => [row.student_id, row]))

  return (students ?? []).map((student) => {
    const record = byStudent.get(student.id!)
    return {
      student_id: student.id!,
      full_name: student.full_name ?? '',
      matricule: student.matricule ?? '',
      status: (record?.status ?? 'present') as AttendanceStatus,
      minutes_late: record?.minutes_late ?? null,
      comment: record?.comment ?? null,
    }
  })
}

/** Ouvre la feuille : tous présents par défaut, l'enseignant ne saisit que les exceptions. */
export async function openAttendanceSheet(lessonId: string): Promise<number> {
  const { data, error } = await supabase.rpc('open_attendance_sheet', { p_lesson_id: lessonId })
  if (error) throw error
  return data ?? 0
}

export async function saveAttendance(
  schoolId: string,
  lessonId: string,
  rows: AttendanceSheetRow[],
): Promise<void> {
  const { error } = await supabase.from('attendance_records').upsert(
    rows.map((row) => ({
      school_id: schoolId,
      lesson_id: lessonId,
      student_id: row.student_id,
      status: row.status,
      minutes_late: row.status === 'late' ? row.minutes_late : null,
      comment: row.comment,
      recorded_at: new Date().toISOString(),
    })),
    { onConflict: 'lesson_id,student_id' },
  )
  if (error) throw error
}

export interface AlertRow {
  student_id: string
  full_name: string
  matricule: string
  class_name: string
  absent_count: number
  attendance_rate: number | null
}

export async function listAbsenteeismAlerts(
  schoolId: string,
  threshold: number,
): Promise<AlertRow[]> {
  const { data, error } = await supabase.rpc('absenteeism_alerts', {
    p_school_id: schoolId,
    p_threshold: threshold,
  })
  if (error) throw error
  return (data ?? []) as AlertRow[]
}

export interface JustificationRow extends AbsenceJustification {
  student: { full_name: string | null; matricule: string } | null
}

export async function listJustifications(schoolId: string): Promise<JustificationRow[]> {
  const { data, error } = await supabase
    .from('absence_justifications')
    .select('*, student:students(full_name, matricule)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as JustificationRow[]
}

export async function approveJustification(
  id: string,
  status: JustificationStatus,
): Promise<void> {
  const { error } = await supabase
    .from('absence_justifications')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

export async function submitJustification(row: {
  school_id: string
  student_id: string
  start_date: string
  end_date: string
  reason: string
}): Promise<void> {
  const { error } = await supabase.from('absence_justifications').insert(row)
  if (error) throw error
}

/** Assiduité d'un élève, pour sa fiche et l'espace famille. */
export async function getStudentAttendance(studentId: string) {
  const { data, error } = await supabase
    .from('attendance_stats')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) throw error
  return data
}
