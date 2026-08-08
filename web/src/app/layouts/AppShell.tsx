import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, User as UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SchoolSwitcher } from '@/components/shared/SchoolSwitcher'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSchool } from '@/features/schools/SchoolProvider'
import { NotificationBell } from '@/features/communication/components/NotificationBell'
import { NAVIGATION } from '@/app/navigation'
import { initials } from '@/lib/formatters'
import { cn } from '@/lib/utils'

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useSchool()

  return (
    <nav className="flex flex-col gap-6 p-3">
      {NAVIGATION.map((group) => {
        const items = group.items.filter(
          (item) => !item.permission || item.permission.some(can),
        )
        if (items.length === 0) return null

        return (
          <div key={group.label} className="space-y-1">
            <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )
                }
              >
                <item.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.soon ? (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                    bientôt
                  </Badge>
                ) : null}
              </NavLink>
            ))}
          </div>
        )
      })}
    </nav>
  )
}

function YearSelector() {
  const { academicYears, selectedYearId, selectYear } = useSchool()

  if (academicYears.length === 0) return null

  return (
    <Select value={selectedYearId ?? undefined} onValueChange={selectYear}>
      <SelectTrigger size="sm" className="w-[150px]">
        <SelectValue placeholder="Année scolaire" />
      </SelectTrigger>
      <SelectContent>
        {academicYears.map((year) => (
          <SelectItem key={year.id} value={year.id}>
            {year.name}
            {year.is_current ? ' · en cours' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function AppShell() {
  const { profile, user, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const displayName = profile?.full_name ?? user?.email ?? 'Utilisateur'

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Barre latérale — masquée sous lg, remplacée par un Sheet */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="border-b p-2">
          <SchoolSwitcher />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="border-b p-2">
                <SchoolSwitcher />
              </div>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="ml-auto flex items-center gap-2">
            <YearSelector />
            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Mon compte">
                  <Avatar className="size-8">
                    <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="text-xs">
                      {initials(profile?.first_name, profile?.last_name) || <UserIcon className="size-4" />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate font-medium">{displayName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()} className="text-destructive">
                  <LogOut className="size-4" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main key={location.pathname} className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
