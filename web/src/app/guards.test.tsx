import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Les gardes ne doivent dépendre que de deux informations : la session est-elle
// résolue, et l'appartenance de l'utilisateur est-elle connue. On isole donc
// les providers pour piloter ces états directement.
const schoolState = vi.hoisted(() => ({
  value: { schoolId: null as string | null, isReady: false, isLoading: true },
}))

vi.mock('@/features/schools/SchoolProvider', () => ({
  useSchool: () => schoolState.value,
}))

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ isReady: true, isAuthenticated: true }),
}))

const { RequireNoSchool, RequireSchool } = await import('./guards')

// `globals` est desactive : le nettoyage automatique de Testing Library ne
// s'installe pas tout seul, sans quoi les rendus s'empilent d'un test a l'autre.
afterEach(cleanup)

function renderSchoolGuard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<RequireSchool />}>
          <Route path="/" element={<p>tableau de bord</p>} />
        </Route>
        <Route path="/bienvenue" element={<p>onboarding</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireSchool', () => {
  beforeEach(() => {
    schoolState.value = { schoolId: null, isReady: false, isLoading: true }
  })

  it("affiche le chargement tant que l'appartenance est inconnue", () => {
    renderSchoolGuard()
    expect(screen.queryByText('onboarding')).toBeNull()
    expect(screen.queryByText('tableau de bord')).toBeNull()
  })

  /**
   * Régression : `yearsQuery` est désactivée tant qu'aucun établissement n'est
   * actif, et une requête désactivée reste `isPending` indéfiniment. Le garde
   * s'appuyait dessus et bouclait sur le loader — un nouvel inscrit ne pouvait
   * jamais atteindre l'onboarding.
   */
  it("redirige vers l'onboarding quand l'utilisateur n'a aucun établissement", () => {
    schoolState.value = { schoolId: null, isReady: true, isLoading: true }
    renderSchoolGuard()
    expect(screen.getByText('onboarding')).toBeTruthy()
  })

  it("laisse passer quand un établissement est actif", () => {
    schoolState.value = { schoolId: 'school-1', isReady: true, isLoading: false }
    renderSchoolGuard()
    expect(screen.getByText('tableau de bord')).toBeTruthy()
  })
})

describe('RequireNoSchool', () => {
  function renderNoSchoolGuard() {
    return render(
      <MemoryRouter initialEntries={['/bienvenue']}>
        <Routes>
          <Route
            path="/bienvenue"
            element={
              <RequireNoSchool>
                <p>onboarding</p>
              </RequireNoSchool>
            }
          />
          <Route path="/" element={<p>tableau de bord</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it("affiche l'onboarding à un utilisateur sans établissement", () => {
    schoolState.value = { schoolId: null, isReady: true, isLoading: true }
    renderNoSchoolGuard()
    expect(screen.getByText('onboarding')).toBeTruthy()
  })

  it("renvoie vers l'accueil un utilisateur qui en a déjà un", () => {
    schoolState.value = { schoolId: 'school-1', isReady: true, isLoading: false }
    renderNoSchoolGuard()
    expect(screen.getByText('tableau de bord')).toBeTruthy()
  })
})
