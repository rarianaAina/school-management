import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthLayout } from '@/app/layouts/AuthLayout'
import { AppShell } from '@/app/layouts/AppShell'
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireNoSchool,
  RequirePermission,
  RequireSchool,
  RoleHomeRedirect,
} from '@/app/guards'
import { NotFoundPage } from '@/app/pages/NotFoundPage'

// Chargement paresseux : chaque module part dans son propre lot. Un parent qui
// consulte les notes de son enfant ne télécharge pas les écrans de gestion.
const LoginPage = lazy(() =>
  import('@/features/auth/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/pages/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
)
const SetPasswordPage = lazy(() =>
  import('@/features/auth/pages/SetPasswordPage').then((m) => ({ default: m.SetPasswordPage })),
)
const OnboardingPage = lazy(() =>
  import('@/features/schools/pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
)
const SettingsLayout = lazy(() =>
  import('@/features/schools/pages/SettingsLayout').then((m) => ({ default: m.SettingsLayout })),
)
const SchoolSettingsPage = lazy(() =>
  import('@/features/schools/pages/SchoolSettingsPage').then((m) => ({
    default: m.SchoolSettingsPage,
  })),
)
const AcademicYearsPage = lazy(() =>
  import('@/features/schools/pages/AcademicYearsPage').then((m) => ({
    default: m.AcademicYearsPage,
  })),
)
const MembersPage = lazy(() =>
  import('@/features/schools/pages/MembersPage').then((m) => ({ default: m.MembersPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const StudentsPage = lazy(() =>
  import('@/features/students/pages/StudentsPage').then((m) => ({ default: m.StudentsPage })),
)
const StudentDetailPage = lazy(() =>
  import('@/features/students/pages/StudentDetailPage').then((m) => ({
    default: m.StudentDetailPage,
  })),
)
const ClassesPage = lazy(() =>
  import('@/features/academics/pages/ClassesPage').then((m) => ({ default: m.ClassesPage })),
)
const ClassDetailPage = lazy(() =>
  import('@/features/academics/pages/ClassDetailPage').then((m) => ({
    default: m.ClassDetailPage,
  })),
)
const ReferentialsPage = lazy(() =>
  import('@/features/academics/pages/ReferentialsPage').then((m) => ({
    default: m.ReferentialsPage,
  })),
)
const TeachersPage = lazy(() =>
  import('@/features/staff/pages/TeachersPage').then((m) => ({ default: m.TeachersPage })),
)

function RouteFallback() {
  return (
    <div className="grid min-h-64 place-items-center py-16">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public */}
        <Route element={<AuthLayout />}>
          <Route
            path="/connexion"
            element={
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/mot-de-passe-oublie"
            element={
              <RedirectIfAuthenticated>
                <ForgotPasswordPage />
              </RedirectIfAuthenticated>
            }
          />
          {/* Accessible connecté : la session est ouverte par le lien e-mail. */}
          <Route path="/definir-mot-de-passe" element={<SetPasswordPage />} />
        </Route>

        {/* Authentifié */}
        <Route element={<RequireAuth />}>
          <Route
            path="/bienvenue"
            element={
              <RequireNoSchool>
                <OnboardingPage />
              </RequireNoSchool>
            }
          />

          {/* Authentifié + établissement actif */}
          <Route element={<RequireSchool />}>
            <Route element={<AppShell />}>
              <Route index element={<RoleHomeRedirect />} />
              <Route path="/tableau-de-bord" element={<DashboardPage />} />
              {/* Tant que les espaces dédiés ne sont pas livrés, les rôles
                  enseignant / élève / parent / comptable partagent le tableau de bord. */}
              <Route path="/enseignant" element={<DashboardPage />} />
              <Route path="/mon-espace" element={<DashboardPage />} />
              <Route path="/finances" element={<DashboardPage />} />

              <Route
                path="/eleves"
                element={
                  <RequirePermission permission={['student:read', 'student:read_own']}>
                    <StudentsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/eleves/:studentId"
                element={
                  <RequirePermission permission={['student:read', 'student:read_own']}>
                    <StudentDetailPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/classes"
                element={
                  <RequirePermission permission="academics:read">
                    <ClassesPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/classes/:classId"
                element={
                  <RequirePermission permission="academics:read">
                    <ClassDetailPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/referentiels"
                element={
                  <RequirePermission permission="academics:write">
                    <ReferentialsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/enseignants"
                element={
                  <RequirePermission permission="teacher:read">
                    <TeachersPage />
                  </RequirePermission>
                }
              />

              <Route
                path="/parametres"
                element={
                  <RequirePermission
                    permission={['school:update', 'school:manage_years', 'school:manage_members']}
                  >
                    <SettingsLayout />
                  </RequirePermission>
                }
              >
                <Route index element={<SchoolSettingsPage />} />
                <Route path="annees" element={<AcademicYearsPage />} />
                <Route path="membres" element={<MembersPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
