import { supabase } from '@/lib/supabase'
import type {
  AcademicYear,
  School,
  SchoolSettings,
  SchoolType,
  Term,
  TermKind,
} from '@/types/domain'

export interface CreateSchoolInput {
  name: string
  slug: string
  type: SchoolType
  currency: string
  timezone: string
}

export async function createSchool(input: CreateSchoolInput): Promise<School> {
  const { data, error } = await supabase.rpc('create_school', {
    p_name: input.name,
    p_slug: input.slug,
    p_type: input.type,
    p_currency: input.currency,
    p_timezone: input.timezone,
  })
  if (error) throw error
  return data as unknown as School
}

export async function updateSchool(schoolId: string, patch: Partial<School>): Promise<School> {
  const { data, error } = await supabase
    .from('schools')
    .update(patch)
    .eq('id', schoolId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSchoolSettings(
  schoolId: string,
  settings: SchoolSettings,
): Promise<School> {
  const { data, error } = await supabase
    .from('schools')
    .update({ settings: settings as unknown as never })
    .eq('id', schoolId)
    .select()
    .single()
  if (error) throw error
  return data
}

// -----------------------------------------------------------------------------
// Annees scolaires
// -----------------------------------------------------------------------------
export interface CreateAcademicYearInput {
  school_id: string
  name: string
  start_date: string
  end_date: string
  is_current: boolean
}

export async function createAcademicYear(input: CreateAcademicYearInput): Promise<AcademicYear> {
  // Une seule annee courante par etablissement (index unique partiel cote base) :
  // on libere la precedente avant d'inserer.
  if (input.is_current) {
    await supabase
      .from('academic_years')
      .update({ is_current: false })
      .eq('school_id', input.school_id)
      .eq('is_current', true)
  }

  const { data, error } = await supabase.from('academic_years').insert(input).select().single()
  if (error) throw error
  return data
}

export async function setCurrentAcademicYear(
  schoolId: string,
  yearId: string,
): Promise<void> {
  const { error: clearError } = await supabase
    .from('academic_years')
    .update({ is_current: false })
    .eq('school_id', schoolId)
    .eq('is_current', true)
  if (clearError) throw clearError

  const { error } = await supabase
    .from('academic_years')
    .update({ is_current: true })
    .eq('id', yearId)
  if (error) throw error
}

export async function deleteAcademicYear(yearId: string): Promise<void> {
  const { error } = await supabase.from('academic_years').delete().eq('id', yearId)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Periodes
// -----------------------------------------------------------------------------
const TERM_NAMES: Record<TermKind, (index: number) => string> = {
  trimester: (i) => (i === 0 ? '1er trimestre' : `${i + 1}e trimestre`),
  semester: (i) => `Semestre ${i + 1}`,
  quarter: (i) => `Quadrimestre ${i + 1}`,
  year: () => 'Année complète',
}

/**
 * Découpe une année scolaire en périodes de durée égale.
 * Les bornes restent strictement dans celles de l'année : le trigger
 * `terms_within_year` refuserait tout débordement.
 */
export function buildTermRanges(
  startDate: string,
  endDate: string,
  count: number,
  kind: TermKind,
): Array<{ name: string; sequence: number; start_date: string; end_date: string; kind: TermKind }> {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
  const span = Math.floor(totalDays / count)

  return Array.from({ length: count }, (_, index) => {
    const from = new Date(start.getTime() + index * span * 86_400_000)
    const to =
      index === count - 1
        ? end
        : new Date(start.getTime() + ((index + 1) * span - 1) * 86_400_000)

    return {
      name: TERM_NAMES[kind](index),
      sequence: index + 1,
      kind,
      start_date: from.toISOString().slice(0, 10),
      end_date: to.toISOString().slice(0, 10),
    }
  })
}

export async function createTerms(
  schoolId: string,
  academicYearId: string,
  ranges: ReturnType<typeof buildTermRanges>,
  currentSequence?: number,
): Promise<Term[]> {
  const rows = ranges.map((range) => ({
    ...range,
    school_id: schoolId,
    academic_year_id: academicYearId,
    is_current: currentSequence === range.sequence,
  }))

  const { data, error } = await supabase.from('terms').insert(rows).select()
  if (error) throw error
  return data ?? []
}

export async function setCurrentTerm(schoolId: string, termId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from('terms')
    .update({ is_current: false })
    .eq('school_id', schoolId)
    .eq('is_current', true)
  if (clearError) throw clearError

  const { error } = await supabase.from('terms').update({ is_current: true }).eq('id', termId)
  if (error) throw error
}

export async function setTermLocked(termId: string, isLocked: boolean): Promise<void> {
  const { error } = await supabase.from('terms').update({ is_locked: isLocked }).eq('id', termId)
  if (error) throw error
}

export async function deleteTerm(termId: string): Promise<void> {
  const { error } = await supabase.from('terms').delete().eq('id', termId)
  if (error) throw error
}
