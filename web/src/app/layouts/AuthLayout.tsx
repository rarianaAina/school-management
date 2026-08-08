import { Outlet } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'

export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Panneau de présentation — masqué sur mobile */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          <GraduationCap className="size-6" />
          Scolaria
        </div>

        <div className="space-y-4">
          <p className="max-w-md text-2xl font-medium leading-snug text-balance">
            La gestion de votre établissement, de l&apos;inscription au bulletin.
          </p>
          <p className="max-w-md text-sm text-primary-foreground/75 text-pretty">
            Élèves, emplois du temps, notes, examens et frais de scolarité — une seule
            plateforme, du primaire à l&apos;université.
          </p>
        </div>

        <p className="text-xs text-primary-foreground/60">
          Données isolées par établissement et protégées au niveau de la base.
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-2.5 text-lg font-semibold lg:hidden">
            <GraduationCap className="size-6 text-primary" />
            Scolaria
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
