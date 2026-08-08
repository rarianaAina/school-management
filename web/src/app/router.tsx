import { Navigate, Route, Routes } from 'react-router-dom'
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
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { SetPasswordPage } from '@/features/auth/pages/SetPasswordPage'
import { OnboardingPage } from '@/features/schools/pages/OnboardingPage'
import { SettingsLayout } from '@/features/schools/pages/SettingsLayout'
import { SchoolSettingsPage } from '@/features/schools/pages/SchoolSettingsPage'
import { AcademicYearsPage } from '@/features/schools/pages/AcademicYearsPage'
import { MembersPage } from '@/features/schools/pages/MembersPage'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'

export function AppRouter() {
  return (
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

            <Route path="/finances" element={<Navigate to="/tableau-de-bord" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
