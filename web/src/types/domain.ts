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

// -----------------------------------------------------------------------------
// Module 2 — structure academique, eleves, inscriptions
// -----------------------------------------------------------------------------
export type SchoolCycle = Enums<'school_cycle'>
export type RoomType = Enums<'room_type'>
export type StudentStatus = Enums<'student_status'>
export type EnrollmentStatus = Enums<'enrollment_status'>
export type GuardianRelationship = Enums<'guardian_relationship'>
export type ImportStatus = Enums<'import_status'>

export type Level = Tables<'levels'>
export type Program = Tables<'programs'>
export type Subject = Tables<'subjects'>
export type SubjectLevel = Tables<'subject_levels'>
export type Room = Tables<'rooms'>
export type SchoolClass = Tables<'classes'>
export type ClassSubject = Tables<'class_subjects'>
export type Student = Tables<'students'>
export type Guardian = Tables<'guardians'>
export type StudentGuardian = Tables<'student_guardians'>
export type Enrollment = Tables<'enrollments'>
export type StudentDocument = Tables<'student_documents'>
export type ImportJob = Tables<'import_jobs'>

export type StudentOverview = Tables<'student_overview'>
export type ClassOverview = Tables<'class_overview'>
export type TeacherDirectoryEntry = Tables<'teacher_directory'>

export type StudentInsert = TablesInsert<'students'>
export type StudentUpdate = TablesUpdate<'students'>
export type ClassInsert = TablesInsert<'classes'>
export type ClassSubjectInsert = TablesInsert<'class_subjects'>
export type GuardianInsert = TablesInsert<'guardians'>

export const CYCLE_LABELS: Record<SchoolCycle, string> = {
  preschool: 'Maternelle',
  primary: 'Primaire',
  middle: 'Collège',
  high: 'Lycée',
  higher: 'Supérieur',
}

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  classroom: 'Salle de classe',
  lab: 'Laboratoire',
  amphitheater: 'Amphithéâtre',
  workshop: 'Atelier',
  gym: 'Gymnase',
  library: 'Bibliothèque',
  other: 'Autre',
}

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  enrolled: 'Inscrit',
  graduated: 'Diplômé',
  transferred: 'Transféré',
  withdrawn: 'Radié',
  suspended: 'Suspendu',
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'En cours',
  transferred: 'Transféré',
  withdrawn: 'Retiré',
  repeating: 'Redoublant',
  completed: 'Terminé',
}

export const RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  father: 'Père',
  mother: 'Mère',
  stepparent: 'Beau-parent',
  grandparent: 'Grand-parent',
  sibling: 'Frère / sœur',
  tutor: 'Tuteur légal',
  other: 'Autre',
}

export const GENDER_LABELS: Record<string, string> = {
  male: 'Masculin',
  female: 'Féminin',
  other: 'Autre',
}

// -----------------------------------------------------------------------------
// Module 3 — emplois du temps
// -----------------------------------------------------------------------------
export type LessonStatus = Enums<'lesson_status'>
export type TimetableSlot = Tables<'timetable_slots'>
export type TimetableEntry = Tables<'timetable_view'>
export type Lesson = Tables<'lessons'>
export type TeacherWorkload = Tables<'teacher_workload'>

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  planned: 'Prévue',
  held: 'Assurée',
  cancelled: 'Annulée',
  replaced: 'Remplacée',
}
