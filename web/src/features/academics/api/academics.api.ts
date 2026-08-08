import { supabase } from '@/lib/supabase'
import type {
  ClassOverview,
  ClassSubject,
  Level,
  Program,
  Room,
  SchoolClass,
  Subject,
  SubjectLevel,
} from '@/types/domain'

// -----------------------------------------------------------------------------
// Referentiels : niveaux, filieres, matieres, salles
// -----------------------------------------------------------------------------
export async function listLevels(schoolId: string): Promise<Level[]> {
  const { data, error } = await supabase
    .from('levels')
    .select('*')
    .eq('school_id', schoolId)
    .order('order_index')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function listPrograms(schoolId: string): Promise<Program[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .eq('school_id', schoolId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function listSubjects(schoolId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('school_id', schoolId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function listRooms(schoolId: string): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('school_id', schoolId)
    .order('name')
  if (error) throw error
  return data ?? []
}

type Referential = 'levels' | 'programs' | 'subjects' | 'rooms'

/**
 * Création ou mise à jour d'un référentiel.
 *
 * Le `switch` n'est pas décoratif : sur une table générique, PostgREST ne peut
 * pas prouver que la colonne `id` existe et `.eq('id', …)` cesse de typer.
 * Chaque branche fixe la table, ce qui rend le contrôle de types complet.
 */
export async function upsertReferential(
  table: Referential,
  row: Record<string, unknown>,
): Promise<void> {
  const { id, ...values } = row
  const rowId = id as string | undefined

  const result = await (() => {
    switch (table) {
      case 'levels':
        return rowId
          ? supabase.from('levels').update(values as never).eq('id', rowId)
          : supabase.from('levels').insert(values as never)
      case 'programs':
        return rowId
          ? supabase.from('programs').update(values as never).eq('id', rowId)
          : supabase.from('programs').insert(values as never)
      case 'subjects':
        return rowId
          ? supabase.from('subjects').update(values as never).eq('id', rowId)
          : supabase.from('subjects').insert(values as never)
      case 'rooms':
        return rowId
          ? supabase.from('rooms').update(values as never).eq('id', rowId)
          : supabase.from('rooms').insert(values as never)
    }
  })()

  if (result.error) throw result.error
}

export async function deleteReferential(table: Referential, id: string): Promise<void> {
  const result = await (() => {
    switch (table) {
      case 'levels':
        return supabase.from('levels').delete().eq('id', id)
      case 'programs':
        return supabase.from('programs').delete().eq('id', id)
      case 'subjects':
        return supabase.from('subjects').delete().eq('id', id)
      case 'rooms':
        return supabase.from('rooms').delete().eq('id', id)
    }
  })()

  if (result.error) throw result.error
}

// -----------------------------------------------------------------------------
// Modele de coefficients par niveau
// -----------------------------------------------------------------------------
export interface SubjectLevelRow extends SubjectLevel {
  subject: Pick<Subject, 'id' | 'name' | 'code'> | null
}

export async function listSubjectLevels(
  schoolId: string,
  levelId: string,
): Promise<SubjectLevelRow[]> {
  const { data, error } = await supabase
    .from('subject_levels')
    .select('*, subject:subjects(id, name, code)')
    .eq('school_id', schoolId)
    .eq('level_id', levelId)
  if (error) throw error
  return (data ?? []) as SubjectLevelRow[]
}

export async function upsertSubjectLevel(row: {
  school_id: string
  subject_id: string
  level_id: string
  default_coefficient: number
  default_credits?: number | null
  default_max_score: number
  default_weekly_hours?: number | null
}): Promise<void> {
  const { error } = await supabase
    .from('subject_levels')
    .upsert(row, { onConflict: 'subject_id,level_id' })
  if (error) throw error
}

export async function deleteSubjectLevel(subjectId: string, levelId: string): Promise<void> {
  const { error } = await supabase
    .from('subject_levels')
    .delete()
    .eq('subject_id', subjectId)
    .eq('level_id', levelId)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Classes
// -----------------------------------------------------------------------------
export async function listClasses(
  schoolId: string,
  academicYearId: string,
): Promise<ClassOverview[]> {
  const { data, error } = await supabase
    .from('class_overview')
    .select('*')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .order('level_order')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function getClass(classId: string): Promise<ClassOverview | null> {
  const { data, error } = await supabase
    .from('class_overview')
    .select('*')
    .eq('id', classId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createClass(row: {
  school_id: string
  academic_year_id: string
  level_id: string
  program_id?: string | null
  name: string
  code?: string | null
  capacity?: number | null
  main_teacher_id?: string | null
  default_room_id?: string | null
}): Promise<SchoolClass> {
  const { data, error } = await supabase.from('classes').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateClass(
  classId: string,
  patch: Partial<SchoolClass>,
): Promise<void> {
  const { error } = await supabase.from('classes').update(patch).eq('id', classId)
  if (error) throw error
}

export async function deleteClass(classId: string): Promise<void> {
  const { error } = await supabase.from('classes').delete().eq('id', classId)
  if (error) throw error
}

/** Duplique dans une classe les coefficients definis pour son niveau. */
export async function applySubjectTemplate(classId: string): Promise<number> {
  const { data, error } = await supabase.rpc('apply_subject_template', { p_class_id: classId })
  if (error) throw error
  return data ?? 0
}

// -----------------------------------------------------------------------------
// Matieres d'une classe
// -----------------------------------------------------------------------------
export interface ClassSubjectRow extends ClassSubject {
  subject: Pick<Subject, 'id' | 'name' | 'code' | 'color'> | null
  teacher: { id: string; full_name: string | null } | null
}

export async function listClassSubjects(classId: string): Promise<ClassSubjectRow[]> {
  const { data, error } = await supabase
    .from('class_subjects')
    .select('*, subject:subjects(id, name, code, color), teacher:teachers(id, full_name)')
    .eq('class_id', classId)
  if (error) throw error

  return ((data ?? []) as ClassSubjectRow[]).sort((a, b) =>
    (a.subject?.name ?? '').localeCompare(b.subject?.name ?? '', 'fr'),
  )
}

export async function upsertClassSubject(row: {
  id?: string
  school_id: string
  class_id: string
  subject_id: string
  teacher_id?: string | null
  coefficient: number
  credits?: number | null
  max_score: number
  weekly_hours?: number | null
  is_optional?: boolean
}): Promise<void> {
  const { id, ...values } = row
  const { error } = id
    ? await supabase.from('class_subjects').update(values).eq('id', id)
    : await supabase.from('class_subjects').insert(values)
  if (error) throw error
}

export async function deleteClassSubject(id: string): Promise<void> {
  const { error } = await supabase.from('class_subjects').delete().eq('id', id)
  if (error) throw error
}
