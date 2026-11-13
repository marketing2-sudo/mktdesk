-- MIGRAÇÃO ADICIONAL: execute depois do schema.sql original.
-- Não remove tabelas nem dados existentes.
-- Garante que a seleção do serviço e o prazo do chamado sejam definidos pelo banco.
-- ATENÇÃO: protege apenas chamados NOVOS; os antigos mantêm seu SLA histórico.
create or replace function public.mktdesk_validate_new_ticket_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  catalogue jsonb;
  service jsonb;
  chosen text;
  hours numeric;
begin
  if new.data->>'requesterId' is distinct from new.requester_id::text then
    raise exception 'Solicitante do chamado inválido';
  end if;
  if new.data->>'status' is distinct from 'novo' then
    raise exception 'Novo chamado deve começar na triagem';
  end if;
  select data->'categories' into catalogue from public.app_settings where id=1;
  -- Compatibilidade com a instalação inicial: enquanto o administrador
  -- não salvar o catálogo, a interface utiliza as categorias padrão.
  if catalogue is null or jsonb_typeof(catalogue) <> 'array' then return new; end if;
  chosen := new.data->>'categoryId';
  select item into service
  from jsonb_array_elements(catalogue) as item
  where item->>'id'=chosen and coalesce(item->>'active','true')='true'
  limit 1;
  if service is null then raise exception 'Serviço inexistente ou desativado'; end if;
  hours := (service->>'slaHours')::numeric;
  if hours is null or hours < 1 or hours > 8760 then
    raise exception 'Prazo SLA inválido para o serviço';
  end if;
  new.data := jsonb_set(new.data, '{slaHours}', to_jsonb(hours));
  new.data := jsonb_set(new.data, '{categoryName}', to_jsonb(service->>'name'));
  return new;
end;
$$;

drop trigger if exists trg_mktdesk_validate_service on public.tickets;
create trigger trg_mktdesk_validate_service
before insert on public.tickets
for each row execute function public.mktdesk_validate_new_ticket_service();
