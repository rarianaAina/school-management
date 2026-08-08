import type { ReactNode } from 'react'
import { useSchool } from '@/features/schools/SchoolProvider'
import type { Permission } from '@/lib/permissions'
import type { UserRole } from '@/types/domain'

interface RoleGateProps {
  /** Au moins une de ces permissions suffit. */
  permission?: Permission | Permission[]
  /** Restriction directe par rôle, quand la permission n'est pas assez fine. */
  roles?: UserRole[]
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Masque l'interface selon le rôle courant.
 *
 * Confort d'affichage uniquement : la RLS reste la barrière réelle. Un
 * utilisateur qui contournerait ce composant se heurterait à Postgres.
 */
export function RoleGate({ permission, roles, fallback = null, children }: RoleGateProps) {
  const { can, role } = useSchool()

  if (roles && (!role || !roles.includes(role))) return <>{fallback}</>

  if (permission) {
    const required = Array.isArray(permission) ? permission : [permission]
    if (!required.some(can)) return <>{fallback}</>
  }

  return <>{children}</>
}
