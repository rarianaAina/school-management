import { Check, ChevronsUpDown, School as SchoolIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSchool } from '@/features/schools/SchoolProvider'
import { SCHOOL_TYPE_LABELS, ROLE_LABELS } from '@/types/domain'
import { cn } from '@/lib/utils'

export function SchoolSwitcher({ className }: { className?: string }) {
  const { school, availableSchools, switchSchool, role } = useSchool()

  if (!school) return null

  const isSingle = availableSchools.length <= 1

  const summary = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <SchoolIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{school.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {role ? ROLE_LABELS[role] : SCHOOL_TYPE_LABELS[school.type]}
        </span>
      </span>
    </span>
  )

  if (isSingle) {
    return <div className={cn('px-2 py-1.5', className)}>{summary}</div>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn('h-auto w-full justify-between px-2 py-1.5', className)}>
          {summary}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Établissements</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableSchools.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => switchSchool(item.id)}
            className="gap-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {SCHOOL_TYPE_LABELS[item.type]}
              </span>
            </span>
            {item.id === school.id ? <Check className="size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
