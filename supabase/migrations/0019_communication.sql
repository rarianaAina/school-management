-- =============================================================================
-- 0019 — Communication : annonces, notifications, messages
--
-- notifications est publiee en Realtime : la cloche de l'interface s'abonne aux
-- insertions filtrees sur user_id.
-- =============================================================================

create type public.announcement_audience as enum ('all', 'role', 'level', 'class', 'student');

create type public.notification_type as enum (
  'announcement', 'grade_published', 'report_card', 'invoice', 'payment_reminder',
  'absence', 'exam_convocation', 'message', 'other'
);

-- -----------------------------------------------------------------------------
-- Annonces
-- -----------------------------------------------------------------------------
create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  title            text not null,
  body             text not null,
  author_id        uuid references public.profiles(id) on delete set null,
  audience         public.announcement_audience not null default 'all',
  target_roles     public.user_role[] not null default '{}',
  target_class_ids uuid[] not null default '{}',
  target_level_ids uuid[] not null default '{}',
  publish_at       timestamptz not null default now(),
  expires_at       timestamptz,
  is_pinned        boolean not null default false,
  attachments      jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index announcements_school_idx on public.announcements (school_id, publish_at desc);

select private.attach_updated_at('public.announcements');

-- -----------------------------------------------------------------------------
-- Notifications individuelles
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        public.notification_type not null default 'other',
  title       text not null,
  body        text,
  data        jsonb not null default '{}'::jsonb,
  entity_type text,
  entity_id   uuid,
  is_read     boolean not null default false,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where not is_read;

-- -----------------------------------------------------------------------------
-- Messages aux familles — l'historique des envois est une exigence de suivi
-- -----------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  thread_id   uuid,
  sender_id   uuid references public.profiles(id) on delete set null,
  subject     text not null,
  body        text not null,
  sent_at     timestamptz not null default now()
);

create index messages_school_idx on public.messages (school_id, sent_at desc);

create table public.message_recipients (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  message_id        uuid not null references public.messages(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  student_id        uuid references public.students(id) on delete cascade,
  delivered_via     text not null default 'in_app',
  read_at           timestamptz,

  constraint message_recipients_target check (
    recipient_user_id is not null or student_id is not null
  )
);

create index message_recipients_message_idx on public.message_recipients (message_id);
create index message_recipients_user_idx on public.message_recipients (recipient_user_id);

create table public.email_log (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  to_email            text not null,
  template            text,
  subject             text,
  provider_message_id text,
  status              text not null default 'sent',
  error               text,
  sent_at             timestamptz not null default now()
);

create index email_log_school_idx on public.email_log (school_id, sent_at desc);

-- -----------------------------------------------------------------------------
-- Diffusion d'une annonce en notifications individuelles
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_announcement(p_announcement_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.announcements;
  v_count integer := 0;
begin
  select * into v_row from public.announcements where id = p_announcement_id;

  if v_row.id is null then
    raise exception 'Annonce introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_row.school_id)
     and not private.has_role(v_row.school_id, array['teacher']::public.user_role[]) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  insert into public.notifications (school_id, user_id, type, title, body, entity_type, entity_id)
  -- Le type est explicitement qualifie : dans un INSERT ... SELECT, un
  -- litteral se resout en text et n'est pas converti vers l'enum.
  select distinct v_row.school_id, m.user_id, 'announcement'::public.notification_type,
         v_row.title, left(v_row.body, 240), 'announcement', v_row.id
  from public.memberships m
  where m.school_id = v_row.school_id
    and m.is_active
    and (
      v_row.audience = 'all'
      or (v_row.audience = 'role' and m.role = any (v_row.target_roles))
      -- Classes visees : eleves inscrits, et tuteurs de ces eleves.
      or (v_row.audience = 'class' and exists (
           select 1
           from public.enrollments e
           left join public.students s on s.id = e.student_id
           left join public.student_guardians sg on sg.student_id = e.student_id
           left join public.guardians g on g.id = sg.guardian_id
           where e.class_id = any (v_row.target_class_ids)
             and e.status = 'active'
             and (s.profile_id = m.user_id or g.profile_id = m.user_id)
         ))
      or (v_row.audience = 'level' and exists (
           select 1
           from public.enrollments e
           join public.classes c on c.id = e.class_id
           left join public.students s on s.id = e.student_id
           left join public.student_guardians sg on sg.student_id = e.student_id
           left join public.guardians g on g.id = sg.guardian_id
           where c.level_id = any (v_row.target_level_ids)
             and e.status = 'active'
             and (s.profile_id = m.user_id or g.profile_id = m.user_id)
         ))
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.broadcast_announcement(uuid) to authenticated;

-- Notification automatique a la publication des bulletins.
create or replace function public.notify_report_card_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_published and not coalesce(old.is_published, false) then
    insert into public.notifications (school_id, user_id, type, title, body, entity_type, entity_id)
    select distinct new.school_id, p.id, 'report_card'::public.notification_type,
           'Bulletin disponible',
           'Le bulletin de ' || s.full_name || ' vient d''etre publie.',
           'term_result', new.id
    from public.students s
    left join public.student_guardians sg on sg.student_id = s.id
    left join public.guardians g on g.id = sg.guardian_id
    join public.profiles p on p.id = s.profile_id or p.id = g.profile_id
    where s.id = new.student_id;
  end if;

  return new;
end;
$$;

create trigger term_results_notify
  after update on public.term_results
  for each row execute function public.notify_report_card_published();

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
     set is_read = true, read_at = now()
   where user_id = (select auth.uid())
     and not is_read
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.announcements enable row level security;

-- La cible de l'annonce est evaluee a la diffusion, pas a la lecture : tout
-- membre voit les annonces de son etablissement, la selection ayant deja eu
-- lieu au moment de la creation des notifications.
create policy announcements_select on public.announcements
  for select to authenticated
  using (private.is_school_member(school_id) and publish_at <= now());

create policy announcements_write on public.announcements
  for all to authenticated
  using (
    private.is_school_admin(school_id)
    or (author_id = (select auth.uid())
        and private.has_role(school_id, array['teacher']::public.user_role[]))
  )
  with check (
    private.is_school_admin(school_id)
    or (author_id = (select auth.uid())
        and private.has_role(school_id, array['teacher']::public.user_role[]))
  );

select private.grant_crud('public.announcements');

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Aucune policy d'insertion : les notifications naissent de fonctions
-- SECURITY DEFINER, jamais d'une ecriture directe du client.
select private.grant_read('public.notifications');
grant update on public.notifications to authenticated;

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or id in (
      select r.message_id from public.message_recipients r
      where r.recipient_user_id = (select auth.uid())
         or r.student_id = any (private.my_student_ids())
    )
  );

create policy messages_write on public.messages
  for all to authenticated
  using (
    private.is_school_admin(school_id)
    or private.has_role(school_id, array['teacher', 'accountant']::public.user_role[])
  )
  with check (
    private.is_school_admin(school_id)
    or private.has_role(school_id, array['teacher', 'accountant']::public.user_role[])
  );

select private.grant_crud('public.messages');

alter table public.message_recipients enable row level security;

create policy message_recipients_select on public.message_recipients
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or recipient_user_id = (select auth.uid())
    or student_id = any (private.my_student_ids())
  );

create policy message_recipients_write on public.message_recipients
  for all to authenticated
  using (
    private.is_school_admin(school_id)
    or private.has_role(school_id, array['teacher', 'accountant']::public.user_role[])
  )
  with check (
    private.is_school_admin(school_id)
    or private.has_role(school_id, array['teacher', 'accountant']::public.user_role[])
  );

select private.grant_crud('public.message_recipients');

alter table public.email_log enable row level security;

create policy email_log_select on public.email_log
  for select to authenticated
  using (private.is_school_admin(school_id));

select private.grant_read('public.email_log');

-- Realtime : la cloche de notifications s'abonne aux insertions.
alter publication supabase_realtime add table public.notifications;
