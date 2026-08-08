import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'
import { useSchool } from '@/features/schools/SchoolProvider'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/parametres', label: 'Établissement', end: true },
  { to: '/parametres/annees', label: 'Années & périodes', end: false },
  { to: '/parametres/membres', label: 'Membres & rôles', end: false },
]

export function SettingsLayout() {
  const { school } = useSchool()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        description={school?.name}
        breadcrumbs={[{ label: 'Accueil', to: '/' }, { label: 'Paramètres' }]}
      />

      <div className="border-b">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  )
}
