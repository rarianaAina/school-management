import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Mail, Megaphone, Pin, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { RoleGate } from '@/components/shared/RoleGate'
import {
  SelectField,
  SwitchField,
  TextField,
  TextareaField,
} from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { useAuth } from '@/features/auth/AuthProvider'
import { queryClient } from '@/lib/queryClient'
import { formatDateTime, formatRelative } from '@/lib/formatters'
import { listClasses } from '@/features/academics/api/academics.api'
import {
  AUDIENCE_LABELS,
  ROLE_LABELS,
  type AnnouncementAudience,
  type UserRole,
} from '@/types/domain'
import {
  broadcastAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  listMessages,
  type AnnouncementRow,
  type MessageRow,
} from '../api/communication.api'

const announcementSchema = z
  .object({
    title: z.string().min(1, 'Titre requis').max(140),
    body: z.string().min(1, 'Contenu requis').max(4000),
    audience: z.enum(['all', 'role', 'level', 'class', 'student']),
    target_role: z.string().nullable(),
    target_class_id: z.string().nullable(),
    is_pinned: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.audience === 'role' && !values.target_role) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choisissez un rôle destinataire',
        path: ['target_role'],
      })
    }
    if (values.audience === 'class' && !values.target_class_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choisissez une classe',
        path: ['target_class_id'],
      })
    }
  })

export function CommunicationPage() {
  const { schoolId, selectedYearId, settings, can } = useSchool()
  const { user } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<AnnouncementRow | null>(null)

  const announcementsQuery = useQuery({
    queryKey: ['announcements', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listAnnouncements(schoolId!),
  })

  const messagesQuery = useQuery({
    queryKey: ['messages', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listMessages(schoolId!),
  })

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof announcementSchema>) => {
      const id = await createAnnouncement({
        school_id: schoolId!,
        author_id: user!.id,
        title: values.title,
        body: values.body,
        audience: values.audience,
        target_roles: values.target_role ? [values.target_role] : [],
        target_class_ids: values.target_class_id ? [values.target_class_id] : [],
        is_pinned: values.is_pinned,
      })

      // Publier ne suffit pas : la diffusion crée les notifications
      // individuelles, seules visibles depuis la cloche.
      return broadcastAnnouncement(id)
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ['announcements', schoolId] })
      toast.success(
        count > 0
          ? `Annonce publiée et notifiée à ${count} personne(s).`
          : 'Annonce publiée. Aucun destinataire ne correspond à cette audience.',
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['announcements', schoolId] })
      toast.success('Annonce supprimée.')
    },
  })

  const messageColumns: Column<MessageRow>[] = [
    {
      id: 'subject',
      header: 'Objet',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.subject}</p>
          <p className="line-clamp-1 text-xs text-muted-foreground">{row.body}</p>
        </div>
      ),
    },
    {
      id: 'sender',
      header: 'Expéditeur',
      hideOnMobile: true,
      cell: (row) => row.sender?.full_name ?? '—',
    },
    {
      id: 'recipients',
      header: 'Destinataires',
      align: 'right',
      cell: (row) => {
        const total = row.message_recipients.length
        const read = row.message_recipients.filter((item) => item.read_at).length
        return (
          <span className="tabular text-sm text-muted-foreground">
            {read} / {total} lus
          </span>
        )
      },
    },
    {
      id: 'sent',
      header: 'Envoyé',
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.sent_at)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication"
        description="Annonces à l'établissement et historique des envois aux familles."
        actions={
          <RoleGate permission="announcement:write">
            <Button onClick={() => setDialogOpen(true)}>
              <Megaphone className="size-4" />
              Nouvelle annonce
            </Button>
          </RoleGate>
        }
      />

      <Tabs defaultValue="announcements">
        <TabsList>
          <TabsTrigger value="announcements">Annonces</TabsTrigger>
          <TabsTrigger value="messages">Historique des envois</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-4 pt-4">
          {announcementsQuery.data?.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Megaphone}
                  title="Aucune annonce"
                  description="Publiez une annonce : elle génère une notification chez chaque destinataire visé."
                />
              </CardContent>
            </Card>
          ) : (
            (announcementsQuery.data ?? []).map((item) => (
              <Card key={item.id}>
                <CardContent className="space-y-2 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="flex items-center gap-2 font-semibold">
                        {item.is_pinned ? <Pin className="size-4 text-primary" /> : null}
                        {item.title}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {item.author?.full_name ?? 'Établissement'} ·{' '}
                        {formatRelative(item.publish_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {AUDIENCE_LABELS[item.audience as AnnouncementAudience]}
                        {item.target_roles.length > 0
                          ? ` : ${item.target_roles
                              .map((role) => ROLE_LABELS[role as UserRole])
                              .join(', ')}`
                          : ''}
                      </Badge>
                      {can('announcement:write') ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Supprimer"
                          className="text-destructive"
                          onClick={() => setToDelete(item)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <p className="whitespace-pre-line text-sm text-pretty">{item.body}</p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="messages" className="pt-4">
          <DataTable
            columns={messageColumns}
            rows={messagesQuery.data ?? []}
            getRowId={(row) => row.id}
            isLoading={messagesQuery.isPending}
            emptyState={
              <EmptyState
                icon={Mail}
                title="Aucun envoi"
                description="Les messages adressés aux familles — convocations, relances, informations — sont conservés ici avec leur accusé de lecture."
              />
            }
          />
        </TabsContent>
      </Tabs>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouvelle annonce"
        description="La diffusion crée une notification chez chaque destinataire correspondant à l'audience."
        schema={announcementSchema}
        size="md"
        defaultValues={{
          title: '',
          body: '',
          audience: 'all',
          target_role: null,
          target_class_id: null,
          is_pinned: false,
        }}
        onSubmit={(values) => createMutation.mutateAsync(values)}
        submitLabel="Publier et notifier"
      >
        {(form) => {
          const audience = form.watch('audience')
          return (
            <div className="space-y-4">
              <TextField
                control={form.control}
                name="title"
                label="Titre"
                placeholder="Réunion parents-professeurs"
              />
              <TextareaField
                control={form.control}
                name="body"
                label="Message"
                rows={6}
                placeholder="Détaillez la date, le lieu et les modalités…"
              />
              <SelectField
                control={form.control}
                name="audience"
                label="Audience"
                options={(Object.keys(AUDIENCE_LABELS) as AnnouncementAudience[])
                  .filter((value) => value !== 'student')
                  .map((value) => ({ value, label: AUDIENCE_LABELS[value] }))}
              />

              {audience === 'role' ? (
                <SelectField
                  control={form.control}
                  name="target_role"
                  label="Rôle destinataire"
                  options={(Object.keys(ROLE_LABELS) as UserRole[]).map((value) => ({
                    value,
                    label: ROLE_LABELS[value],
                  }))}
                />
              ) : null}

              {audience === 'class' ? (
                <SelectField
                  control={form.control}
                  name="target_class_id"
                  label={settings.vocabulary.class}
                  description="Les élèves inscrits et leurs tuteurs sont notifiés."
                  options={(classesQuery.data ?? []).map((item) => ({
                    value: item.id!,
                    label: item.name!,
                  }))}
                />
              ) : null}

              <SwitchField
                control={form.control}
                name="is_pinned"
                label="Épingler en haut de la liste"
              />
            </div>
          )
        }}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Supprimer « ${toDelete?.title} » ?`}
        description="Les notifications déjà reçues par les destinataires sont conservées."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (toDelete) await deleteMutation.mutateAsync(toDelete.id)
          setToDelete(null)
        }}
      />

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
          <Send className="size-4" />
          Envoi par e-mail : configurez un SMTP dans Supabase
        </Button>
      </div>
    </div>
  )
}
