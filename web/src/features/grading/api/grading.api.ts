import { supabase } from '@/lib/supabase'
import type {
  Assessment,
  AssessmentType,
  Grade,
  TermResult,
  TermSubjectResult,
  TermUnitResult,
} from '@/types/domain'

export async function listAssessmentTypes(schoolId: string): Promise<AssessmentType[]> {
  const { data, error } = await supabase
    .from('assessment_types')
    .select('*')
    .eq('school_id', schoolId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export interface AssessmentRow extends Assessment {
  type: { name: string; code: string | null } | null
  graded_count: number
}

export async function listAssessments(
  classSubjectId: string,
  termId: string,
): Promise<AssessmentRow[]> {
  const { data, error } = await supabase
    .from('assessments')
    .select('*, type:assessment_types(name, code), grades(count)')
    .eq('class_subject_id', classSubjectId)
    .eq('term_id', termId)
    .order('date', { ascending: false })
  if (error) throw error

  return (data ?? []).map((row) => {
    const { grades, ...rest } = row as typeof row & { grades: Array<{ count: number }> }
    return { ...rest, graded_count: grades?.[0]?.count ?? 0 } as AssessmentRow
  })
}

export async function createAssessment(row: {
  school_id: string
  class_subject_id: string
  term_id: string
  assessment_type_id: string | null
  title: string
  date: string
  max_score: number
  weight: number
}): Promise<Assessment> {
  const { data, error } = await supabase.from('assessments').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateAssessment(
  assessmentId: string,
  patch: Partial<Assessment>,
): Promise<void> {
  const { error } = await supabase.from('assessments').update(patch).eq('id', assessmentId)
  if (error) throw error
}

export async function deleteAssessment(assessmentId: string): Promise<void> {
  const { error } = await supabase.from('assessments').delete().eq('id', assessmentId)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Saisie des notes
// -----------------------------------------------------------------------------
export interface GradeSheetRow {
  student_id: string
  full_name: string
  matricule: string
  grade: Grade | null
}

/** Feuille de notes : tous les inscrits, notés ou non. */
export async function getGradeSheet(
  assessmentId: string,
  classId: string,
): Promise<GradeSheetRow[]> {
  const [{ data: students, error: studentsError }, { data: grades, error: gradesError }] =
    await Promise.all([
      supabase
        .from('student_overview')
        .select('id, full_name, matricule')
        .eq('class_id', classId)
        .order('last_name'),
      supabase.from('grades').select('*').eq('assessment_id', assessmentId),
    ])

  if (studentsError) throw studentsError
  if (gradesError) throw gradesError

  const byStudent = new Map((grades ?? []).map((grade) => [grade.student_id, grade]))

  return (students ?? []).map((student) => ({
    student_id: student.id!,
    full_name: student.full_name ?? '',
    matricule: student.matricule ?? '',
    grade: byStudent.get(student.id!) ?? null,
  }))
}

export interface GradeInput {
  student_id: string
  score: number | null
  is_absent: boolean
  is_excused: boolean
  comment?: string | null
}

/** Enregistre la feuille entière en une requête. */
export async function saveGrades(
  schoolId: string,
  assessmentId: string,
  rows: GradeInput[],
): Promise<void> {
  const payload = rows.map((row) => ({
    school_id: schoolId,
    assessment_id: assessmentId,
    student_id: row.student_id,
    score: row.is_absent ? null : row.score,
    is_absent: row.is_absent,
    is_excused: row.is_excused,
    comment: row.comment ?? null,
    graded_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('grades')
    .upsert(payload, { onConflict: 'assessment_id,student_id' })
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Moyennes et bulletins
// -----------------------------------------------------------------------------
export async function computeTermResults(classId: string, termId: string): Promise<number> {
  const { data, error } = await supabase.rpc('compute_term_results', {
    p_class_id: classId,
    p_term_id: termId,
  })
  if (error) throw error
  return data ?? 0
}

export async function publishTermResults(classId: string, termId: string): Promise<number> {
  const { data, error } = await supabase.rpc('publish_term_results', {
    p_class_id: classId,
    p_term_id: termId,
  })
  if (error) throw error
  return data ?? 0
}

export interface TermResultRow extends TermResult {
  student: { id: string; full_name: string | null; matricule: string } | null
}

export async function listTermResults(
  classId: string,
  termId: string,
): Promise<TermResultRow[]> {
  const { data, error } = await supabase
    .from('term_results')
    .select('*, student:students(id, full_name, matricule)')
    .eq('class_id', classId)
    .eq('term_id', termId)
    .order('rank')
  if (error) throw error
  return (data ?? []) as TermResultRow[]
}

export interface SubjectResultRow extends TermSubjectResult {
  class_subject: {
    subject: { name: string; code: string | null } | null
    teacher: { full_name: string | null } | null
  } | null
}

export async function listSubjectResults(
  studentId: string,
  termId: string,
): Promise<SubjectResultRow[]> {
  const { data, error } = await supabase
    .from('term_subject_results')
    .select(
      '*, class_subject:class_subjects(subject:subjects(name, code), teacher:teachers(full_name))',
    )
    .eq('student_id', studentId)
    .eq('term_id', termId)
  if (error) throw error

  return ((data ?? []) as SubjectResultRow[]).sort((a, b) =>
    (a.class_subject?.subject?.name ?? '').localeCompare(
      b.class_subject?.subject?.name ?? '',
      'fr',
    ),
  )
}

export interface UnitResultRow extends TermUnitResult {
  study_unit: { code: string; name: string; credits: number } | null
}

export async function listUnitResults(
  studentId: string,
  termId: string,
): Promise<UnitResultRow[]> {
  const { data, error } = await supabase
    .from('term_unit_results')
    .select('*, study_unit:study_units(code, name, credits)')
    .eq('student_id', studentId)
    .eq('term_id', termId)
  if (error) throw error
  return (data ?? []) as UnitResultRow[]
}

export async function saveTermComment(
  resultId: string,
  headComment: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('term_results')
    .update({ head_comment: headComment })
    .eq('id', resultId)
  if (error) throw error
}

/** Dépose le bulletin PDF et mémorise son chemin. */
export async function storeReportCard(
  schoolId: string,
  termId: string,
  studentId: string,
  resultId: string,
  blob: Blob,
): Promise<string> {
  const path = `${schoolId}/${termId}/${studentId}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('report-cards')
    .upload(path, blob, { upsert: true, contentType: 'application/pdf' })
  if (uploadError) throw uploadError

  const { error } = await supabase
    .from('term_results')
    .update({ pdf_path: path })
    .eq('id', resultId)
  if (error) throw error

  return path
}

/** Historique pluriannuel d'un élève. */
export async function listStudentHistory(studentId: string): Promise<TermResultRow[]> {
  const { data, error } = await supabase
    .from('term_results')
    .select('*, student:students(id, full_name, matricule), term:terms(name, academic_year_id)')
    .eq('student_id', studentId)
    .order('computed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TermResultRow[]
}
