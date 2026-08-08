import { supabase } from '@/lib/supabase'
import type { Teacher } from '@/types/domain'

export async function listTeachers(schoolId: string): Promise<Teacher[]> {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('school_id', schoolId)
    .is('deleted_at', null)
    .order('last_name')
  if (error) throw error
  return data ?? []
}

/**
 * Repli sur l'annuaire pour les rôles qui n'ont pas accès au dossier complet
 * (élèves, parents, comptabilité) : mêmes personnes, colonnes non sensibles.
 */
export async function listTeacherDirectory(schoolId: string) {
  const { data, error } = await supabase
    .from('teacher_directory')
    .select('*')
    .eq('school_id', schoolId)
    .order('last_name')
  if (error) throw error
  return data ?? []
}

export async function getTeacher(teacherId: string): Promise<Teacher | null> {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', teacherId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createTeacher(row: {
  school_id: string
  first_name: string
  last_name: string
  [key: string]: unknown
}): Promise<Teacher> {
  const { data, error } = await supabase.from('teachers').insert(row as never).select().single()
  if (error) throw error
  return data
}

export async function updateTeacher(
  teacherId: string,
  patch: Partial<Teacher>,
): Promise<void> {
  const { error } = await supabase.from('teachers').update(patch).eq('id', teacherId)
  if (error) throw error
}

export async function archiveTeacher(teacherId: string): Promise<void> {
  const { error } = await supabase
    .from('teachers')
    .update({ deleted_at: new Date().toISOString(), status: 'left' })
    .eq('id', teacherId)
  if (error) throw error
}

/** Matières enseignées, tous niveaux confondus, pour l'année sélectionnée. */
export async function listTeacherAssignments(teacherId: string, academicYearId: string) {
  const { data, error } = await supabase
    .from('class_subjects')
    .select('id, coefficient, weekly_hours, subject:subjects(name), class:classes!inner(id, name, academic_year_id)')
    .eq('teacher_id', teacherId)
    .eq('class.academic_year_id', academicYearId)
  if (error) throw error
  return data ?? []
}
