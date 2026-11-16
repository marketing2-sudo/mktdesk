BEGIN;
-- Requires v0.8 Beta. No backfill: existing tickets keep contractual SLA.
-- Keep the existing service list; seed only when it was never saved.
UPDATE public.app_settings SET data=jsonb_set(data,'{categories}', $catalog$[{"id": "cat-design", "name": "Design & Peças Gráficas", "slaHours": 24, "description": "Banners, posts sociais, folders, flyers e identidade visual"}, {"id": "cat-campanhas", "name": "Campanhas & Tráfego Pago", "slaHours": 48, "description": "Meta Ads, Google Ads, LinkedIn Ads e lançamentos"}, {"id": "cat-conteudo", "name": "Conteúdo, Copy & Social Media", "slaHours": 24, "description": "Roteiros, artigos, e-mail marketing e calendário editorial"}, {"id": "cat-comercial", "name": "Apresentações & Materiais Comerciais", "slaHours": 36, "description": "Pitch decks, propostas comerciais, catálogos e one-pagers"}, {"id": "cat-eventos", "name": "Eventos & Endomarketing", "slaHours": 72, "description": "Feiras, webinars, convenções, comunicados internos e ativações"}, {"id": "cat-web", "name": "Web, Landing Pages & CRM", "slaHours": 72, "description": "Páginas de captura, formulários, automações e ajustes no site"}, {"id": "cat-brindes", "name": "Brindes & Produção Gráfica", "slaHours": 96, "description": "Orçamentos gráficos, kits corporativos e materiais físicos"}, {"id": "cat-outros", "name": "Outras Demandas de Marketing", "slaHours": 48, "description": "Solicitações especiais não listadas nas categorias anteriores"}]$catalog$::jsonb) WHERE id=1 AND (data->'categories' IS NULL OR data->'categories'='null'::jsonb);

CREATE OR REPLACE FUNCTION public.bd081_schedule() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('days',coalesce(data->'days','[1,2,3,4,5]'::jsonb),'start',coalesce(data->>'start','09:00'),'lunch',coalesce(data->>'lunch','12:00'),'back',coalesce(data->>'back','13:00'),'end',coalesce(data->>'end','17:30'),'holidays',coalesce(data->'holidays','[]'::jsonb)) FROM public.bd08_config WHERE id=1;
$$;
REVOKE ALL ON FUNCTION public.bd081_schedule() FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bd081_business_ms(a timestamptz,b timestamptz,c jsonb) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(greatest(0,extract(epoch from least(b,(d::date+w.hi) AT TIME ZONE 'America/Bahia')-greatest(a,(d::date+w.lo) AT TIME ZONE 'America/Bahia')))*1000),0)
 FROM pg_catalog.generate_series((a AT TIME ZONE 'America/Bahia')::date::timestamp,(b AT TIME ZONE 'America/Bahia')::date::timestamp,interval '1 day') d
 CROSS JOIN LATERAL (VALUES ((c->>'start')::time,(c->>'lunch')::time),((c->>'back')::time,(c->>'end')::time)) w(lo,hi)
 WHERE c->'days' @> jsonb_build_array(extract(dow from d)::int) AND NOT (c->'holidays' ? to_char(d,'YYYY-MM-DD')) AND b>a;
$$;
CREATE OR REPLACE FUNCTION public.bd081_validate_schedule() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=NEW.data;
BEGIN
 IF c ? 'days' AND (jsonb_typeof(c->'days')<>'array' OR jsonb_array_length(c->'days')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(c->'days') v WHERE v NOT IN ('0','1','2','3','4','5','6'))) THEN RAISE EXCEPTION 'Dias inválidos'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(c) q WHERE q.key IN ('start','end','lunch','back') AND q.value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'Horário inválido; use HH:MM'; END IF;
 IF NOT (coalesce(c->>'start','09:00')::time < coalesce(c->>'lunch','12:00')::time AND coalesce(c->>'lunch','12:00')::time <= coalesce(c->>'back','13:00')::time AND coalesce(c->>'back','13:00')::time < coalesce(c->>'end','17:30')::time) THEN RAISE EXCEPTION 'Expediente inválido'; END IF;
 IF c ? 'holidays' AND (jsonb_typeof(c->'holidays')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(c->'holidays') h WHERE h !~ '^\d{4}-\d{2}-\d{2}$' OR to_char(h::date,'YYYY-MM-DD')<>h)) THEN RAISE EXCEPTION 'Feriados inválidos'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(c) q WHERE q.key IN ('days','start','lunch','back','end','holidays') AND q.value='null'::jsonb) THEN RAISE EXCEPTION 'Campos de expediente nulos'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bd081_schedule_check ON public.bd08_config;
CREATE TRIGGER bd081_schedule_check BEFORE INSERT OR UPDATE ON public.bd08_config FOR EACH ROW EXECUTE FUNCTION public.bd081_validate_schedule();
CREATE OR REPLACE FUNCTION public.bd081_ticket_clock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb; p numeric; ts timestamptz:=now();
BEGIN
 IF TG_OP='INSERT' THEN
  c:=public.bd081_schedule();
  IF c IS NULL OR jsonb_typeof(c->'days')<>'array' OR jsonb_array_length(c->'days')=0 THEN RAISE EXCEPTION 'Configure o expediente antes de abrir chamados'; END IF;
  IF NEW.data->>'status' IS DISTINCT FROM 'novo' OR NEW.data->>'assignedTechId' IS NOT NULL THEN RAISE EXCEPTION 'Novo chamado deve iniciar na triagem sem atribuição'; END IF;
  NEW.data:=NEW.data||jsonb_build_object('businessSchedule',c,'businessPausedMs',0,'createdAt',ts,'completedAt',null,'sacPausedAt',null,'totalPausedMs',0);
  RETURN NEW;
 END IF;
 c:=OLD.data->'businessSchedule';
 IF c IS NULL OR c='null'::jsonb THEN NEW.data:=NEW.data-'businessSchedule'-'businessPausedMs'; RETURN NEW; END IF;
 p:=coalesce((OLD.data->>'businessPausedMs')::numeric,0);
 IF OLD.data->>'status'='aguardando_solicitante' AND NEW.data->>'status' IS DISTINCT FROM OLD.data->>'status' THEN p:=p+public.bd081_business_ms((OLD.data->>'sacPausedAt')::timestamptz,ts,c); END IF;
 IF NEW.data->>'status'='aguardando_solicitante' THEN NEW.data:=NEW.data||jsonb_build_object('sacPausedAt',CASE WHEN OLD.data->>'status'='aguardando_solicitante' THEN (OLD.data->>'sacPausedAt')::timestamptz ELSE ts END); END IF;
 IF NEW.data->>'status' IN ('concluido','cancelado') THEN NEW.data:=NEW.data||jsonb_build_object('completedAt',CASE WHEN OLD.data->>'status'=NEW.data->>'status' THEN coalesce((OLD.data->>'completedAt')::timestamptz,ts) ELSE ts END); ELSE NEW.data:=NEW.data||jsonb_build_object('completedAt',null); END IF;
 IF NEW.data->>'status'<>'aguardando_solicitante' THEN NEW.data:=NEW.data||jsonb_build_object('sacPausedAt',null); END IF;
 IF OLD.data->>'status' IN ('concluido','cancelado') AND NEW.data->>'status'='em_atendimento' THEN p:=p+public.bd081_business_ms((OLD.data->>'completedAt')::timestamptz,ts,c); NEW.data:=NEW.data||jsonb_build_object('completedAt',null); END IF;
 NEW.data:=NEW.data||jsonb_build_object('businessSchedule',c,'businessPausedMs',p,'createdAt',OLD.data->'createdAt');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_bd081_clock ON public.tickets;
CREATE TRIGGER zz_bd081_clock BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.bd081_ticket_clock();

-- Private revision records: draft material is never exposed to observers/requesters.
CREATE TABLE IF NOT EXISTS public.bd081_revisions (
 id uuid primary key default gen_random_uuid(), ticket_id text not null references public.tickets(id) on delete cascade,
 version integer not null, author uuid not null, notes text not null, link text not null,
 state text not null check(state in ('pending','approved','rejected','withdrawn')),
 created_at timestamptz not null default now(), reviewed_at timestamptz, reviewer uuid, reason text,
 unique(ticket_id,version)
);
ALTER TABLE public.bd081_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd081_revisions FROM public,anon,authenticated;
GRANT SELECT ON public.bd081_revisions TO authenticated;
DROP POLICY IF EXISTS bd081_revision_read ON public.bd081_revisions;
CREATE POLICY bd081_revision_read ON public.bd081_revisions FOR SELECT TO authenticated USING(public.is_mkt_staff());
CREATE UNIQUE INDEX IF NOT EXISTS bd081_one_pending ON public.bd081_revisions(ticket_id) WHERE state='pending';
-- Generic notifications use the existing notification table. Message content is not leaked.
CREATE OR REPLACE FUNCTION public.bd081_notify(target uuid,actor uuid,tid text,proto text,title text,body text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.notifications(id,user_id,sender_id,data)
 SELECT 'ntf_'||gen_random_uuid(),p.id,actor,jsonb_build_object('userId',p.id,'title',title,'message',body,'ticketId',tid,'protocol',proto,'read',false,'type','info','createdAt',now(),'bd081Automated',actor IS NULL)
 FROM public.profiles p WHERE p.id=target AND p.active AND p.id IS DISTINCT FROM actor;
$$;
REVOKE ALL ON FUNCTION public.bd081_notify(uuid,uuid,text,text,text,text) FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bd081_review(tid text,action text,notes text DEFAULT '',link text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tickets%ROWTYPE; r public.bd081_revisions%ROWTYPE; a public.profiles%ROWTYPE; target uuid; ts timestamptz:=now(); e jsonb; d jsonb; v integer;
BEGIN
 IF NOT public.is_mkt_staff() THEN RAISE EXCEPTION 'Somente Marketing'; END IF;
 SELECT * INTO a FROM public.profiles WHERE id=auth.uid();
 SELECT * INTO t FROM public.tickets WHERE id=tid FOR UPDATE;
 IF NOT FOUND OR t.data->>'status' IN ('concluido','cancelado') THEN RAISE EXCEPTION 'Chamado indisponível'; END IF;
 SELECT * INTO r FROM public.bd081_revisions WHERE ticket_id=tid AND state='pending' FOR UPDATE;
 IF action='submit' THEN
  IF r.id IS NOT NULL THEN RAISE EXCEPTION 'Já existe revisão pendente'; END IF;
  IF t.data->>'status' NOT IN ('novo','em_atendimento') THEN RAISE EXCEPTION 'Retome o atendimento antes de enviar material'; END IF;
  IF length(trim(coalesce(notes,''))) NOT BETWEEN 1 AND 10000 OR length(coalesce(link,''))>4000 OR coalesce(link,'') !~ '^https://(drive\.google\.com|docs\.google\.com)/' THEN RAISE EXCEPTION 'Informe as observações e um link HTTPS do Google Drive'; END IF;
  SELECT coalesce(max(version),0)+1 INTO v FROM public.bd081_revisions WHERE ticket_id=tid;
  INSERT INTO public.bd081_revisions(ticket_id,version,author,notes,link,state) VALUES(tid,v,a.id,trim(notes),trim(link),'pending');
  UPDATE public.tickets SET data=t.data||jsonb_build_object('status','em_atendimento','assignedTechId',coalesce(t.data->>'assignedTechId',a.id::text),'assignedTechName',coalesce(t.data->>'assignedTechName',a.data->>'name'),'firstResponseAt',coalesce(t.data->>'firstResponseAt',ts::text),'updatedAt',ts) WHERE id=tid;
  FOR target IN SELECT id FROM public.profiles WHERE active AND role IN ('admin','super_admin') LOOP
   PERFORM public.bd081_notify(target,a.id,tid,t.data->>'protocol','Revisão interna pendente','Há uma entrega aguardando revisão do Marketing.');
  END LOOP;
 ELSIF action IN ('approve','reject','withdraw') THEN
  IF r.id IS NULL THEN RAISE EXCEPTION 'Não há revisão pendente'; END IF;
  IF action='withdraw' THEN
   IF a.id<>r.author AND NOT public.is_mkt_admin() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  ELSIF NOT public.is_mkt_admin() THEN RAISE EXCEPTION 'Somente administrador'; END IF;
  IF action<>'approve' AND length(trim(coalesce(notes,''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Informe a justificativa'; END IF;
  IF action='approve' THEN
   IF t.data->>'status' NOT IN ('novo','em_atendimento') THEN RAISE EXCEPTION 'Retome o atendimento antes de aprovar'; END IF;
   UPDATE public.bd081_revisions SET state='approved',reviewer=a.id,reviewed_at=ts WHERE id=r.id;
   e:=jsonb_build_object('id','msg_'||gen_random_uuid(),'type','delivery','authorId',a.id,'authorName',a.data->>'name','authorRole',a.role,'content',r.notes,'deliveryLink',r.link,'version',r.version,'createdAt',ts);
   d:=t.data||jsonb_build_object('status','em_aprovacao','deliveryLink',r.link,'updatedAt',ts,'firstResponseAt',coalesce(t.data->'firstResponseAt','null'::jsonb),'timeline',coalesce(t.data->'timeline','[]'::jsonb)||jsonb_build_array(e));
   UPDATE public.tickets SET data=d WHERE id=tid;
  ELSE
   UPDATE public.bd081_revisions SET state=CASE action WHEN 'reject' THEN 'rejected' ELSE 'withdrawn' END,reviewer=a.id,reviewed_at=ts,reason=trim(notes) WHERE id=r.id;
   PERFORM public.bd081_notify(r.author,a.id,tid,t.data->>'protocol','Revisão interna atualizada','Consulte o histórico de revisão no BravaDesk.');
  END IF;
 ELSE RAISE EXCEPTION 'Ação inválida'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bd081_review(text,text,text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bd081_review(text,text,text,text) TO authenticated;
-- Lifecycle: explicit cancellation and reopening; requester may change only own tickets.
CREATE OR REPLACE FUNCTION public.protect_requester_ticket_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE os text:=OLD.data->>'status'; ns text:=NEW.data->>'status'; last_entry jsonb:=NEW.data->'timeline'->-1; allowed text[]:=ARRAY['timeline','updatedAt','status','sacPausedAt','totalPausedMs','completedAt','csatRating','csatComment','observerIds'];
BEGIN
 IF NEW.requester_id IS DISTINCT FROM OLD.requester_id THEN RAISE EXCEPTION 'Não é permitido trocar o solicitante'; END IF;
 IF public.is_mkt_staff() THEN RETURN NEW; END IF;
 IF auth.uid() IS DISTINCT FROM OLD.requester_id THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF (OLD.data-allowed) IS DISTINCT FROM (NEW.data-allowed) THEN RAISE EXCEPTION 'Não é permitido alterar campos internos do chamado'; END IF;
 IF ns IS DISTINCT FROM os AND NOT ((os='aguardando_solicitante' AND ns='em_atendimento') OR (os='em_aprovacao' AND ns IN ('em_atendimento','concluido')) OR (os NOT IN ('concluido','cancelado') AND ns='cancelado' AND last_entry->>'type'='cancelled' AND length(trim(coalesce(last_entry->>'content','')))>0) OR (os IN ('concluido','cancelado') AND ns='em_atendimento' AND last_entry->>'type'='reopened' AND length(trim(coalesce(last_entry->>'content','')))>0)) THEN RAISE EXCEPTION 'Transição de status não permitida'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.bd081_lifecycle(tid text,operation text,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tickets%ROWTYPE; a public.profiles%ROWTYPE; ns text; ts timestamptz:=now(); delta numeric:=0; e jsonb;
BEGIN
 IF NOT public.is_mkt_active() OR length(trim(coalesce(reason,''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Informe uma justificativa'; END IF;
 SELECT * INTO a FROM public.profiles WHERE id=auth.uid();
 SELECT * INTO t FROM public.tickets WHERE id=tid FOR UPDATE;
 IF NOT FOUND OR (NOT public.is_mkt_staff() AND t.requester_id<>a.id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF operation='cancel' AND t.data->>'status' NOT IN ('concluido','cancelado') THEN
  ns:='cancelado'; IF t.data->>'status'='aguardando_solicitante' THEN delta:=greatest(0,extract(epoch from ts-(t.data->>'sacPausedAt')::timestamptz)*1000); END IF;
 ELSIF operation='reopen' AND t.data->>'status' IN ('concluido','cancelado') THEN
  ns:='em_atendimento'; delta:=greatest(0,extract(epoch from ts-(t.data->>'completedAt')::timestamptz)*1000);
 ELSE RAISE EXCEPTION 'Ação não permitida para este status'; END IF;
 e:=jsonb_build_object('id','msg_'||gen_random_uuid(),'type',CASE operation WHEN 'cancel' THEN 'cancelled' ELSE 'reopened' END,'authorId',a.id,'authorName',a.data->>'name','authorRole',a.role,'content',trim(reason),'createdAt',ts);
 UPDATE public.tickets SET data=t.data||jsonb_build_object('status',ns,'completedAt',CASE WHEN ns='cancelado' THEN ts ELSE NULL END,'sacPausedAt',null,'totalPausedMs',coalesce((t.data->>'totalPausedMs')::numeric,0)+delta,'csatRating',null,'csatComment','','timeline',coalesce(t.data->'timeline','[]'::jsonb)||jsonb_build_array(e),'updatedAt',ts) WHERE id=tid;
 UPDATE public.bd081_revisions SET state='withdrawn',reviewer=a.id,reviewed_at=ts,reason='Ciclo encerrado ou reaberto' WHERE ticket_id=tid AND state='pending';
END $$;
REVOKE ALL ON FUNCTION public.bd081_lifecycle(text,text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bd081_lifecycle(text,text,text) TO authenticated;
-- Prevent bypass of internal approval by old frontend or direct updates.
CREATE OR REPLACE FUNCTION public.bd081_guard_workflow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb:=NEW.data->'timeline'->-1; os text:=OLD.data->>'status'; ns text:=NEW.data->>'status';
BEGIN
 IF ns='em_aprovacao' AND (os IS DISTINCT FROM ns OR OLD.data->>'deliveryLink' IS DISTINCT FROM NEW.data->>'deliveryLink') THEN
  IF NOT public.is_mkt_admin() OR NOT EXISTS(SELECT 1 FROM public.bd081_revisions r WHERE r.ticket_id=NEW.id AND r.state='approved' AND r.link=NEW.data->>'deliveryLink' AND r.version::text=e->>'version' AND r.reviewed_at=now()) THEN RAISE EXCEPTION 'Use a aprovação interna do Marketing'; END IF;
 END IF;
 IF ns IS DISTINCT FROM os AND (ns='cancelado' OR os IN ('cancelado','concluido')) THEN
  IF NOT ((ns='cancelado' AND os NOT IN ('cancelado','concluido') AND e->>'type'='cancelled') OR (ns='em_atendimento' AND os IN ('cancelado','concluido') AND e->>'type'='reopened')) OR length(trim(coalesce(e->>'content','')))=0 THEN RAISE EXCEPTION 'Use a ação de cancelamento ou reabertura'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_bd081_workflow ON public.tickets;
CREATE TRIGGER zz_bd081_workflow BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.bd081_guard_workflow();
-- Mention tokens are exact @email, restricted to participants (or team for private notes).
CREATE TABLE IF NOT EXISTS public.bd081_mentions(message_id text, user_id uuid, PRIMARY KEY(message_id,user_id));
ALTER TABLE public.bd081_mentions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd081_mentions FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bd081_handle_mentions(tid text,e jsonb,internal boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tickets%ROWTYPE; p public.profiles%ROWTYPE; email text; actor uuid:=auth.uid(); n integer;
BEGIN
 IF actor IS NULL OR e->>'authorId' IS DISTINCT FROM actor::text OR coalesce(e->>'id','')='' THEN RETURN; END IF;
 SELECT * INTO t FROM public.tickets WHERE id=tid;
 FOR email IN SELECT lower(m[1]) FROM regexp_matches(coalesce(e->>'content',''),'@([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})','g') m LOOP
  FOR p IN SELECT * FROM public.profiles q WHERE q.active AND lower(q.data->>'email')=email AND q.id<>actor AND (q.role IN ('tecnico','admin','super_admin') OR (NOT internal AND (q.id=t.requester_id OR coalesce(t.data->'observerIds','[]'::jsonb) ? q.id::text))) LOOP
   INSERT INTO public.bd081_mentions VALUES(e->>'id',p.id) ON CONFLICT DO NOTHING; GET DIAGNOSTICS n=ROW_COUNT;
   IF n=1 THEN PERFORM public.bd081_notify(p.id,actor,tid,t.data->>'protocol','Você foi mencionado','Abra o chamado para consultar a menção.'); END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.bd081_handle_mentions(text,jsonb,boolean) FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bd081_public_mentions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb:=NEW.data->'timeline'->-1;
BEGIN IF e->>'type'='public' AND e IS DISTINCT FROM OLD.data->'timeline'->-1 THEN PERFORM public.bd081_handle_mentions(NEW.id,e,false); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS bd081_public_mentions ON public.tickets;
CREATE TRIGGER bd081_public_mentions AFTER UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.bd081_public_mentions();
CREATE OR REPLACE FUNCTION public.bd081_private_mentions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM public.bd081_handle_mentions(NEW.ticket_id,NEW.entry,true); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS bd081_private_mentions ON public.bd_private_notes;
CREATE TRIGGER bd081_private_mentions AFTER INSERT ON public.bd_private_notes FOR EACH ROW EXECUTE FUNCTION public.bd081_private_mentions();
-- Recurrence templates are created from a real ticket; private data and attachments are not copied.
CREATE TABLE IF NOT EXISTS public.bd081_recurring (
 id uuid primary key default gen_random_uuid(), source_id text not null references public.tickets(id) on delete cascade,
 created_by uuid not null, frequency text not null check(frequency in ('daily','weekly','monthly')),
 next_run timestamptz not null, anchor_day int not null check(anchor_day between 1 and 31), enabled boolean not null default true,
 last_run timestamptz, last_error text, created_at timestamptz not null default now()
);
ALTER TABLE public.bd081_recurring ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd081_recurring FROM public,anon,authenticated;
GRANT SELECT ON public.bd081_recurring TO authenticated;
DROP POLICY IF EXISTS bd081_recurring_read ON public.bd081_recurring;
CREATE POLICY bd081_recurring_read ON public.bd081_recurring FOR SELECT TO authenticated USING(public.is_mkt_admin());
CREATE OR REPLACE FUNCTION public.bd081_recurrence_create(source text,freq text,first_run timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
 IF NOT public.is_mkt_admin() THEN RAISE EXCEPTION 'Somente administradores'; END IF;
 IF freq NOT IN ('daily','weekly','monthly') OR first_run IS NULL OR first_run<=now() OR NOT EXISTS(SELECT 1 FROM public.tickets WHERE id=source) THEN RAISE EXCEPTION 'Modelo, frequência ou data inválidos'; END IF;
 INSERT INTO public.bd081_recurring(source_id,created_by,frequency,next_run,anchor_day) VALUES(source,auth.uid(),freq,first_run,extract(day from first_run AT TIME ZONE 'America/Bahia')::int) RETURNING id INTO rid;
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.bd081_recurrence_toggle(rid uuid,enabled_value boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_mkt_admin() THEN RAISE EXCEPTION 'Somente administradores'; END IF;
 UPDATE public.bd081_recurring SET enabled=enabled_value,last_error=NULL WHERE id=rid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bd081_recurrence_create(text,text,timestamptz),public.bd081_recurrence_toggle(uuid,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bd081_recurrence_create(text,text,timestamptz),public.bd081_recurrence_toggle(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.bd081_next_run(previous timestamptz,freq text,anchor int) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE local_at timestamp:=previous AT TIME ZONE 'America/Bahia'; next_month date; next_day int;
BEGIN
 IF freq='daily' THEN RETURN (local_at+interval '1 day') AT TIME ZONE 'America/Bahia'; END IF;
 IF freq='weekly' THEN RETURN (local_at+interval '7 days') AT TIME ZONE 'America/Bahia'; END IF;
 next_month:=(date_trunc('month',local_at)+interval '1 month')::date;
 next_day:=least(anchor,extract(day from next_month+interval '1 month - 1 day')::int);
 RETURN ((next_month+(next_day-1))+local_at::time) AT TIME ZONE 'America/Bahia';
END $$;
-- One notification per ticket and threshold; reopening does not duplicate prior thresholds.
CREATE TABLE IF NOT EXISTS public.bd081_alerts(ticket_id text references public.tickets(id) on delete cascade, threshold int check(threshold in (75,90,100)), created_at timestamptz not null default now(), primary key(ticket_id,threshold));
ALTER TABLE public.bd081_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd081_alerts FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bd081_run_jobs() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.bd081_recurring%ROWTYPE; t public.tickets%ROWTYPE; person public.profiles%ROWTYPE; d jsonb; c jsonb; item jsonb; new_id text; proto text; target uuid; edge int; n int; count_new int:=0; count_alert int:=0; elapsed numeric; period_ms numeric; ts timestamptz:=now(); next_at timestamptz;
BEGIN
 IF NOT pg_try_advisory_xact_lock(810081::bigint) THEN RETURN jsonb_build_object('busy',true); END IF;
 FOR r IN SELECT * FROM public.bd081_recurring WHERE enabled AND next_run<=ts ORDER BY next_run LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   SELECT * INTO t FROM public.tickets WHERE id=r.source_id;
   SELECT * INTO person FROM public.profiles WHERE id=t.requester_id AND active;
   IF person.id IS NULL THEN RAISE EXCEPTION 'Solicitante inativo'; END IF;
   SELECT data->'categories' INTO c FROM public.app_settings WHERE id=1;
   SELECT v INTO item FROM jsonb_array_elements(coalesce(c,'[]'::jsonb)) v WHERE v->>'id'=t.data->>'categoryId' AND coalesce(v->>'active','true')='true' LIMIT 1;
   IF item IS NULL THEN RAISE EXCEPTION 'Serviço não cadastrado ou inativo'; END IF;
   new_id:='tkt_'||gen_random_uuid();
   d:=jsonb_build_object('id',new_id,'title',t.data->>'title','categoryId',item->>'id','categoryName',item->>'name','slaHours',(item->>'slaHours')::numeric,'priority',coalesce(t.data->>'priority','normal'),'department',t.data->>'department','observerIds','[]'::jsonb,'objective',coalesce(t.data->>'objective',''),'description',coalesce(t.data->>'description',''),'referenceLink','','status','novo','requesterId',person.id,'requesterName',person.data->>'name','requesterEmail',person.data->>'email','assignedTechId',null,'assignedTechName',null,'createdAt',ts,'updatedAt',ts,'firstResponseAt',null,'sacPausedAt',null,'totalPausedMs',0,'completedAt',null,'deliveryLink','','csatRating',null,'csatComment','','timeline',jsonb_build_array(jsonb_build_object('id','msg_'||gen_random_uuid(),'type','system','authorId',person.id,'authorName','BravaDesk','authorRole','sistema','content','Demanda gerada automaticamente por recorrência.','createdAt',ts)));
   INSERT INTO public.tickets(id,requester_id,data) VALUES(new_id,person.id,d) RETURNING data->>'protocol' INTO proto;
   FOR target IN SELECT id FROM public.profiles WHERE active AND (id=person.id OR role IN ('admin','super_admin','tecnico')) LOOP
    PERFORM public.bd081_notify(target,NULL,new_id,proto,'Nova demanda recorrente','Chamado criado automaticamente.');
   END LOOP;
   -- Skip missed dates rather than generating a flood of historical tickets.
   next_at:=public.bd081_next_run(r.next_run,r.frequency,r.anchor_day);
   WHILE next_at<=ts LOOP next_at:=public.bd081_next_run(next_at,r.frequency,r.anchor_day); END LOOP;
   UPDATE public.bd081_recurring SET next_run=next_at,last_run=ts,last_error=NULL WHERE id=r.id;
   count_new:=count_new+1;
  EXCEPTION WHEN OTHERS THEN UPDATE public.bd081_recurring SET enabled=false,last_error=left(SQLERRM,500) WHERE id=r.id;
  END;
 END LOOP;
 FOR t IN SELECT * FROM public.tickets WHERE data->>'status' IN ('novo','em_atendimento','em_aprovacao') LOOP
  BEGIN
  c:=t.data->'businessSchedule';
  IF c IS NOT NULL AND c<>'null'::jsonb THEN elapsed:=greatest(0,public.bd081_business_ms((t.data->>'createdAt')::timestamptz,ts,c)-coalesce((t.data->>'businessPausedMs')::numeric,0));
  ELSE elapsed:=greatest(0,extract(epoch from ts-(t.data->>'createdAt')::timestamptz)*1000-coalesce((t.data->>'totalPausedMs')::numeric,0)); END IF;
  period_ms:=coalesce((t.data->>'slaHours')::numeric,24)*3600000;
  IF period_ms<=0 THEN CONTINUE; END IF;
  FOREACH edge IN ARRAY ARRAY[75,90,100] LOOP
   IF elapsed*100>=period_ms*edge THEN
    INSERT INTO public.bd081_alerts(ticket_id,threshold) VALUES(t.id,edge) ON CONFLICT DO NOTHING; GET DIAGNOSTICS n=ROW_COUNT;
    IF n=1 THEN
     FOR target IN SELECT id FROM public.profiles WHERE active AND role IN ('admin','super_admin','tecnico') AND (id::text=t.data->>'assignedTechId' OR (role IN ('admin','super_admin') AND NOT EXISTS(SELECT 1 FROM public.profiles ap WHERE ap.id::text=t.data->>'assignedTechId' AND ap.active AND ap.role IN ('admin','super_admin','tecnico')))) LOOP
      PERFORM public.bd081_notify(target,NULL,t.id,t.data->>'protocol','SLA atingiu '||edge||'%','Consulte o prazo da demanda no BravaDesk.');
     END LOOP;
     count_alert:=count_alert+1;
    END IF;
   END IF;
  END LOOP;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Falha no alerta do chamado %: %',t.id,SQLERRM;
  END;
 END LOOP;
 RETURN jsonb_build_object('recurring',count_new,'alerts',count_alert);
END $$;
REVOKE ALL ON FUNCTION public.bd081_run_jobs() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bd081_run_jobs() TO service_role;
-- Auditing: allowlisted before/after metadata; exclude secrets and private message bodies.
CREATE OR REPLACE FUNCTION public.bd08_record_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:='{}'; b jsonb:='{}'; diff jsonb:='{}'; k text; fields text[]; rid text;
BEGIN
 IF TG_OP<>'INSERT' THEN a:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN b:=to_jsonb(NEW); END IF;
 rid:=coalesce(b->>'id',a->>'id',b->>'ticket_id',a->>'ticket_id',b->>'note_id',a->>'note_id');
 CASE TG_TABLE_NAME
 WHEN 'tickets' THEN fields:=ARRAY['status','assignedTechId','priority','slaHours','customStageId','observerIds','department','businessSchedule','businessPausedMs','deliveryLink','completedAt','sacPausedAt']; a:=coalesce(a->'data','{}'); b:=coalesce(b->'data','{}'); IF a->'timeline' IS DISTINCT FROM b->'timeline' THEN diff:=jsonb_build_object('timeline',jsonb_build_object('before',jsonb_array_length(coalesce(a->'timeline','[]'::jsonb)),'after',jsonb_array_length(coalesce(b->'timeline','[]'::jsonb)),'last_id',b->'timeline'->-1->>'id','last_type',b->'timeline'->-1->>'type')); END IF;
 WHEN 'profiles' THEN fields:=ARRAY['role','active']; a:=a||jsonb_build_object('department',a->'data'->'department','jobTitle',a->'data'->'jobTitle'); b:=b||jsonb_build_object('department',b->'data'->'department','jobTitle',b->'data'->'jobTitle'); fields:=fields||ARRAY['department','jobTitle'];
 WHEN 'app_settings' THEN fields:=ARRAY['categories','departments','customStages','allowedDomains']; a:=coalesce(a->'data','{}'); b:=coalesce(b->'data','{}');
 WHEN 'bd08_config' THEN fields:=ARRAY['days','start','lunch','back','end','holidays','checklist','replies']; a:=coalesce(a->'data','{}'); b:=coalesce(b->'data','{}');
 WHEN 'bd08_checklists' THEN fields:=ARRAY['data'];
 WHEN 'bd08_announcements' THEN fields:=ARRAY['message'];
 WHEN 'bd081_revisions' THEN fields:=ARRAY['version','author','state','reviewer','reviewed_at'];
 WHEN 'bd081_recurring' THEN fields:=ARRAY['source_id','created_by','frequency','next_run','enabled','last_run','last_error'];
 WHEN 'bd_invites' THEN fields:=ARRAY['role','created_by','expires_at','used_at','revoked'];
 ELSE fields:=ARRAY[]::text[];
 END CASE;
 FOREACH k IN ARRAY fields LOOP IF a->k IS DISTINCT FROM b->k THEN diff:=diff||jsonb_build_object(k,jsonb_build_object('before',a->k,'after',b->k)); END IF; END LOOP;
 IF TG_OP='UPDATE' AND diff='{}'::jsonb THEN RETURN NEW; END IF;
 INSERT INTO public.bd08_audit(actor,entity,record_id,action,changes) VALUES(auth.uid(),TG_TABLE_NAME,rid,TG_OP,diff);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['bd081_revisions','bd081_recurring','bd_invites','bd_private_notes'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS bd08_audit ON public.%I',t);
 EXECUTE format('CREATE TRIGGER bd08_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bd08_record_audit()',t);
END LOOP; END $$;
REVOKE ALL ON FUNCTION public.bd081_business_ms(timestamptz,timestamptz,jsonb),public.bd081_next_run(timestamptz,text,int) FROM public,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
