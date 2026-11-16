begin;
-- Catálogo de departamentos: preserva a lista anterior e os nomes históricos.
update public.app_settings set data=jsonb_set(data,'{departments}',(
 select jsonb_agg(jsonb_build_object('id',name,'name',name,'active',true) order by name) from (
 select unnest(array['Comercial & Vendas','Marketing','Recursos Humanos','Financeiro & Controladoria','Produto & Engenharia','Operações & Logística','Atendimento & CS','Jurídico & Compliance','Diretoria Executiva','Outros']) name
 union select data->>'department' from public.profiles where nullif(data->>'department','') is not null
 union select data->>'department' from public.tickets where nullif(data->>'department','') is not null
 ) d
)) where id=1 and not (data ? 'departments');
create or replace function public.bd_active_departments() returns setof text language sql stable security definer set search_path='' as $$
 select d->>'name' from public.app_settings s cross join lateral jsonb_array_elements(s.data->'departments') d where s.id=1 and coalesce(d->>'active','true')='true' order by d->>'name';
$$;
revoke all on function public.bd_active_departments() from public;
grant execute on function public.bd_active_departments() to anon,authenticated;
create or replace function public.bd_validate_departments() returns trigger language plpgsql set search_path='' as $$
declare a jsonb:=new.data->'departments';
begin
 if a is null or jsonb_typeof(a)<>'array' then raise exception 'Catálogo de departamentos inválido'; end if;
 if not exists(select 1 from jsonb_array_elements(a) d where coalesce(d->>'active','true')='true') then raise exception 'Mantenha pelo menos um departamento ativo'; end if;
 if exists(select 1 from jsonb_array_elements(a) d where nullif(trim(d->>'name'),'') is null or nullif(d->>'id','') is null) or exists(select 1 from jsonb_array_elements(a) d group by lower(trim(d->>'name')) having count(*)>1) or exists(select 1 from jsonb_array_elements(a) d group by d->>'id' having count(*)>1) then raise exception 'Departamentos inválidos ou duplicados'; end if;
 if exists(select 1 from jsonb_array_elements(a) d cross join lateral jsonb_array_elements_text(jsonb_build_array(d->>'name')||coalesce(d->'aliases','[]'::jsonb)) n group by lower(trim(n)) having count(distinct d->>'id')>1) then raise exception 'Nome ou histórico de departamento duplicado'; end if;
 return new;
end $$;
drop trigger if exists bd_validate_departments on public.app_settings;
create trigger bd_validate_departments before insert or update on public.app_settings for each row execute function public.bd_validate_departments();
-- Cadastro livre: valida departamento no servidor.
create or replace function public.new_mktdesk_user() returns trigger language plpgsql security definer set search_path='' as $$
declare dep text:=new.raw_user_meta_data->>'department';
begin
 if not exists(select 1 from public.bd_active_departments() d where d=dep) then raise exception 'Selecione um departamento ativo'; end if;
 insert into public.profiles(id,role,active,data) values(new.id,'solicitante',true,jsonb_build_object('id',new.id,'name',coalesce(nullif(new.raw_user_meta_data->>'name',''),'Novo usuário'),'email',new.email,'department',dep,'jobTitle',coalesce(new.raw_user_meta_data->>'jobTitle',''),'createdAt',now()));
 return new;
end $$;
-- Notas privadas separadas da linha pública do chamado.
create table if not exists public.bd_private_notes(ticket_id text not null references public.tickets(id) on delete cascade, note_id text not null, entry jsonb not null, primary key(ticket_id,note_id));
alter table public.bd_private_notes enable row level security;
revoke all on public.bd_private_notes from anon,authenticated;
grant select on public.bd_private_notes to authenticated;
drop policy if exists bd_private_notes_read on public.bd_private_notes;
create policy bd_private_notes_read on public.bd_private_notes for select to authenticated using(public.is_mkt_staff());
-- Migração das notas existentes, sem exclusão do histórico.
insert into public.bd_private_notes(ticket_id,note_id,entry)
 select t.id,coalesce(e->>'id',gen_random_uuid()::text),e from public.tickets t cross join lateral jsonb_array_elements(coalesce(t.data->'timeline','[]'::jsonb)) e where e->>'type'='internal' on conflict do nothing;
alter table public.tickets disable trigger trg_protect_ticket;
update public.tickets t set data=jsonb_set(data,'{timeline}',coalesce((select jsonb_agg(e order by ord) from jsonb_array_elements(t.data->'timeline') with ordinality as a(e,ord) where e->>'type' is distinct from 'internal'),'[]'::jsonb)) where exists(select 1 from jsonb_array_elements(coalesce(t.data->'timeline','[]'::jsonb)) e where e->>'type'='internal');
alter table public.tickets enable trigger trg_protect_ticket;
-- Nomes anteriores identificam o mesmo departamento sem alterar históricos.
create or replace function public.bd_same_department(a text,b text) returns boolean language sql stable security definer set search_path='' as $$
 select a=b or exists(select 1 from public.app_settings s cross join lateral jsonb_array_elements(s.data->'departments') d where s.id=1 and (d->>'name'=a or coalesce(d->'aliases','[]'::jsonb) ? a) and (d->>'name'=b or coalesce(d->'aliases','[]'::jsonb) ? b));
$$;
revoke all on function public.bd_same_department(text,text) from public,anon,authenticated;
-- Observadores somente do departamento do chamado, ativos, até 20.
create or replace function public.bd_validate_observers() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb:=coalesce(new.data->'observerIds','[]'::jsonb); old_a jsonb:='[]'::jsonb; x text;
begin
 if tg_op='INSERT' and not exists(select 1 from public.bd_active_departments() d where d=new.data->>'department') then raise exception 'Departamento indisponível'; end if;
 if tg_op='UPDATE' then old_a:=coalesce(old.data->'observerIds','[]'::jsonb); end if;
 if jsonb_typeof(a)<>'array' then raise exception 'Observadores inválidos'; end if;
 if jsonb_array_length(a)>20 or exists(select 1 from jsonb_array_elements_text(a) e group by e having count(*)>1) then raise exception 'Limite de 20 observadores, sem duplicidade'; end if;
 for x in select jsonb_array_elements_text(a) loop
  if not (old_a ? x) and (x=new.requester_id::text or not exists(select 1 from public.profiles p where p.id::text=x and p.active and public.bd_same_department(p.data->>'department',new.data->>'department'))) then raise exception 'Observador deve possuir conta ativa no departamento'; end if;
 end loop;
 return new;
end $$;
drop trigger if exists bd_validate_observers on public.tickets;
create trigger bd_validate_observers before insert or update on public.tickets for each row execute function public.bd_validate_observers();
-- Somente equipe e autor podem editar. Observador ganha SELECT, nunca UPDATE.
drop policy if exists ticket_read on public.tickets;
create policy ticket_read on public.tickets for select to authenticated using(public.is_mkt_active() and (requester_id=auth.uid() or public.is_mkt_staff() or coalesce(data->'observerIds','[]'::jsonb) ? auth.uid()::text));
drop policy if exists ticket_update on public.tickets;
create policy ticket_update on public.tickets for update to authenticated using(public.is_mkt_active() and (requester_id=auth.uid() or public.is_mkt_staff())) with check(public.is_mkt_active() and (requester_id=auth.uid() or public.is_mkt_staff()) and data->>'requesterId'=requester_id::text);
create or replace function public.protect_requester_ticket_update() returns trigger language plpgsql security definer set search_path='' as $$
declare old_status text:=old.data->>'status'; new_status text:=new.data->>'status'; allowed text[]:=array['timeline','updatedAt','status','sacPausedAt','totalPausedMs','completedAt','csatRating','csatComment','observerIds'];
begin
 if new.requester_id is distinct from old.requester_id then raise exception 'Não é permitido trocar o solicitante'; end if;
 if public.is_mkt_staff() then return new; end if;
 if auth.uid() is distinct from old.requester_id then raise exception 'Sem permissão'; end if;
 if (old.data-allowed) is distinct from (new.data-allowed) then raise exception 'Não é permitido alterar campos internos do chamado'; end if;
 if new_status is distinct from old_status and not ((old_status='aguardando_solicitante' and new_status='em_atendimento') or (old_status='em_aprovacao' and new_status in ('em_atendimento','concluido'))) then raise exception 'Transição de status não permitida'; end if;
 return new;
end $$;
-- BEFORE UPDATE guarda notas internas, logo o JSON público nunca as contém.
create or replace function public.bd_separate_notes() returns trigger language plpgsql security definer set search_path='' as $$
declare e jsonb;
begin
 for e in select value from jsonb_array_elements(coalesce(new.data->'timeline','[]'::jsonb)) where value->>'type'='internal' loop
  if not public.is_mkt_staff() or tg_op='INSERT' then raise exception 'Nota interna exclusiva da equipe em chamado existente'; end if;
  insert into public.bd_private_notes(ticket_id,note_id,entry) values(new.id,coalesce(e->>'id',gen_random_uuid()::text),e) on conflict do nothing;
 end loop;
 new.data=jsonb_set(new.data,'{timeline}',coalesce((select jsonb_agg(value order by ord) from jsonb_array_elements(coalesce(new.data->'timeline','[]'::jsonb)) with ordinality a(value,ord) where value->>'type' is distinct from 'internal'),'[]'::jsonb));
 return new;
end $$;
drop trigger if exists bd_separate_notes on public.tickets;
create trigger bd_separate_notes before insert or update on public.tickets for each row execute function public.bd_separate_notes();
create or replace function public.bd_notify_ticket() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); title text; target uuid; tid text:=new.id; proto text:=new.data->>'protocol'; entry jsonb; assigned text:=new.data->>'assignedTechId';
begin
 if actor is null then return new; end if;
 if tg_op='INSERT' then title:='Novo chamado';
 else
  if new.data->'timeline' is not distinct from old.data->'timeline' and coalesce(new.data->'observerIds','[]'::jsonb)=coalesce(old.data->'observerIds','[]'::jsonb) then return new; end if;
  entry:=new.data->'timeline'->-1;
  if entry->>'type'='internal' then return new; end if;
  title:=case when new.data->>'status' is distinct from old.data->>'status' then 'Chamado atualizado' when assigned is distinct from old.data->>'assignedTechId' then 'Chamado atribuído' when coalesce(new.data->'observerIds','[]'::jsonb) is distinct from coalesce(old.data->'observerIds','[]'::jsonb) then 'Observadores atualizados' else 'Nova resposta' end;
 end if;
 for target in select p.id from public.profiles p where p.active and p.id<>actor and (
   p.id=new.requester_id or coalesce(new.data->'observerIds','[]'::jsonb) ? p.id::text or p.id::text=assigned or ((assigned is null or tg_op='INSERT') and p.role in ('tecnico','admin','super_admin'))
 ) loop
  insert into public.notifications(id,user_id,sender_id,data) values('ntf_'||gen_random_uuid(),target,actor,jsonb_build_object('userId',target,'title',title||' • '||proto,'message','Há uma atualização no seu chamado. Abra o BravaDesk para consultar.','ticketId',tid,'protocol',proto,'read',false,'type','info','createdAt',now()));
 end loop;
 return new;
end $$;
drop trigger if exists bd_notify_ticket on public.tickets;
create trigger bd_notify_ticket after insert or update on public.tickets for each row execute function public.bd_notify_ticket();

notify pgrst, 'reload schema';
commit;
