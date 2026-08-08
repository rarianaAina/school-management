import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSchool } from '@/features/schools/SchoolProvider'
import { ROLE_HOME, type Permission } from '@/lib/permissions'
import { ForbiddenPage } from '@/app/pages/ForbiddenPage'

function FullPageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Loader2 className="size-7 animate-spin text-muted-foreground" />
    </div>
  )
}

/** Session requise. Mémorise la destination pour y revenir après connexion. */
export function RequireAuth() {
  const { isReady, isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isReady) return <FullPageLoader />

  if (!isAuthenticated) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/** Un établissement actif est requis : sinon, onboarding. */
export function RequireSchool() {
  const { schoolId, isLoading } = useSchool()

  if (isLoading && !schoolId) return <FullPageLoader />

  if (!schoolId) return <Navigate to="/bienvenue" replace />

  return <Outlet />
}

/** L'inverse : réservé aux utilisateurs sans établissement (page d'onboarding). */
export function RequireNoSchool({ children }: { children: ReactNode }) {
  const { schoolId, isLoading } = useSchool()

  if (isLoading) return <FullPageLoader />
  if (schoolId) return <Navigate to="/" replace />

  return <>{children}</>
}

/** Déjà connecté : pas de raison de revoir l'écran de connexion. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { isReady, isAuthenticated } = useAuth()

  if (!isReady) return <FullPageLoader />
  if (isAuthenticated) return <Navigate to="/" replace />

  return <>{children}</>
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission | Permission[]
  children: ReactNode
}) {
  const { can } = useSchool()
  const required = Array.isArray(permission) ? permission : [permission]

  if (!required.some(can)) return <ForbiddenPage />

  return <>{children}</>
}

/** Point d'entrée `/` : envoie chaque rôle vers son tableau de bord. */
export function RoleHomeRedirect() {
  const { role } = useSchool()
  return <Navigate to={role ? ROLE_HOME[role] : '/tableau-de-bord'} replace />
}
