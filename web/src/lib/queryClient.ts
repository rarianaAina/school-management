import { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { describeSupabaseError } from './supabase'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Inutile de reessayer un refus de droits ou une absence de resultat.
        const code = (error as { code?: string })?.code
        if (code === '42501' || code === 'PGRST301' || code === 'PGRST116') return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        toast.error(describeSupabaseError(error))
      },
    },
  },
})

/**
 * Cles de cache normalisees.
 *
 * Toutes portent le school_id en second element : invalider l'ensemble des
 * donnees d'un etablissement (changement d'annee scolaire, bascule de tenant)
 * revient a un unique predicate sur queryKey[1].
 */
export const queryKeys = {
  session: ['session'] as const,
  profile: (userId: string) => ['profile', userId] as const,
  memberships: (userId: string) => ['memberships', userId] as const,

  school: (schoolId: string) => ['school', schoolId] as const,
  academicYears: (schoolId: string) => ['academic-years', schoolId] as const,
  terms: (schoolId: string, yearId?: string) => ['terms', schoolId, yearId ?? null] as const,
  calendar: (schoolId: string, yearId?: string) => ['calendar', schoolId, yearId ?? null] as const,

  members: (schoolId: string, filters?: unknown) => ['members', schoolId, filters ?? null] as const,
  teachers: (schoolId: string, filters?: unknown) => ['teachers', schoolId, filters ?? null] as const,
  teacher: (schoolId: string, teacherId: string) => ['teacher', schoolId, teacherId] as const,
} as const

/** Invalide tout le cache rattache a un etablissement. */
export function invalidateSchool(schoolId: string) {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[1] === schoolId,
  })
}
