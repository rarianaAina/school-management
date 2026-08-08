-- =============================================================================
-- 0017 — Frais de scolarite et gestion financiere
--
-- Le point delicat est le paiement partiel : un versement peut couvrir
-- plusieurs lignes de facture, et une ligne peut etre soldee par plusieurs
-- versements. D'ou payment_allocations, qui porte la relation N..N entre
-- paiements et lignes. Le montant paye d'une facture n'est jamais saisi : il
-- est recalcule par trigger depuis les affectations.
-- =============================================================================

create type public.fee_status as enum ('pending', 'partial', 'paid', 'waived', 'overdue');

create type public.invoice_status as enum (
  'draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'
);

create type public.payment_method as enum (
  'cash', 'bank_transfer', 'mobile_money', 'card', 'check', 'other'
);

create type public.payment_status as enum ('confirmed', 'pending', 'cancelled');

create type public.discount_kind as enum ('percentage', 'fixed');

create type public.reminder_channel as enum ('email', 'sms', 'in_app');

-- -----------------------------------------------------------------------------
-- Grilles tarifaires
-- -----------------------------------------------------------------------------
create table public.fee_categories (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  name         text not null,
  code         text,
  is_mandatory boolean not null default true,
  is_recurring boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint fee_categories_unique_name unique (school_id, name)
);

select private.attach_updated_at('public.fee_categories');

-- La grille se resout par specificite decroissante : classe, puis filiere,
-- puis niveau, puis tarif general.
create table public.fee_structures (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  fee_category_id  uuid not null references public.fee_categories(id) on delete cascade,
  level_id         uuid references public.levels(id) on delete cascade,
  program_id       uuid references public.programs(id) on delete cascade,
  class_id         uuid references public.classes(id) on delete cascade,
  amount           numeric(12,2) not null,
  currency         text not null default 'EUR',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint fee_structures_amount_positive check (amount >= 0)
);

create index fee_structures_lookup_idx
  on public.fee_structures (school_id, academic_year_id) where is_active;

select private.attach_updated_at('public.fee_structures');

create table public.fee_installments (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  fee_structure_id  uuid not null references public.fee_structures(id) on delete cascade,
  label             text not null,
  percentage        numeric(5,2),
  amount            numeric(12,2),
  due_date          date not null,
  order_index       smallint not null default 1,

  -- Une tranche s'exprime en pourcentage ou en montant, jamais les deux.
  constraint fee_installments_one_basis check (
    (percentage is not null and amount is null)
    or (percentage is null and amount is not null)
  )
);

create index fee_installments_structure_idx on public.fee_installments (fee_structure_id, order_index);

create table public.scholarships (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  kind        public.discount_kind not null default 'percentage',
  value       numeric(10,2) not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint scholarships_value_positive check (value > 0)
);

-- -----------------------------------------------------------------------------
-- Frais dus par eleve
-- -----------------------------------------------------------------------------
create table public.student_fees (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  fee_structure_id  uuid references public.fee_structures(id) on delete set null,
  fee_category_id   uuid not null references public.fee_categories(id) on delete restrict,
  amount_due        numeric(12,2) not null,
  discount_amount   numeric(12,2) not null default 0,
  scholarship_id    uuid references public.scholarships(id) on delete set null,
  net_due           numeric(12,2) generated always as (amount_due - discount_amount) stored,
  status            public.fee_status not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint student_fees_unique unique (student_id, academic_year_id, fee_category_id),
  constraint student_fees_amounts_positive check (amount_due >= 0 and discount_amount >= 0),
  constraint student_fees_discount_bounded check (discount_amount <= amount_due)
);

create index student_fees_student_idx on public.student_fees (student_id, academic_year_id);

select private.attach_updated_at('public.student_fees');

-- -----------------------------------------------------------------------------
-- Factures
-- -----------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  number            text not null,
  issue_date        date not null default current_date,
  due_date          date not null,
  total_amount      numeric(12,2) not null default 0,
  paid_amount       numeric(12,2) not null default 0,
  balance           numeric(12,2) generated always as (total_amount - paid_amount) stored,
  currency          text not null default 'EUR',
  status            public.invoice_status not null default 'draft',
  notes             text,
  pdf_path          text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoices_number_unique unique (school_id, number),
  constraint invoices_amounts_positive check (total_amount >= 0 and paid_amount >= 0)
);

create index invoices_student_idx on public.invoices (student_id, academic_year_id);
create index invoices_status_idx on public.invoices (school_id, status, due_date);

select private.attach_updated_at('public.invoices');

create table public.invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  student_fee_id  uuid references public.student_fees(id) on delete set null,
  fee_category_id uuid references public.fee_categories(id) on delete set null,
  label           text not null,
  quantity        numeric(8,2) not null default 1,
  unit_amount     numeric(12,2) not null,
  amount          numeric(12,2) generated always as (quantity * unit_amount) stored,

  constraint invoice_lines_quantity_positive check (quantity > 0)
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

-- -----------------------------------------------------------------------------
-- Paiements et affectations
-- -----------------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  invoice_id       uuid references public.invoices(id) on delete set null,
  receipt_number   text not null,
  amount           numeric(12,2) not null,
  currency         text not null default 'EUR',
  method           public.payment_method not null default 'cash',
  reference        text,
  paid_at          timestamptz not null default now(),
  received_by      uuid references public.profiles(id) on delete set null,
  notes            text,
  status           public.payment_status not null default 'confirmed',
  receipt_pdf_path text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint payments_receipt_unique unique (school_id, receipt_number),
  constraint payments_amount_positive check (amount > 0)
);

create index payments_student_idx on public.payments (student_id, paid_at desc);
create index payments_school_date_idx on public.payments (school_id, paid_at desc);

select private.attach_updated_at('public.payments');

create table public.payment_allocations (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  payment_id      uuid not null references public.payments(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete cascade,
  amount          numeric(12,2) not null,

  constraint payment_allocations_unique unique (payment_id, invoice_line_id),
  constraint payment_allocations_amount_positive check (amount > 0)
);

create index payment_allocations_line_idx on public.payment_allocations (invoice_line_id);

create table public.payment_reminders (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  invoice_id  uuid references public.invoices(id) on delete cascade,
  channel     public.reminder_channel not null default 'email',
  template    text,
  sent_to     text,
  sent_at     timestamptz not null default now(),
  status      text not null default 'sent',
  error       text
);

create index payment_reminders_invoice_idx on public.payment_reminders (invoice_id, sent_at desc);

-- =============================================================================
-- Coherence des montants
-- =============================================================================

-- Une affectation ne peut pas depasser ni le paiement, ni le reste du a la ligne.
create or replace function public.check_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_total   numeric;
  v_payment_amount  numeric;
  v_line_amount     numeric;
  v_line_allocated  numeric;
begin
  select p.amount into v_payment_amount from public.payments p where p.id = new.payment_id;

  select coalesce(sum(a.amount), 0) into v_payment_total
  from public.payment_allocations a
  where a.payment_id = new.payment_id and a.id is distinct from new.id;

  if v_payment_total + new.amount > v_payment_amount + 0.001 then
    raise exception 'Affectation de % impossible : le paiement ne dispose plus que de %.',
      new.amount, v_payment_amount - v_payment_total
      using errcode = '23514';
  end if;

  select l.amount into v_line_amount from public.invoice_lines l where l.id = new.invoice_line_id;

  select coalesce(sum(a.amount), 0) into v_line_allocated
  from public.payment_allocations a
  where a.invoice_line_id = new.invoice_line_id and a.id is distinct from new.id;

  if v_line_allocated + new.amount > v_line_amount + 0.001 then
    raise exception 'Affectation de % impossible : il ne reste que % a payer sur cette ligne.',
      new.amount, v_line_amount - v_line_allocated
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payment_allocations_check
  before insert or update on public.payment_allocations
  for each row execute function public.check_payment_allocation();

-- Le montant paye d'une facture est un resultat, jamais une saisie.
create or replace function public.refresh_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice uuid;
  v_total   numeric;
  v_paid    numeric;
  v_due     date;
begin
  select l.invoice_id into v_invoice
  from public.invoice_lines l
  where l.id = coalesce(new.invoice_line_id, old.invoice_line_id);

  if v_invoice is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(l.amount), 0) into v_total
  from public.invoice_lines l where l.invoice_id = v_invoice;

  select coalesce(sum(a.amount), 0) into v_paid
  from public.payment_allocations a
  join public.invoice_lines l on l.id = a.invoice_line_id
  join public.payments p on p.id = a.payment_id
  where l.invoice_id = v_invoice and p.status = 'confirmed';

  select due_date into v_due from public.invoices where id = v_invoice;

  update public.invoices
     set total_amount = v_total,
         paid_amount  = v_paid,
         -- Chaque branche est typee : dans un CASE, des litteraux non
         -- qualifies se resolvent en text et le cast implicite vers l'enum
         -- n'a pas lieu.
         status = case
           when status = 'cancelled' then 'cancelled'::public.invoice_status
           when v_paid >= v_total and v_total > 0 then 'paid'::public.invoice_status
           when v_paid > 0 then 'partially_paid'::public.invoice_status
           when v_due < current_date then 'overdue'::public.invoice_status
           when status = 'draft' then 'draft'::public.invoice_status
           else 'issued'::public.invoice_status
         end
   where id = v_invoice;

  return coalesce(new, old);
end;
$$;

create trigger payment_allocations_refresh_invoice
  after insert or update or delete on public.payment_allocations
  for each row execute function public.refresh_invoice_totals();

-- Idem quand les lignes changent.
create or replace function public.refresh_invoice_from_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_total   numeric;
begin
  select coalesce(sum(l.amount), 0) into v_total
  from public.invoice_lines l where l.invoice_id = v_invoice;

  update public.invoices set total_amount = v_total where id = v_invoice;
  return coalesce(new, old);
end;
$$;

create trigger invoice_lines_refresh
  after insert or update or delete on public.invoice_lines
  for each row execute function public.refresh_invoice_from_lines();

-- Numerotation automatique
create or replace function public.assign_finance_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'invoices' then
    if new.number is null or length(trim(new.number)) = 0 then
      new.number := public.next_number(new.school_id, 'invoice');
    end if;
  else
    if new.receipt_number is null or length(trim(new.receipt_number)) = 0 then
      new.receipt_number := public.next_number(new.school_id, 'receipt');
    end if;
  end if;
  return new;
end;
$$;

create trigger invoices_assign_number
  before insert on public.invoices
  for each row execute function public.assign_finance_number();

create trigger payments_assign_number
  before insert on public.payments
  for each row execute function public.assign_finance_number();

-- =============================================================================
-- Fonctions metier
-- =============================================================================

-- Applique la grille tarifaire a un eleve, par specificite decroissante.
create or replace function public.assign_fees_to_student(
  p_student_id uuid,
  p_year_id    uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school  uuid;
  v_class   uuid;
  v_level   uuid;
  v_program uuid;
  v_count   integer := 0;
begin
  select s.school_id into v_school from public.students s where s.id = p_student_id;

  if not private.is_school_admin(v_school)
     and not private.has_role(v_school, array['accountant']::public.user_role[]) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  select e.class_id, c.level_id, c.program_id
    into v_class, v_level, v_program
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  where e.student_id = p_student_id
    and e.academic_year_id = p_year_id
    and e.status = 'active';

  -- Une seule grille par categorie : la plus specifique l'emporte.
  insert into public.student_fees (
    school_id, student_id, academic_year_id, fee_structure_id, fee_category_id, amount_due
  )
  select distinct on (f.fee_category_id)
         v_school, p_student_id, p_year_id, f.id, f.fee_category_id, f.amount
  from public.fee_structures f
  where f.school_id = v_school
    and f.academic_year_id = p_year_id
    and f.is_active
    and (f.class_id   = v_class   or f.class_id   is null)
    and (f.program_id = v_program or f.program_id is null)
    and (f.level_id   = v_level   or f.level_id   is null)
  order by f.fee_category_id,
           (f.class_id is not null) desc,
           (f.program_id is not null) desc,
           (f.level_id is not null) desc
  on conflict (student_id, academic_year_id, fee_category_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.assign_fees_to_student(uuid, uuid) to authenticated;

-- Emet une facture couvrant les frais non encore factures d'un eleve.
create or replace function public.issue_invoice(
  p_student_id uuid,
  p_year_id    uuid,
  p_due_date   date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school   uuid;
  v_currency text;
  v_invoice  uuid;
  v_lines    integer;
begin
  select s.school_id into v_school from public.students s where s.id = p_student_id;

  if not private.is_school_admin(v_school)
     and not private.has_role(v_school, array['accountant']::public.user_role[]) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  select currency into v_currency from public.schools where id = v_school;

  insert into public.invoices (
    school_id, student_id, academic_year_id, due_date, currency, status, created_by
  )
  values (
    v_school, p_student_id, p_year_id,
    coalesce(p_due_date, current_date + 30), v_currency, 'issued', (select auth.uid())
  )
  returning id into v_invoice;

  insert into public.invoice_lines (
    school_id, invoice_id, student_fee_id, fee_category_id, label, quantity, unit_amount
  )
  select v_school, v_invoice, sf.id, sf.fee_category_id, fc.name, 1, sf.net_due
  from public.student_fees sf
  join public.fee_categories fc on fc.id = sf.fee_category_id
  where sf.student_id = p_student_id
    and sf.academic_year_id = p_year_id
    and sf.status <> 'waived'
    and not exists (
      select 1 from public.invoice_lines l
      join public.invoices i on i.id = l.invoice_id
      where l.student_fee_id = sf.id and i.status <> 'cancelled'
    );

  get diagnostics v_lines = row_count;

  if v_lines = 0 then
    delete from public.invoices where id = v_invoice;
    raise exception 'Aucun frais restant a facturer pour cet eleve.' using errcode = 'P0002';
  end if;

  return v_invoice;
end;
$$;

grant execute on function public.issue_invoice(uuid, uuid, date) to authenticated;

-- Enregistre un versement et l'impute sur les lignes les plus anciennes.
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount     numeric,
  p_method     public.payment_method default 'cash',
  p_reference  text default null,
  p_paid_at    timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school    uuid;
  v_student   uuid;
  v_payment   uuid;
  v_remaining numeric := p_amount;
  v_line      record;
  v_take      numeric;
begin
  select school_id, student_id into v_school, v_student
  from public.invoices where id = p_invoice_id;

  if v_school is null then
    raise exception 'Facture introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school)
     and not private.has_role(v_school, array['accountant']::public.user_role[]) then
    raise exception 'Seule la comptabilite peut enregistrer un paiement.' using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'Le montant doit etre positif.' using errcode = '23514';
  end if;

  insert into public.payments (
    school_id, student_id, invoice_id, amount, method, reference, paid_at, received_by
  )
  values (v_school, v_student, p_invoice_id, p_amount, p_method, p_reference, p_paid_at,
          (select auth.uid()))
  returning id into v_payment;

  -- Imputation ligne a ligne, dans l'ordre de creation : un versement partiel
  -- solde les premieres lignes avant d'entamer les suivantes.
  for v_line in
    select l.id,
           l.amount - coalesce((
             select sum(a.amount) from public.payment_allocations a
             where a.invoice_line_id = l.id
           ), 0) as remaining
    from public.invoice_lines l
    where l.invoice_id = p_invoice_id
    order by l.id
  loop
    exit when v_remaining <= 0;
    continue when v_line.remaining <= 0;

    v_take := least(v_remaining, v_line.remaining);

    insert into public.payment_allocations (school_id, payment_id, invoice_line_id, amount)
    values (v_school, v_payment, v_line.id, v_take);

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0.001 then
    raise exception 'Le versement depasse de % le solde de la facture.', v_remaining
      using errcode = '23514';
  end if;

  return v_payment;
end;
$$;

grant execute on function public.record_payment(uuid, numeric, public.payment_method, text, timestamptz)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Soldes et impayes
-- -----------------------------------------------------------------------------
create view public.student_balances
with (security_invoker = true) as
  select i.school_id,
         i.student_id,
         i.academic_year_id,
         s.full_name,
         s.matricule,
         sum(i.total_amount)                                            as total_invoiced,
         sum(i.paid_amount)                                             as total_paid,
         sum(i.balance)                                                 as balance,
         min(i.due_date) filter (where i.balance > 0)                   as oldest_due_date,
         max(current_date - i.due_date) filter (where i.balance > 0)    as days_overdue,
         count(*) filter (where i.balance > 0 and i.due_date < current_date) as overdue_invoices
  from public.invoices i
  join public.students s on s.id = i.student_id
  where i.status <> 'cancelled'
  group by i.school_id, i.student_id, i.academic_year_id, s.full_name, s.matricule;

grant select on public.student_balances to authenticated;

-- Recettes par mois, pour les tableaux de bord.
create view public.monthly_revenue
with (security_invoker = true) as
  select p.school_id,
         date_trunc('month', p.paid_at)::date as month,
         sum(p.amount)                        as amount,
         count(*)                             as payment_count
  from public.payments p
  where p.status = 'confirmed'
  group by p.school_id, date_trunc('month', p.paid_at);

grant select on public.monthly_revenue to authenticated;

-- =============================================================================
-- RLS
--
-- La comptabilite ecrit ; l'administration lit et ecrit ; l'eleve et son parent
-- consultent leur propre dossier.
-- =============================================================================
create or replace function private.can_manage_finance(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_school_admin(p_school)
      or private.has_role(p_school, array['accountant']::public.user_role[])
$$;

grant execute on function private.can_manage_finance(uuid) to authenticated;

-- Referentiels tarifaires : lisibles par l'administration et la comptabilite.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'fee_categories', 'fee_structures', 'fee_installments', 'scholarships'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (private.is_school_member(school_id))',
      v_table || '_select', v_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (private.can_manage_finance(school_id))
         with check (private.can_manage_finance(school_id))',
      v_table || '_write', v_table
    );
    execute format('select private.grant_crud(''public.%I'')', v_table);
  end loop;
end
$$;

-- Dossiers financiers : perimetre eleve.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['student_fees', 'invoices', 'payments', 'payment_reminders']
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (
           private.can_manage_finance(school_id)
           or student_id = any (private.my_student_ids())
         )',
      v_table || '_select', v_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (private.can_manage_finance(school_id))
         with check (private.can_manage_finance(school_id))',
      v_table || '_write', v_table
    );
    execute format('select private.grant_crud(''public.%I'')', v_table);
  end loop;
end
$$;

-- Lignes et affectations : visibles avec la facture ou le paiement qu'elles
-- detaillent.
alter table public.invoice_lines enable row level security;

create policy invoice_lines_select on public.invoice_lines
  for select to authenticated
  using (
    private.can_manage_finance(school_id)
    or invoice_id in (
      select i.id from public.invoices i
      where i.student_id = any (private.my_student_ids())
    )
  );

create policy invoice_lines_write on public.invoice_lines
  for all to authenticated
  using (private.can_manage_finance(school_id))
  with check (private.can_manage_finance(school_id));

select private.grant_crud('public.invoice_lines');

alter table public.payment_allocations enable row level security;

create policy payment_allocations_select on public.payment_allocations
  for select to authenticated
  using (
    private.can_manage_finance(school_id)
    or payment_id in (
      select p.id from public.payments p
      where p.student_id = any (private.my_student_ids())
    )
  );

create policy payment_allocations_write on public.payment_allocations
  for all to authenticated
  using (private.can_manage_finance(school_id))
  with check (private.can_manage_finance(school_id));

select private.grant_crud('public.payment_allocations');

select private.attach_audit('public.payments');
select private.attach_audit('public.invoices');
