import { supabase } from '@/lib/supabase'
import type { Lesson, TimetableEntry, TimetableSlot } from '@/types/domain'

export type TimetableScope = 'class' | 'teacher' | 'room'

export async function listTimetable(
  schoolId: string,
  academicYearId: string,
  scope: TimetableScope,
  targetId: string,
): Promise<TimetableEntry[]> {
  const column = scope === 'class' ? 'class_id' : scope === 'teacher' ? 'teacher_id' : 'room_id'

  const { data, error } = await supabase
    .from('timetable_view')
    .select('*')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .eq(column, targetId)
    .order('day_of_week')
    .order('start_time')
  if (error) throw error
  return data ?? []
}

export interface SlotInput {
  school_id: string
  academic_year_id: string
  class_subject_id: string
  class_id: string
  teacher_id: string | null
  room_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
}

export async function createSlot(input: SlotInput): Promise<TimetableSlot> {
  const { data, error } = await supabase.from('timetable_slots').insert(input).select().single()
  if (error) throw error
  return data
}

/**
 * Déplacement d'un créneau.
 *
 * Les trois contraintes EXCLUDE de la base font foi : si la salle, l'enseignant
 * ou la classe est déjà pris, Postgres renvoie 23P01 et rien n'est écrit. Le
 * frontend n'a aucune vérification de conflit à dupliquer — il se contente de
 * traduire l'erreur.
 */
export async function moveSlot(
  slotId: string,
  patch: { day_of_week: number; start_time: string; end_time: string },
): Promise<void> {
  const { error } = await supabase.from('timetable_slots').update(patch).eq('id', slotId)
  if (error) throw error
}

export async function updateSlot(
  slotId: string,
  patch: Partial<TimetableSlot>,
): Promise<void> {
  const { error } = await supabase.from('timetable_slots').update(patch).eq('id', slotId)
  if (error) throw error
}

export async function deleteSlot(slotId: string): Promise<void> {
  const { error } = await supabase.from('timetable_slots').delete().eq('id', slotId)
  if (error) throw error
}

/** Déplie la grille en séances datées, jours fériés exclus. */
export async function generateLessons(
  classId: string,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('generate_lessons', {
    p_class_id: classId,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data ?? 0
}

export interface LessonRow extends Lesson {
  subject: { name: string; color: string | null } | null
  teacher: { full_name: string | null } | null
  room: { name: string } | null
  class: { name: string } | null
}

export async function listLessons(
  schoolId: string,
  from: string,
  to: string,
  filters: { classId?: string | null; teacherId?: string | null },
): Promise<LessonRow[]> {
  let query = supabase
    .from('lessons')
    .select(
      '*, subject:subjects(name, color), teacher:teachers!lessons_teacher_id_fkey(full_name), room:rooms(name), class:classes(name)',
    )
    .eq('school_id', schoolId)
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('start_time')

  if (filters.classId) query = query.eq('class_id', filters.classId)
  if (filters.teacherId) query = query.eq('teacher_id', filters.teacherId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as LessonRow[]
}

export async function updateLesson(
  lessonId: string,
  patch: Partial<Lesson>,
): Promise<void> {
  const { error } = await supabase.from('lessons').update(patch).eq('id', lessonId)
  if (error) throw error
}

/** Emploi du temps d'un élève : celui de sa classe pour l'année en cours. */
export async function getStudentClassId(
  studentId: string,
  academicYearId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('class_id')
    .eq('student_id', studentId)
    .eq('academic_year_id', academicYearId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data?.class_id ?? null
}
