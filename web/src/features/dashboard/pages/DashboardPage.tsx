import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarRange, CheckCircle2, Circle, UserSquare, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { useSchool } from '@/features/schools/SchoolProvider'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/formatters'
import { SCHOOL_TYPE_LABELS } from '@/types/domain'
import { cn } from '@/lib/utils'
import { AdminDashboard } from './AdminDashboard'

interface SetupStep {
  label: string
  description: string
  done: boolean
  to?: string
  cta?: string
}

/**
 * Aiguillage par rôle : l'administration reçoit le pilotage complet ; les
 * autres rôles gardent la vue de mise en route tant que leur espace dédié
 * n'est pas livré.
 */
export function DashboardPage() {
  const { role } = useSchool()
  if (role === 'super_admin' || role === 'school_admin' || role === 'accountant') {
    return <AdminDashboard />
  }
  return <SetupDashboard />
}

function SetupDashboard() {
  const { school, schoolId, settings, currentYear, currentTerm, terms, can } = useSchool()
  const { profile } = useAuth()

  const countsQuery = useQuery({
    queryKey: ['dashboard-counts', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const [members, teachers] = await Promise.all([
        supabase
          .from('memberships')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId!)
          .eq('is_active', true),
        supabase
          .from('teachers')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId!)
          .is('deleted_at', null),
      ])

      if (members.error) throw members.error
      if (teachers.error) throw teachers.error

      return { members: members.count ?? 0, teachers: teachers.count ?? 0 }
    },
  })

  const steps: SetupStep[] = [
    {
      label: 'Établissement paramétré',
      description: 'Identité, devise et mode de notation.',
      done: Boolean(school?.email || school?.city),
      to: '/parametres',
      cta: 'Compléter',
    },
    {
      label: 'Année scolaire et périodes',
      description: 'Au moins une année en cours et ses périodes.',
      done: Boolean(currentYear && terms.length > 0),
      to: '/parametres/annees',
      cta: 'Configurer',
    },
    {
      label: 'Équipe invitée',
      description: 'Vie scolaire, enseignants et comptabilité.',
      done: (countsQuery.data?.members ?? 0) > 1,
      to: '/parametres/membres',
      cta: 'Inviter',
    },
    {
      label: 'Classes et matières',
      description: 'Niveaux, filières, classes et coefficients.',
      done: false,
    },
    {
      label: 'Élèves inscrits',
      description: 'Fiches élèves et inscriptions de l’année.',
      done: false,
    },
  ]

  const remaining = steps.filter((step) => !step.done).length

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bonjour${profile?.first_name ? ` ${profile.first_name}` : ''}`}
        description={
          school
            ? `${school.name} — ${SCHOOL_TYPE_LABELS[school.type]}${
                currentYear ? ` · année ${currentYear.name}` : ''
              }`
            : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Membres actifs"
          value={countsQuery.data?.members ?? 0}
          icon={Users}
          isLoading={countsQuery.isPending}
          hint="Comptes ayant accès"
        />
        <StatCard
          label="Enseignants"
          value={countsQuery.data?.teachers ?? 0}
          icon={UserSquare}
          isLoading={countsQuery.isPending}
        />
        <StatCard
          label="Période en cours"
          value={currentTerm?.name ?? '—'}
          icon={CalendarRange}
          hint={
            currentTerm
              ? `${formatDate(currentTerm.start_date)} → ${formatDate(currentTerm.end_date)}`
              : 'Aucune période définie'
          }
          tone={currentTerm ? 'default' : 'warning'}
        />
        <StatCard
          label="Mode de notation"
          value={settings.grading.mode === 'ects' ? 'Crédits ECTS' : `Moyenne / ${settings.grading.scale}`}
          icon={CheckCircle2}
          hint={`Réussite à ${settings.grading.passing_score}`}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Mise en route</CardTitle>
              <CardDescription>
                {remaining === 0
                  ? 'Configuration terminée.'
                  : `${remaining} étape${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} avant la rentrée.`}
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {steps.length - remaining} / {steps.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="divide-y">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground/50" />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', step.done && 'text-muted-foreground')}>
                  {step.label}
                </p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
              {!step.done && step.to && can('school:update') ? (
                <Button asChild variant="ghost" size="sm">
                  <Link to={step.to}>
                    {step.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : !step.done && !step.to ? (
                <Badge variant="outline" className="shrink-0 font-normal">
                  module à venir
                </Badge>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
