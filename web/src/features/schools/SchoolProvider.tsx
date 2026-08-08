import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryClient'
import { useAuth } from '@/features/auth/AuthProvider'
import { permissionsForRole, type Permission } from '@/lib/permissions'
import {
  parseSchoolSettings,
  type AcademicYear,
  type School,
  type SchoolSettings,
  type Term,
  type UserRole,
} from '@/types/domain'

const STORAGE_KEY = 'ecole.active-school'

/** Rang de priorité quand l'utilisateur cumule plusieurs rôles dans un établissement. */
const ROLE_PRECEDENCE: UserRole[] = [
  'super_admin',
  'school_admin',
  'accountant',
  'teacher',
  'parent',
  'student',
]

interface SchoolContextValue {
  school: School | null
  schoolId: string | null
  settings: SchoolSettings
  role: UserRole | null
  permissions: Set<Permission>
  can: (permission: Permission) => boolean
  /** Établissements disponibles pour le sélecteur. */
  availableSchools: School[]
  switchSchool: (schoolId: string) => void
  academicYears: AcademicYear[]
  currentYear: AcademicYear | null
  selectedYearId: string | null
  selectYear: (yearId: string) => void
  terms: Term[]
  currentTerm: Term | null
  /**
   * L'appartenance de l'utilisateur est connue : on sait s'il a un
   * établissement ou non. C'est cet indicateur que doivent consulter les gardes
   * de route — jamais `isLoading`, qui suit le chargement des données de
   * l'établissement actif et n'a pas de sens quand il n'y en a aucun.
   */
  isReady: boolean
  isLoading: boolean
}

const SchoolContext = createContext<SchoolContextValue | null>(null)

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { memberships, isReady } = useAuth()

  const availableSchools = useMemo(
    () =>
      [...new Map(memberships.map((m) => [m.school.id, m.school])).values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'fr'),
      ),
    [memberships],
  )

  const [requestedSchoolId, setRequestedSchoolId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )

  // L'établissement mémorisé est revalidé contre les memberships réels :
  // un accès révoqué ne doit pas survivre dans le localStorage.
  const school = useMemo(() => {
    if (availableSchools.length === 0) return null
    return (
      availableSchools.find((s) => s.id === requestedSchoolId) ?? availableSchools[0] ?? null
    )
  }, [availableSchools, requestedSchoolId])

  const schoolId = school?.id ?? null

  useEffect(() => {
    if (schoolId) localStorage.setItem(STORAGE_KEY, schoolId)
  }, [schoolId])

  const role = useMemo<UserRole | null>(() => {
    if (!schoolId) return null
    const roles = memberships.filter((m) => m.school_id === schoolId).map((m) => m.role)
    return ROLE_PRECEDENCE.find((candidate) => roles.includes(candidate)) ?? null
  }, [memberships, schoolId])

  const permissions = useMemo(() => permissionsForRole(role), [role])

  const yearsQuery = useQuery({
    queryKey: queryKeys.academicYears(schoolId ?? 'none'),
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .eq('school_id', schoolId!)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const academicYears = useMemo(() => yearsQuery.data ?? [], [yearsQuery.data])
  const currentYear = useMemo(
    () => academicYears.find((y) => y.is_current) ?? academicYears[0] ?? null,
    [academicYears],
  )

  const [requestedYearId, setRequestedYearId] = useState<string | null>(null)
  const selectedYearId = useMemo(() => {
    if (requestedYearId && academicYears.some((y) => y.id === requestedYearId)) {
      return requestedYearId
    }
    return currentYear?.id ?? null
  }, [requestedYearId, academicYears, currentYear])

  const termsQuery = useQuery({
    queryKey: queryKeys.terms(schoolId ?? 'none', selectedYearId ?? undefined),
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('academic_year_id', selectedYearId!)
        .order('sequence')
      if (error) throw error
      return data ?? []
    },
  })

  const terms = useMemo(() => termsQuery.data ?? [], [termsQuery.data])
  const currentTerm = useMemo(() => terms.find((t) => t.is_current) ?? terms[0] ?? null, [terms])

  const switchSchool = useCallback((nextId: string) => {
    setRequestedSchoolId(nextId)
    setRequestedYearId(null)
  }, [])

  const value = useMemo<SchoolContextValue>(
    () => ({
      school,
      schoolId,
      settings: parseSchoolSettings(school?.settings),
      role,
      permissions,
      can: (permission: Permission) => permissions.has(permission),
      availableSchools,
      switchSchool,
      academicYears,
      currentYear,
      selectedYearId,
      selectYear: setRequestedYearId,
      terms,
      currentTerm,
      isReady,
      // `isPending` reste vrai indéfiniment sur une requête désactivée : sans
      // établissement, yearsQuery ne part jamais. On s'appuie donc sur
      // `isLoading` (= isPending && isFetching), faux tant que la requête dort.
      isLoading: !isReady || yearsQuery.isLoading,
    }),
    [
      school,
      schoolId,
      role,
      permissions,
      availableSchools,
      switchSchool,
      academicYears,
      currentYear,
      selectedYearId,
      terms,
      currentTerm,
      isReady,
      yearsQuery.isLoading,
    ],
  )

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>
}

export function useSchool(): SchoolContextValue {
  const context = useContext(SchoolContext)
  if (!context) throw new Error('useSchool doit être utilisé à l’intérieur de <SchoolProvider>.')
  return context
}

/**
 * Variante pour les écrans qui ne peuvent pas fonctionner sans établissement actif :
 * évite un `schoolId!` dans chaque hook de données.
 */
export function useActiveSchool(): SchoolContextValue & { schoolId: string; school: School } {
  const context = useSchool()
  if (!context.schoolId || !context.school) {
    throw new Error('Aucun établissement actif : écran monté hors du périmètre attendu.')
  }
  return context as SchoolContextValue & { schoolId: string; school: School }
}
