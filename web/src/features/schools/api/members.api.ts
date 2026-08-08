import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'
import type { UserRole } from '@/types/domain'

export type SchoolMember = Tables<'school_members'>

export async function listMembers(schoolId: string): Promise<SchoolMember[]> {
  const { data, error } = await supabase
    .from('school_members')
    .select('*')
    .eq('school_id', schoolId)
    .order('role')
    .order('full_name')
  if (error) throw error
  return data ?? []
}

export interface InviteMemberInput {
  school_id: string
  email: string
  role: UserRole
  first_name?: string
  last_name?: string
}

export interface InviteMemberResult {
  user_id: string
  /** true : compte créé et e-mail envoyé. false : compte existant simplement rattaché. */
  invited: boolean
}

export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
  const { data, error } = await supabase.functions.invoke<InviteMemberResult>('invite-member', {
    body: { ...input, redirect_to: `${window.location.origin}/definir-mot-de-passe` },
  })

  if (error) {
    // Les Edge Functions renvoient le détail dans le corps de la réponse.
    const context = (error as { context?: Response }).context
    if (context) {
      const body = await context.json().catch(() => null)
      if (body?.error) throw new Error(body.error)
    }
    throw error
  }

  if (!data) throw new Error("Réponse vide du service d'invitation.")
  return data
}

export async function setMembershipActive(
  membershipId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('memberships')
    .update({ is_active: isActive })
    .eq('id', membershipId)
  if (error) throw error
}

export async function updateMembershipRole(
  membershipId: string,
  role: UserRole,
): Promise<void> {
  const { error } = await supabase.from('memberships').update({ role }).eq('id', membershipId)
  if (error) throw error
}

export async function removeMembership(membershipId: string): Promise<void> {
  const { error } = await supabase.from('memberships').delete().eq('id', membershipId)
  if (error) throw error
}
