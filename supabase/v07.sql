begin;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('solicitante','tecnico','admin','super_admin'));
create or replace function public.is_mkt_staff() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and active and role in ('tecnico','admin','super_admin')); $$;
create or replace function public.is_mkt_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and active and role in ('admin','super_admin')); $$;
create or replace function public.is_bd_super() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and active and role='super_admin'); $$;
create or replace function public.bd_protect_profile() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin') then return new; end if;
 if old.role='super_admin' or new.role='super_admin' then raise exception 'Super Admin protegido'; end if;
 if (old.role='admin' or new.role='admin') and not public.is_bd_super() then raise exception 'Somente Super Admin gerencia administradores'; end if;
 if new.role is distinct from old.role and new.role <> 'solicitante' then raise exception 'Use um convite individual'; end if;
 if new.id is distinct from old.id then raise exception 'Identidade protegida'; end if;
 return new;
end $$;
drop trigger if exists bd_protect_profile on public.profiles;
create trigger bd_protect_profile before update on public.profiles for each row execute function public.bd_protect_profile();
create sequence if not exists public.bd_protocol_seq;
revoke all on sequence public.bd_protocol_seq from anon,authenticated;
do $$ declare m bigint; v bigint; called boolean; begin
 select coalesce(max(substring(data->>'protocol' from '^#BD-([0-9]+)$')::bigint),0) into m from public.tickets where data->>'protocol' ~ '^#BD-[0-9]+$';
 select last_value,is_called into v,called from public.bd_protocol_seq;
 if m>=v then perform setval('public.bd_protocol_seq',m,true); end if;
end $$;
create unique index if not exists bd_protocol_unique on public.tickets ((data->>'protocol')) where data->>'protocol' ~ '^#BD-[0-9]+$';
create or replace function public.bd_protocol() returns trigger language plpgsql security definer set search_path='' as $$
declare n text;
begin
 if tg_op='UPDATE' then
  if new.data->>'protocol' is distinct from old.data->>'protocol' then raise exception 'Protocolo imutável'; end if;
 else
  n:=nextval('public.bd_protocol_seq')::text;
  new.data:=jsonb_set(new.data,'{protocol}',to_jsonb('#BD-'||lpad(n,greatest(6,length(n)),'0')));
 end if;
 return new;
end $$;
drop trigger if exists bd_protocol on public.tickets;
create trigger bd_protocol before insert or update on public.tickets for each row execute function public.bd_protocol();
create table if not exists public.bd_invites(id uuid primary key default gen_random_uuid(), email text not null, role text not null check(role in ('admin','tecnico')), code_hash bytea not null unique, created_by uuid not null, expires_at timestamptz not null default now()+interval '48 hours', used_at timestamptz, revoked boolean not null default false);
alter table public.bd_invites enable row level security;
revoke all on public.bd_invites from anon,authenticated;
create or replace function public.bd_create_invite(p_email text,p_role text) returns text language plpgsql security definer set search_path='' as $$
declare code text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
 if not public.is_mkt_admin() or p_role not in ('tecnico','admin') or (p_role='admin' and not public.is_bd_super()) then raise exception 'Sem permissão'; end if;
 if p_email is null or length(trim(p_email))>254 or position('@' in p_email)<2 then raise exception 'E-mail inválido'; end if;
 insert into public.bd_invites(email,role,code_hash,created_by) values(lower(trim(p_email)),p_role,sha256(convert_to(code,'UTF8')),auth.uid()); return code;
end $$;
create or replace function public.bd_list_invites() returns table(id uuid,email text,role text,expires_at timestamptz,used_at timestamptz,revoked boolean) language sql security definer set search_path='' as $$ select i.id,i.email,i.role,i.expires_at,i.used_at,i.revoked from public.bd_invites i where public.is_mkt_admin() and (public.is_bd_super() or i.created_by=auth.uid()) order by i.expires_at desc; $$;
create or replace function public.bd_revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin update public.bd_invites set revoked=true where id=p_id and used_at is null and public.is_mkt_admin() and (public.is_bd_super() or created_by=auth.uid()); if not found then raise exception 'Convite indisponível'; end if; end $$;
create or replace function public.bd_redeem_invite(p_code text) returns void language plpgsql security definer set search_path='' as $$
declare inv public.bd_invites%rowtype; em text;
begin
 if not public.is_mkt_active() then raise exception 'Conta indisponível'; end if;
 select lower(email) into em from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into inv from public.bd_invites where code_hash=sha256(convert_to(trim(p_code),'UTF8')) and email=em and not revoked and used_at is null and expires_at>now() for update;
 if not found then raise exception 'Convite inválido, expirado ou e-mail diferente'; end if;
 if not exists(select 1 from public.profiles where id=inv.created_by and active and (role='super_admin' or (role='admin' and inv.role='tecnico'))) then raise exception 'Convite não autorizado'; end if;
 update public.profiles set role=inv.role where id=auth.uid() and role='solicitante' and active;
 if not found then raise exception 'Perfil já possui acesso de equipe'; end if;
 update public.bd_invites set used_at=now() where id=inv.id;
end $$;
revoke all on function public.bd_create_invite(text,text),public.bd_list_invites(),public.bd_revoke_invite(uuid),public.bd_redeem_invite(text) from public,anon;
grant execute on function public.bd_create_invite(text,text),public.bd_list_invites(),public.bd_revoke_invite(uuid),public.bd_redeem_invite(text) to authenticated;
-- Notificações geradas pelo banco, não pelo navegador.
alter table public.notifications add column if not exists sender_id uuid;
alter table public.notifications add column if not exists push_claimed_at timestamptz;
drop policy if exists notification_insert on public.notifications;
create or replace function public.bd_notify_ticket() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); title text; target uuid; tid text:=new.id; proto text:=new.data->>'protocol'; entry jsonb; assigned text:=new.data->>'assignedTechId';
begin
 if actor is null then return new; end if;
 if tg_op='INSERT' then title:='Novo chamado';
 else
  if new.data->'timeline' is not distinct from old.data->'timeline' then return new; end if;
  entry:=new.data->'timeline'->-1;
  if entry->>'type'='internal' then return new; end if;
  title:=case when new.data->>'status' is distinct from old.data->>'status' then 'Chamado atualizado' when assigned is distinct from old.data->>'assignedTechId' then 'Chamado atribuído' else 'Nova resposta' end;
 end if;
 for target in select p.id from public.profiles p where p.active and p.id<>actor and (
   p.id=new.requester_id or p.id::text=assigned or ((assigned is null or tg_op='INSERT') and p.role in ('tecnico','admin','super_admin'))
 ) loop
  insert into public.notifications(id,user_id,sender_id,data) values('ntf_'||gen_random_uuid(),target,actor,jsonb_build_object('userId',target,'title',title||' • '||proto,'message','Há uma atualização no seu chamado. Abra o BravaDesk para consultar.','ticketId',tid,'protocol',proto,'read',false,'type','info','createdAt',now()));
 end loop;
 return new;
end $$;
drop trigger if exists bd_notify_ticket on public.tickets;
create trigger bd_notify_ticket after insert or update on public.tickets for each row execute function public.bd_notify_ticket();
create table if not exists public.bd_push_devices(endpoint text primary key,user_id uuid not null references public.profiles(id) on delete cascade, subscription jsonb not null);
alter table public.bd_push_devices enable row level security;
create or replace function public.bd_save_device(p_subscription jsonb) returns void language plpgsql security definer set search_path='' as $$
declare ep text:=p_subscription->>'endpoint';
begin
 if not public.is_mkt_active() or ep is null or length(ep)>2048 or ep !~ '^https://' or p_subscription->'keys'->>'p256dh' is null or p_subscription->'keys'->>'auth' is null then raise exception 'Dispositivo inválido'; end if;
 insert into public.bd_push_devices values(ep,auth.uid(),p_subscription) on conflict(endpoint) do update set user_id=excluded.user_id,subscription=excluded.subscription;
end $$;
create or replace function public.bd_remove_device(p_endpoint text) returns void language sql security definer set search_path='' as $$ delete from public.bd_push_devices where endpoint=p_endpoint and user_id=auth.uid(); $$;
revoke all on public.bd_push_devices from anon,authenticated;
revoke all on function public.bd_save_device(jsonb),public.bd_remove_device(text) from public,anon;
grant execute on function public.bd_save_device(jsonb),public.bd_remove_device(text) to authenticated;
-- Remover configurações antigas sem apagar o histórico de e-mails.
update public.app_settings set data=data-'webhookUrl'-'webhookSecret'-'techInviteCode'-'adminInviteCode' where id=1;
drop policy if exists email_log_insert on public.email_logs;
drop policy if exists email_log_update on public.email_logs;
create or replace function public.bd_protect_notification() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.sender_id is distinct from old.sender_id or new.push_claimed_at is distinct from old.push_claimed_at or (new.data-'read'-'id') is distinct from (old.data-'read'-'id') then raise exception 'Somente leitura pode ser alterada'; end if;
 return new;
end $$;
drop trigger if exists bd_protect_notification on public.notifications;
create trigger bd_protect_notification before update on public.notifications for each row execute function public.bd_protect_notification();
commit;
