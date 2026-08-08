import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { MailPlus, MoreHorizontal, ShieldCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { SelectField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { useAuth } from '@/features/auth/AuthProvider'
import { queryClient, queryKeys } from '@/lib/queryClient'
import { formatRelative, initials } from '@/lib/formatters'
import { ROLE_LABELS, type UserRole } from '@/types/domain'
import {
  inviteMember,
  listMembers,
  removeMembership,
  setMembershipActive,
  updateMembershipRole,
  type SchoolMember,
} from '../api/members.api'

const inviteSchema = z.object({
  email: z.string().min(1, 'Adresse requise').email('Adresse e-mail invalide'),
  role: z.enum(['super_admin', 'school_admin', 'teacher', 'student', 'parent', 'accountant']),
  first_name: z.string().max(80).optional(),
  last_name: z.string().max(80).optional(),
})

type InviteValues = z.infer<typeof inviteSchema>

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as UserRole[]).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}))

const ROLE_BADGE: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
  super_admin: 'default',
  school_admin: 'default',
  accountant: 'secondary',
  teacher: 'secondary',
  parent: 'outline',
  student: 'outline',
}

export function MembersPage() {
  const { schoolId, can } = useSchool()
  const { user } = useAuth()
  const canManage = can('school:manage_members')

  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<SchoolMember | null>(null)

  const membersQuery = useQuery({
    queryKey: queryKeys.members(schoolId ?? 'none'),
    enabled: Boolean(schoolId),
    queryFn: () => listMembers(schoolId!),
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.members(schoolId ?? 'none') })

  const inviteMutation = useMutation({
    mutationFn: (values: InviteValues) =>
      inviteMember({
        school_id: schoolId!,
        email: values.email,
        role: values.role,
        first_name: values.first_name || undefined,
        last_name: values.last_name || undefined,
      }),
    onSuccess: async (result) => {
      await refresh()
      toast.success(
        result.invited
          ? "Invitation envoyée : le membre recevra un e-mail pour définir son mot de passe."
          : 'Compte existant rattaché à cet établissement.',
      )
    },
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => updateMembershipRole(id, role),
    onSuccess: async () => {
      await refresh()
      toast.success('Rôle mis à jour.')
    },
  })

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setMembershipActive(id, isActive),
    onSuccess: async (_, variables) => {
      await refresh()
      toast.success(variables.isActive ? 'Accès réactivé.' : 'Accès suspendu.')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeMembership(id),
    onSuccess: async () => {
      await refresh()
      toast.success('Membre retiré.')
    },
  })

  const rows = useMemo(() => {
    const all = membersQuery.data ?? []
    const needle = search.trim().toLowerCase()
    if (!needle) return all
    return all.filter((member) =>
      [member.full_name, member.email, member.role]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    )
  }, [membersQuery.data, search])

  const columns: Column<SchoolMember>[] = [
    {
      id: 'member',
      header: 'Membre',
      cell: (member) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarImage src={member.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="text-xs">
              {initials(member.first_name, member.last_name) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{member.full_name ?? 'Identité à compléter'}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Rôle',
      cell: (member) => (
        <Badge variant={ROLE_BADGE[member.role as UserRole]}>
          {ROLE_LABELS[member.role as UserRole]}
        </Badge>
      ),
    },
    {
      id: 'status',
      header: 'Statut',
      hideOnMobile: true,
      cell: (member) =>
        !member.is_active ? (
          <Badge variant="outline" className="text-destructive">
            Suspendu
          </Badge>
        ) : member.has_signed_in ? (
          <span className="text-sm text-muted-foreground">
            Vu {formatRelative(member.last_sign_in_at)}
          </span>
        ) : (
          <Badge variant="outline">Invitation en attente</Badge>
        ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      width: '60px',
      cell: (member) => {
        // On ne se retire pas soi-même : évite de perdre l'accès à l'établissement.
        const isSelf = member.user_id === user?.id
        if (!canManage || isSelf) return null

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Rôle</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={member.role ?? undefined}
                onValueChange={(role) =>
                  roleMutation.mutate({ id: member.id!, role: role as UserRole })
                }
              >
                {ROLE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  activeMutation.mutate({ id: member.id!, isActive: !member.is_active })
                }
              >
                <ShieldCheck className="size-4" />
                {member.is_active ? "Suspendre l'accès" : "Réactiver l'accès"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => setMemberToRemove(member)}
              >
                <UserX className="size-4" />
                Retirer de l&apos;établissement
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Membres & rôles</h2>
          <p className="text-sm text-muted-foreground">
            Chaque rôle ouvre un périmètre distinct, appliqué directement par la base de données.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setInviteOpen(true)}>
            <MailPlus className="size-4" />
            Inviter un membre
          </Button>
        ) : null}
      </div>

      <Input
        placeholder="Rechercher par nom, e-mail ou rôle…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(member) => member.id!}
            isLoading={membersQuery.isPending}
            className="[&>div]:rounded-none [&>div]:border-0"
            emptyState={
              <EmptyState
                title={search ? 'Aucun membre ne correspond' : 'Aucun membre'}
                description={
                  search
                    ? 'Essayez un autre terme de recherche.'
                    : "Invitez les enseignants, la vie scolaire et la comptabilité pour qu'ils accèdent à leur espace."
                }
              />
            }
          />
        </CardContent>
      </Card>

      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Inviter un membre"
        description="Un e-mail lui permettra de définir son mot de passe. Si l'adresse correspond déjà à un compte, il sera simplement rattaché."
        schema={inviteSchema}
        defaultValues={{ email: '', role: 'teacher', first_name: '', last_name: '' }}
        onSubmit={(values) => inviteMutation.mutateAsync(values)}
        submitLabel="Envoyer l'invitation"
        size="sm"
      >
        {(form) => (
          <div className="space-y-4">
            <TextField control={form.control} name="email" label="Adresse e-mail" type="email" />
            <SelectField control={form.control} name="role" label="Rôle" options={ROLE_OPTIONS} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="first_name" label="Prénom" />
              <TextField control={form.control} name="last_name" label="Nom" />
            </div>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
        title={`Retirer ${memberToRemove?.full_name ?? memberToRemove?.email} ?`}
        description="Son compte est conservé, mais il perd immédiatement l'accès à cet établissement."
        confirmLabel="Retirer"
        destructive
        onConfirm={async () => {
          if (memberToRemove) await removeMutation.mutateAsync(memberToRemove.id!)
          setMemberToRemove(null)
        }}
      />
    </div>
  )
}
