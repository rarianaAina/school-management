import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Megaphone,
  Settings,
  Users,
  UserSquare,
} from 'lucide-react'
import type { Permission } from '@/lib/permissions'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Une seule de ces permissions suffit à afficher l'entrée. */
  permission?: Permission[]
  /** Module pas encore livré : entrée grisée. */
  soon?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAVIGATION: NavGroup[] = [
  {
    label: 'Pilotage',
    items: [
      {
        label: 'Tableau de bord',
        to: '/tableau-de-bord',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Scolarité',
    items: [
      {
        label: 'Élèves',
        to: '/eleves',
        icon: Users,
        permission: ['student:read', 'student:read_own'],
      },
      {
        label: 'Classes & matières',
        to: '/classes',
        icon: BookOpen,
        permission: ['academics:read'],
      },
      {
        label: 'Enseignants',
        to: '/enseignants',
        icon: UserSquare,
        permission: ['teacher:read'],
      },
      {
        label: 'Référentiels',
        to: '/referentiels',
        icon: Layers,
        permission: ['academics:write'],
      },
      {
        label: 'Emploi du temps',
        to: '/emploi-du-temps',
        icon: CalendarDays,
        permission: ['timetable:read'],
      },
    ],
  },
  {
    label: 'Évaluation',
    items: [
      {
        label: 'Notes',
        to: '/notes',
        icon: GraduationCap,
        permission: ['grade:read', 'grade:read_own'],
      },
      {
        label: 'Bulletins',
        to: '/bulletins',
        icon: FileText,
        permission: ['grade:read', 'grade:read_own'],
      },
      {
        label: 'Examens',
        to: '/examens',
        icon: FileSpreadsheet,
        permission: ['exam:read'],
        soon: true,
      },
      {
        label: 'Présences',
        to: '/presences',
        icon: ClipboardCheck,
        permission: ['attendance:read'],
        soon: true,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Finances',
        to: '/finances',
        icon: CreditCard,
        permission: ['finance:read', 'finance:read_own'],
        soon: true,
      },
      {
        label: 'Communication',
        to: '/communication',
        icon: Megaphone,
        permission: ['announcement:read'],
        soon: true,
      },
      {
        label: 'Paramètres',
        to: '/parametres',
        icon: Settings,
        permission: ['school:update', 'school:manage_years', 'school:manage_members'],
      },
    ],
  },
]
