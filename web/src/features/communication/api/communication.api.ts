import { supabase } from '@/lib/supabase'
import type { Announcement, AppNotification } from '@/types/domain'

export interface AnnouncementRow extends Announcement {
  author: { full_name: string | null } | null
}

export async function listAnnouncements(schoolId: string): Promise<AnnouncementRow[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*, author:profiles(full_name)')
    .eq('school_id', schoolId)
    .order('is_pinned', { ascending: false })
    .order('publish_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AnnouncementRow[]
}

export async function createAnnouncement(row: {
  school_id: string
  author_id: string
  title: string
  body: string
  audience: string
  target_roles: string[]
  target_class_ids: string[]
  is_pinned: boolean
}): Promise<string> {
  const { data, error } = await supabase
    .from('announcements')
    .insert(row as never)
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Crée les notifications individuelles correspondant à l'audience visée. */
export async function broadcastAnnouncement(announcementId: string): Promise<number> {
  const { data, error } = await supabase.rpc('broadcast_announcement', {
    p_announcement_id: announcementId,
  })
  if (error) throw error
  return data ?? 0
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw error
}

export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_ids: ids ?? undefined,
  })
  if (error) throw error
  return data ?? 0
}

export interface MessageRow {
  id: string
  subject: string
  body: string
  sent_at: string
  sender: { full_name: string | null } | null
  message_recipients: Array<{ id: string; read_at: string | null }>
}

/** Historique des envois aux familles. */
export async function listMessages(schoolId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, subject, body, sent_at, sender:profiles(full_name), message_recipients(id, read_at)')
    .eq('school_id', schoolId)
    .order('sent_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as unknown as MessageRow[]
}
