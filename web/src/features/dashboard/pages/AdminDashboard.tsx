import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarCheck,
  CreditCard,
  GraduationCap,
  TrendingUp,
  Users,
  UserSquare,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { useSchool } from '@/features/schools/SchoolProvider'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import { SCHOOL_TYPE_LABELS } from '@/types/domain'
import {
  getAdminSnapshot,
  getAttendanceByClass,
  getEnrollmentByLevel,
  getGradeDistribution,
  getRevenueSeries,
} from '../api/dashboard.api'
import {
  AttendanceChart,
  EnrollmentChart,
  GradeDistributionChart,
  RevenueChart,
} from '../components/charts'

export function AdminDashboard() {
  const { schoolId, school, selectedYearId, settings, currentYear } = useSchool()
  const { profile } = useAuth()
  const currency = school?.currency ?? 'EUR'

  const enabled = Boolean(schoolId && selectedYearId)

  const snapshotQuery = useQuery({
    queryKey: ['dashboard-admin', schoolId, selectedYearId],
    enabled,
    queryFn: () => getAdminSnapshot(schoolId!, selectedYearId!, settings.grading.passing_score),
  })

  const enrollmentQuery = useQuery({
    queryKey: ['dashboard-enrollment', schoolId, selectedYearId],
    enabled,
    queryFn: () => getEnrollmentByLevel(schoolId!, selectedYearId!),
  })

  const revenueQuery = useQuery({
    queryKey: ['dashboard-revenue', schoolId],
    enabled,
    queryFn: () => getRevenueSeries(schoolId!),
  })

  const gradesQuery = useQuery({
    queryKey: ['dashboard-grades', schoolId, settings.grading.scale],
    enabled,
    queryFn: () => getGradeDistribution(schoolId!, settings.grading.scale),
  })

  const attendanceQuery = useQuery({
    queryKey: ['dashboard-attendance', schoolId],
    enabled,
    queryFn: () => getAttendanceByClass(schoolId!),
  })

  const snapshot = snapshotQuery.data

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
          label="Élèves inscrits"
          value={snapshot?.students ?? 0}
          icon={Users}
          isLoading={snapshotQuery.isPending}
          hint={
            snapshot?.fillRate !== null && snapshot?.fillRate !== undefined
              ? `${formatNumber(snapshot.fillRate, 1)} % de remplissage`
              : undefined
          }
        />
        <StatCard
          label="Enseignants"
          value={snapshot?.teachers ?? 0}
          icon={UserSquare}
          isLoading={snapshotQuery.isPending}
          hint={`${snapshot?.classes ?? 0} classes`}
        />
        <StatCard
          label="Taux de réussite"
          value={
            snapshot?.passRate !== null && snapshot?.passRate !== undefined
              ? `${formatNumber(snapshot.passRate, 1)} %`
              : '—'
          }
          icon={GraduationCap}
          isLoading={snapshotQuery.isPending}
          tone={
            snapshot?.passRate !== null && snapshot?.passRate !== undefined && snapshot.passRate < 50
              ? 'warning'
              : 'success'
          }
          hint={`Seuil ${settings.grading.passing_score}`}
        />
        <StatCard
          label="Assiduité"
          value={
            snapshot?.attendanceRate !== null && snapshot?.attendanceRate !== undefined
              ? `${formatNumber(snapshot.attendanceRate, 1)} %`
              : '—'
          }
          icon={CalendarCheck}
          isLoading={snapshotQuery.isPending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Facturé"
          value={formatCurrency(snapshot?.invoiced ?? 0, currency)}
          icon={BookOpen}
          isLoading={snapshotQuery.isPending}
        />
        <StatCard
          label="Encaissé"
          value={formatCurrency(snapshot?.collected ?? 0, currency)}
          icon={TrendingUp}
          isLoading={snapshotQuery.isPending}
          hint={
            snapshot && snapshot.invoiced > 0
              ? `${formatNumber((snapshot.collected / snapshot.invoiced) * 100, 1)} % recouvré`
              : undefined
          }
        />
        <StatCard
          label="Impayés"
          value={formatCurrency(snapshot?.outstanding ?? 0, currency)}
          icon={CreditCard}
          isLoading={snapshotQuery.isPending}
          tone={(snapshot?.outstanding ?? 0) > 0 ? 'warning' : 'success'}
          hint={
            snapshot?.overdueStudents
              ? `${snapshot.overdueStudents} élève(s) concerné(s)`
              : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EnrollmentChart data={enrollmentQuery.data ?? []} />
        <RevenueChart data={revenueQuery.data ?? []} currency={currency} />
        <GradeDistributionChart
          data={gradesQuery.data ?? []}
          passingScore={settings.grading.passing_score}
          scale={settings.grading.scale}
        />
        <AttendanceChart data={attendanceQuery.data ?? []} />
      </div>
    </div>
  )
}
