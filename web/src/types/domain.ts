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

// -----------------------------------------------------------------------------
// Module 4 — notes et bulletins
// -----------------------------------------------------------------------------
export type StudyUnitKind = Enums<'study_unit_kind'>
export type ValidationMode = Enums<'validation_mode'>

export type AssessmentType = Tables<'assessment_types'>
export type Assessment = Tables<'assessments'>
export type Grade = Tables<'grades'>
export type StudyUnit = Tables<'study_units'>
export type SubjectAverage = Tables<'subject_averages'>
export type TermAverage = Tables<'term_averages'>
export type UnitAverage = Tables<'unit_averages'>
export type TermSubjectResult = Tables<'term_subject_results'>
export type TermUnitResult = Tables<'term_unit_results'>
export type TermResult = Tables<'term_results'>

export const VALIDATION_MODE_LABELS: Record<ValidationMode, string> = {
  direct: 'Validation directe',
  compensation: 'Par compensation',
  resit: 'Après rattrapage',
}

/** Mention française usuelle, calculée sur le barème de l'établissement. */
export function mentionFor(average: number | null, scale = 20): string | null {
  if (average === null) return null
  const ratio = (average / scale) * 20
  if (ratio >= 16) return 'Très bien'
  if (ratio >= 14) return 'Bien'
  if (ratio >= 12) return 'Assez bien'
  if (ratio >= 10) return 'Passable'
  return null
}

// -----------------------------------------------------------------------------
// Module 5 — examens
// -----------------------------------------------------------------------------
export type ExamSessionType = Enums<'exam_session_type'>
export type ExamSessionStatus = Enums<'exam_session_status'>
export type ExamDecision = Enums<'exam_decision'>
export type RegistrationStatus = Enums<'registration_status'>
export type SupervisorRole = Enums<'supervisor_role'>

export type ExamSession = Tables<'exam_sessions'>
export type ExamSessionOverview = Tables<'exam_session_overview'>
export type Exam = Tables<'exams'>
export type ExamRegistration = Tables<'exam_registrations'>
export type ExamResult = Tables<'exam_results'>
export type Deliberation = Tables<'deliberations'>
export type Transcript = Tables<'transcripts'>

export const EXAM_SESSION_TYPE_LABELS: Record<ExamSessionType, string> = {
  regular: 'Session normale',
  resit: 'Session de rattrapage',
  entrance: "Concours d'entrée",
  final: 'Examen final',
  mock: 'Examen blanc',
}

export const EXAM_SESSION_STATUS_LABELS: Record<ExamSessionStatus, string> = {
  draft: 'Brouillon',
  scheduled: 'Planifiée',
  ongoing: 'En cours',
  graded: 'Corrigée',
  deliberated: 'Délibérée',
  closed: 'Clôturée',
}

export const EXAM_DECISION_LABELS: Record<ExamDecision, string> = {
  admitted: 'Admis',
  failed: 'Ajourné',
  resit: 'Rattrapage',
  deferred: 'Reporté',
  excluded: 'Exclu',
}

export const SUPERVISOR_ROLE_LABELS: Record<SupervisorRole, string> = {
  invigilator: 'Surveillant',
  chief: 'Responsable de salle',
  floater: 'Surveillant volant',
}

// -----------------------------------------------------------------------------
// Module 6 — finances
// -----------------------------------------------------------------------------
export type FeeStatus = Enums<'fee_status'>
export type InvoiceStatus = Enums<'invoice_status'>
export type PaymentMethod = Enums<'payment_method'>
export type PaymentStatus = Enums<'payment_status'>
export type DiscountKind = Enums<'discount_kind'>

export type FeeCategory = Tables<'fee_categories'>
export type FeeStructure = Tables<'fee_structures'>
export type Scholarship = Tables<'scholarships'>
export type StudentFee = Tables<'student_fees'>
export type Invoice = Tables<'invoices'>
export type InvoiceLine = Tables<'invoice_lines'>
export type Payment = Tables<'payments'>
export type StudentBalance = Tables<'student_balances'>
export type MonthlyRevenue = Tables<'monthly_revenue'>

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  partially_paid: 'Partiellement payée',
  paid: 'Soldée',
  overdue: 'En retard',
  cancelled: 'Annulée',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  bank_transfer: 'Virement',
  mobile_money: 'Mobile money',
  card: 'Carte bancaire',
  check: 'Chèque',
  other: 'Autre',
}

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  pending: 'À payer',
  partial: 'Partiel',
  paid: 'Soldé',
  waived: 'Exonéré',
  overdue: 'En retard',
}

// -----------------------------------------------------------------------------
// Modules 7 et 8 — présences, communication
// -----------------------------------------------------------------------------
export type AttendanceStatus = Enums<'attendance_status'>
export type JustificationStatus = Enums<'justification_status'>
export type AnnouncementAudience = Enums<'announcement_audience'>
export type NotificationType = Enums<'notification_type'>

export type AttendanceRecord = Tables<'attendance_records'>
export type AbsenceJustification = Tables<'absence_justifications'>
export type AttendanceStat = Tables<'attendance_stats'>
export type LessonAttendance = Tables<'lesson_attendance'>
export type Announcement = Tables<'announcements'>
export type AppNotification = Tables<'notifications'>

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent: 'Absent',
  late: 'Retard',
  excused: 'Absence justifiée',
  left_early: 'Parti avant la fin',
}

export const JUSTIFICATION_STATUS_LABELS: Record<JustificationStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
}

export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: "Tout l'établissement",
  role: 'Par rôle',
  level: 'Par niveau',
  class: 'Par classe',
  student: 'Élèves ciblés',
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  announcement: 'Annonce',
  grade_published: 'Notes publiées',
  report_card: 'Bulletin',
  invoice: 'Facture',
  payment_reminder: 'Relance de paiement',
  absence: 'Absence',
  exam_convocation: 'Convocation',
  message: 'Message',
  other: 'Information',
}
