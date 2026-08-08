import type { Tables, TablesInsert, TablesUpdate, Enums } from './database.types'

// -----------------------------------------------------------------------------
// Enumerations
// -----------------------------------------------------------------------------
export type UserRole = Enums<'user_role'>
export type SchoolType = Enums<'school_type'>
export type TermKind = Enums<'term_kind'>
export type CalendarEventType = Enums<'calendar_event_type'>
export type StaffStatus = Enums<'staff_status'>

// -----------------------------------------------------------------------------
// Entites
// -----------------------------------------------------------------------------
export type Profile = Tables<'profiles'>
export type School = Tables<'schools'>
export type Membership = Tables<'memberships'>
export type AcademicYear = Tables<'academic_years'>
export type Term = Tables<'terms'>
export type SchoolCalendarEntry = Tables<'school_calendar'>
export type Teacher = Tables<'teachers'>

export type SchoolInsert = TablesInsert<'schools'>
export type SchoolUpdate = TablesUpdate<'schools'>
export type AcademicYearInsert = TablesInsert<'academic_years'>
export type TermInsert = TablesInsert<'terms'>
export type TeacherInsert = TablesInsert<'teachers'>
export type TeacherUpdate = TablesUpdate<'teachers'>

// -----------------------------------------------------------------------------
// schools.settings — typage du jsonb de parametrage
// -----------------------------------------------------------------------------
export type GradingMode = 'weighted_average' | 'ects'

export interface GradingSettings {
  mode: GradingMode
  scale: number
  passing_score: number
  compensation: boolean
  compensation_floor: number
}

export interface SchoolVocabulary {
  class: string
  term: string
  subject: string
}

export interface SchoolSettings {
  grading: GradingSettings
  terms_per_year: number
  /** 1 = lundi ... 7 = dimanche */
  week_days: number[]
  day_start: string
  day_end: string
  matricule_prefix: string
  vocabulary: SchoolVocabulary
}

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  grading: {
    mode: 'weighted_average',
    scale: 20,
    passing_score: 10,
    compensation: false,
    compensation_floor: 7,
  },
  terms_per_year: 3,
  week_days: [1, 2, 3, 4, 5],
  day_start: '08:00',
  day_end: '18:00',
  matricule_prefix: '',
  vocabulary: { class: 'Classe', term: 'Trimestre', subject: 'Matière' },
}

/** Fusionne les settings stockés avec les valeurs par défaut (jsonb partiel toléré). */
export function parseSchoolSettings(raw: unknown): SchoolSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SCHOOL_SETTINGS
  const value = raw as Partial<SchoolSettings>
  return {
    ...DEFAULT_SCHOOL_SETTINGS,
    ...value,
    grading: { ...DEFAULT_SCHOOL_SETTINGS.grading, ...(value.grading ?? {}) },
    vocabulary: { ...DEFAULT_SCHOOL_SETTINGS.vocabulary, ...(value.vocabulary ?? {}) },
  }
}

// -----------------------------------------------------------------------------
// Libelles francais
// -----------------------------------------------------------------------------
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super administrateur',
  school_admin: "Administrateur d'établissement",
  teacher: 'Enseignant',
  student: 'Élève',
  parent: 'Parent',
  accountant: 'Comptable',
}

export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  preschool: 'École maternelle',
  primary: 'École primaire',
  middle_school: 'Collège',
  high_school: 'Lycée',
  vocational: 'Centre de formation',
  university: 'Université / Grande école',
  other: 'Autre',
}

export const TERM_KIND_LABELS: Record<TermKind, string> = {
  trimester: 'Trimestre',
  semester: 'Semestre',
  quarter: 'Quadrimestre',
  year: 'Année',
}

export const CALENDAR_EVENT_LABELS: Record<CalendarEventType, string> = {
  holiday: 'Vacances',
  exam_period: "Période d'examens",
  closure: 'Fermeture',
  event: 'Événement',
}

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  active: 'En poste',
  on_leave: 'En congé',
  suspended: 'Suspendu',
  left: 'Parti',
}

/** Établissements du supérieur : le mode ECTS y est proposé par défaut. */
export const HIGHER_EDUCATION_TYPES: SchoolType[] = ['university', 'vocational']
