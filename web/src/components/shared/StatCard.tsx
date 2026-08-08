import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type StatTone = 'default' | 'success' | 'warning' | 'destructive'

const TONE_CLASS: Record<StatTone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
}

interface StatCardProps {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  tone?: StatTone
  /** Variation en points de pourcentage par rapport à la période précédente. */
  trend?: number | null
  isLoading?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  trend,
  isLoading = false,
  className,
}: StatCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="flex items-start gap-4 p-5">
        {Icon ? (
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', TONE_CLASS[tone])}>
            <Icon className="size-5" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm text-muted-foreground">{label}</p>

          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {trend !== null && trend !== undefined && !isLoading ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-medium',
                  trend >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {trend >= 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {trend >= 0 ? '+' : ''}
                {trend.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt
              </span>
            ) : null}
            {hint ? <span className="text-muted-foreground">{hint}</span> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
