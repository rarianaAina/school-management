import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryClient'
import type { Membership, Profile, School } from '@/types/domain'

export interface MembershipWithSchool extends Membership {
  school: School
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  memberships: MembershipWithSchool[]
  /** Session restaurée et profil chargé : l'application peut décider où router. */
  isReady: boolean
  isAuthenticated: boolean
  signOut: () => Promise<void>
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionResolved, setIsSessionResolved] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setIsSessionResolved(true)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setIsSessionResolved(true)
      // Un changement de compte ne doit jamais laisser traîner le cache du précédent.
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        queryClient.clear()
      }
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  const userId = session?.user.id

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(userId ?? 'anonymous'),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const membershipsQuery = useQuery({
    queryKey: queryKeys.memberships(userId ?? 'anonymous'),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, school:schools(*)')
        .eq('user_id', userId!)
        .eq('is_active', true)
      if (error) throw error
      // Un membership dont l'école a été supprimée ne doit pas casser l'app.
      return (data ?? []).filter((row): row is MembershipWithSchool => Boolean(row.school))
    },
  })

  const value = useMemo<AuthContextValue>(() => {
    const isReady =
      isSessionResolved &&
      (!userId || (!profileQuery.isPending && !membershipsQuery.isPending))

    return {
      session,
      user: session?.user ?? null,
      profile: profileQuery.data ?? null,
      memberships: membershipsQuery.data ?? [],
      isReady,
      isAuthenticated: Boolean(session),
      signOut: async () => {
        await supabase.auth.signOut()
        queryClient.clear()
      },
      reload: async () => {
        await Promise.all([profileQuery.refetch(), membershipsQuery.refetch()])
      },
    }
  }, [session, isSessionResolved, userId, profileQuery, membershipsQuery, queryClient])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>.')
  return context
}
