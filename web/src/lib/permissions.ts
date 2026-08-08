import type { UserRole } from '@/types/domain'

/**
 * Miroir applicatif des policies RLS.
 *
 * Sert UNIQUEMENT a l'affichage : masquer un bouton, retirer une entree de menu.
 * L'autorite reste la base de donnees — toute action refusee ici l'est aussi
 * cote Postgres. Ne jamais considerer ce fichier comme une barriere de securite.
 */
export type Permission =
  // Etablissement
  | 'school:read'
  | 'school:update'
  | 'school:manage_years'
  | 'school:manage_members'
  // Personnes
  | 'student:read'
  | 'student:read_own'
  | 'student:write'
  | 'teacher:read'
  | 'teacher:write'
  // Structure academique
  | 'academics:read'
  | 'academics:write'
  // Emploi du temps
  | 'timetable:read'
  | 'timetable:write'
  // Notes
  | 'grade:read'
  | 'grade:read_own'
  | 'grade:write'
  | 'report_card:publish'
  // Examens
  | 'exam:read'
  | 'exam:write'
  | 'exam:grade'
  | 'exam:deliberate'
  // Finance
  | 'finance:read'
  | 'finance:read_own'
  | 'finance:write'
  // Presences
  | 'attendance:read'
  | 'attendance:write'
  // Communication
  | 'announcement:read'
  | 'announcement:write'

const ADMIN_PERMISSIONS: Permission[] = [
  'school:read',
  'school:update',
  'school:manage_years',
  'school:manage_members',
  'student:read',
  'student:write',
  'teacher:read',
  'teacher:write',
  'academics:read',
  'academics:write',
  'timetable:read',
  'timetable:write',
  'grade:read',
  'grade:write',
  'report_card:publish',
  'exam:read',
  'exam:write',
  'exam:grade',
  'exam:deliberate',
  'finance:read',
  'attendance:read',
  'attendance:write',
  'announcement:read',
  'announcement:write',
]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [...ADMIN_PERMISSIONS, 'finance:write'],

  school_admin: ADMIN_PERMISSIONS,

  teacher: [
    'school:read',
    'student:read',
    'teacher:read',
    'academics:read',
    'timetable:read',
    'grade:read',
    'grade:write',
    'exam:read',
    'exam:grade',
    'attendance:read',
    'attendance:write',
    'announcement:read',
    'announcement:write',
  ],

  student: [
    'school:read',
    'student:read_own',
    'teacher:read',
    'academics:read',
    'timetable:read',
    'grade:read_own',
    'exam:read',
    'finance:read_own',
    'announcement:read',
  ],

  parent: [
    'school:read',
    'student:read_own',
    'teacher:read',
    'academics:read',
    'timetable:read',
    'grade:read_own',
    'exam:read',
    'finance:read_own',
    'announcement:read',
  ],

  accountant: [
    'school:read',
    'student:read',
    'academics:read',
    'finance:read',
    'finance:write',
    'announcement:read',
  ],
}

export function permissionsForRole(role: UserRole | null | undefined): Set<Permission> {
  if (!role) return new Set()
  return new Set(ROLE_PERMISSIONS[role])
}

export function roleCan(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** Route d'atterrissage apres connexion, selon le role. */
export const ROLE_HOME: Record<UserRole, string> = {
  super_admin: '/tableau-de-bord',
  school_admin: '/tableau-de-bord',
  teacher: '/enseignant',
  student: '/mon-espace',
  parent: '/mon-espace',
  accountant: '/finances',
}
