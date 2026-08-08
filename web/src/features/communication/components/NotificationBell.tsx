import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatRelative } from '@/lib/formatters'
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from '@/types/domain'
import { cn } from '@/lib/utils'
import { listNotifications, markNotificationsRead } from '../api/communication.api'

export function NotificationBell() {
  const { user } = useAuth()

  const notificationsQuery = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: Boolean(user),
    queryFn: () => listNotifications(),
    staleTime: 60_000,
  })

  // Realtime : la table notifications est publiée, on s'abonne aux insertions
  // qui nous concernent plutôt que d'interroger le serveur en boucle.
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  const readMutation = useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })

  const notifications = notificationsQuery.data ?? []
  const unread = notifications.filter((item) => !item.is_read).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => readMutation.mutate(undefined)}
            >
              <CheckCheck className="size-3.5" />
              Tout lire
            </Button>
          ) : null}
        </div>

        <ScrollArea className="max-h-96">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucune notification.
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => !item.is_read && readMutation.mutate([item.id])}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-accent/50',
                      !item.is_read && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!item.is_read ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                      ) : (
                        <span className="mt-1.5 size-2 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                            {NOTIFICATION_TYPE_LABELS[item.type as NotificationType]}
                          </Badge>
                        </div>
                        {item.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {item.body}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatRelative(item.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
