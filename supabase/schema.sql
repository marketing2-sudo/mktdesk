-- MktDesk | execute uma vez no SQL Editor do Supabase
-- Antes: habilite Email no Authentication > Providers.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'solicitante' check (role in ('solicitante','tecnico','admin')),
 active boolean not null default true,
 data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.tickets (
 id text primary key,
 requester_id uuid not null references public.profiles(id),
 data jsonb not null,
 updated_at timestamptz not null default now()
);
create index if not exists idx_tickets_requester on public.tickets(requester_id);
create table if not exists public.notifications (
 id text primary key,
 user_id uuid not null references public.profiles(id),
 data jsonb not null
);
create index if not exists idx_notifications_user on public.notifications(user_id);
create table if not exists public.email_logs (
 id text primary key,
 data jsonb not null
);
create table if not exists public.app_settings (
 id integer primary key check(id=1),
 data jsonb not null default '{}'::jsonb
);
insert into public.app_settings(id,data) values(1,'{}'::jsonb) on conflict(id) do nothing;

create or replace function public.is_mkt_staff() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active=true and role in ('tecnico','admin'));
$$;
create or replace function public.is_mkt_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active=true and role='admin');
$$;
create or replace function public.is_mkt_active() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active=true);
$$;

-- Criar perfil seguro no servidor, sempre com papel de solicitante.
create or replace function public.new_mktdesk_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,role,active,data)
 values(new.id, 'solicitante', true, jsonb_build_object(
  'id',new.id, 'name',coalesce(nullif(new.raw_user_meta_data->>'name',''),'Novo usuário'),
  'email',new.email, 'department',coalesce(new.raw_user_meta_data->>'department','Marketing'),
  'jobTitle',coalesce(new.raw_user_meta_data->>'jobTitle',''),
  'createdAt',now()
 ));
 return new;
end;
$$;
drop trigger if exists trg_new_mktdesk_user on auth.users;
create trigger trg_new_mktdesk_user after insert on auth.users
for each row execute function public.new_mktdesk_user();

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.notifications enable row level security;
alter table public.email_logs enable row level security;
alter table public.app_settings enable row level security;

-- Perfis: usuário ativo vê equipe para atribuição/notificações; só admins modificam.
create policy "profile_read" on public.profiles for select to authenticated
 using (public.is_mkt_active() or id=auth.uid());
create policy "profile_admin_update" on public.profiles for update to authenticated
 using (public.is_mkt_admin()) with check (public.is_mkt_admin());

-- Chamados: o solicitante vê os próprios; equipe visualiza todos.
create policy "ticket_read" on public.tickets for select to authenticated
 using (public.is_mkt_active() and (requester_id=auth.uid() or public.is_mkt_staff()));
create policy "ticket_create" on public.tickets for insert to authenticated
 with check (public.is_mkt_active() and requester_id=auth.uid() and data->>'requesterId'=auth.uid()::text);
create policy "ticket_update" on public.tickets for update to authenticated
 using (public.is_mkt_active() and (requester_id=auth.uid() or public.is_mkt_staff()))
 with check (public.is_mkt_active() and (requester_id=auth.uid() or public.is_mkt_staff()) and data->>'requesterId'=requester_id::text);

-- Evita que solicitante force atribuições, campos de SLA ou outros metadados.
create or replace function public.protect_requester_ticket_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 old_status text := old.data->>'status';
 new_status text := new.data->>'status';
 allowed text[] := array['timeline','updatedAt','status','sacPausedAt','totalPausedMs','completedAt','csatRating','csatComment'];
begin
 if new.requester_id is distinct from old.requester_id then
  raise exception 'Não é permitido trocar o solicitante';
 end if;
 if public.is_mkt_staff() then return new; end if;
 if auth.uid() is distinct from old.requester_id then raise exception 'Sem permissão'; end if;
 if (old.data - allowed) is distinct from (new.data - allowed) then
  raise exception 'Não é permitido alterar campos internos do chamado';
 end if;
 if new_status is distinct from old_status and not (
   (old_status='aguardando_solicitante' and new_status='em_atendimento') or
   (old_status='em_aprovacao' and new_status in ('em_atendimento','concluido'))
 ) then raise exception 'Transição de status não permitida'; end if;
 return new;
end;
$$;
drop trigger if exists trg_protect_ticket on public.tickets;
create trigger trg_protect_ticket before update on public.tickets
for each row execute function public.protect_requester_ticket_update();

-- Notificações: receber as próprias; equipe pode criar mensagens para destinatários.
create policy "notification_read" on public.notifications for select to authenticated
 using (public.is_mkt_active() and (user_id=auth.uid() or public.is_mkt_staff()));
create policy "notification_insert" on public.notifications for insert to authenticated
 with check (public.is_mkt_active());
create policy "notification_update" on public.notifications for update to authenticated
 using (public.is_mkt_active() and user_id=auth.uid()) with check (public.is_mkt_active() and user_id=auth.uid());

create policy "email_log_select" on public.email_logs for select to authenticated using(public.is_mkt_admin());
create policy "email_log_insert" on public.email_logs for insert to authenticated with check(public.is_mkt_active());
create policy "email_log_update" on public.email_logs for update to authenticated using(public.is_mkt_admin()) with check(public.is_mkt_admin());

create policy "settings_read" on public.app_settings for select to authenticated using(public.is_mkt_active());
create policy "settings_admin_insert" on public.app_settings for insert to authenticated with check(public.is_mkt_admin());
create policy "settings_admin_update" on public.app_settings for update to authenticated using(public.is_mkt_admin()) with check(public.is_mkt_admin());

-- Ative Realtime no banco para sincronização entre computadores.
do $$
begin
 begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
 begin alter publication supabase_realtime add table public.tickets; exception when duplicate_object then null; end;
 begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
 begin alter publication supabase_realtime add table public.email_logs; exception when duplicate_object then null; end;
 begin alter publication supabase_realtime add table public.app_settings; exception when duplicate_object then null; end;
end $$;

-- PASSO MANUAL APÓS CADASTRAR SEU E-MAIL NA TELA DO MktDesk:
-- Execute substituindo pelo e-mail do administrador (NÃO faça sem conferir):
-- update public.profiles set role='admin'
-- where id=(select id from auth.users where email='seu-email@empresa.com.br');
