BEGIN;
-- New pending cycles start at migration for pre-existing pending tickets.
CREATE TABLE IF NOT EXISTS public.bd083_pending(ticket_id text PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE, status text NOT NULL, next_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.bd083_reminders(id int PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT true, hours int NOT NULL DEFAULT 24 CHECK(hours IN (12,24,48,72)), reply boolean NOT NULL DEFAULT true, approval boolean NOT NULL DEFAULT true, internal boolean NOT NULL DEFAULT true, weekends boolean NOT NULL DEFAULT true);
INSERT INTO public.bd083_reminders(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE public.bd083_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd083_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd083_pending,public.bd083_reminders FROM public,anon,authenticated;
GRANT SELECT,UPDATE ON public.bd083_reminders TO authenticated;
DROP POLICY IF EXISTS bd083_reminder_admin ON public.bd083_reminders;
CREATE POLICY bd083_reminder_admin ON public.bd083_reminders FOR ALL TO authenticated USING(public.is_mkt_admin()) WITH CHECK(public.is_mkt_admin());
CREATE OR REPLACE FUNCTION public.bd083_track_pending() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF TG_OP='UPDATE' AND NEW.data->>'status' IS NOT DISTINCT FROM OLD.data->>'status' THEN RETURN NEW; END IF;
 IF NEW.data->>'status' IN ('aguardando_solicitante','em_aprovacao') THEN
 INSERT INTO public.bd083_pending VALUES(NEW.id,NEW.data->>'status',now()+make_interval(hours=>(SELECT hours FROM public.bd083_reminders WHERE id=1))) ON CONFLICT(ticket_id) DO UPDATE SET status=excluded.status,next_at=excluded.next_at;
 ELSE DELETE FROM public.bd083_pending WHERE ticket_id=NEW.id; END IF;
 RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS bd083_track_pending ON public.tickets;
CREATE TRIGGER bd083_track_pending AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.bd083_track_pending();
INSERT INTO public.bd083_pending SELECT id,data->>'status',now()+interval '24 hours' FROM public.tickets WHERE data->>'status' IN ('aguardando_solicitante','em_aprovacao') ON CONFLICT DO NOTHING;
ALTER TABLE public.bd081_revisions ADD COLUMN IF NOT EXISTS bd083_next_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours');
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Comunicado';
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS send_push boolean NOT NULL DEFAULT false;
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS publish_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
-- Historical communications stay visible without retroactive push.
UPDATE public.bd08_announcements SET dispatched_at=created_at WHERE dispatched_at IS NULL AND NOT send_push AND publish_at<=now();
CREATE TABLE IF NOT EXISTS public.bd083_reads(announcement_id uuid REFERENCES public.bd08_announcements(id) ON DELETE CASCADE,user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(announcement_id,user_id));
ALTER TABLE public.bd083_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd083_reads FROM public,anon,authenticated;
GRANT SELECT,INSERT ON public.bd083_reads TO authenticated;
CREATE OR REPLACE FUNCTION public.bd083_matches(aud text,dep text,person uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=person AND p.active AND (aud='all' OR (aud='department' AND p.data->>'department'=dep) OR (aud='staff' AND p.role IN ('tecnico','admin','super_admin')) OR (aud='admin' AND p.role IN ('admin','super_admin')) OR (aud='requesters' AND p.role='solicitante')));
$fn$;
REVOKE ALL ON FUNCTION public.bd083_matches(text,text,uuid) FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bd083_visible(aud text,dep text,pub timestamptz,exp timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT public.is_mkt_admin() OR (pub<=now() AND (exp IS NULL OR exp>now()) AND public.bd083_matches(aud,dep,auth.uid()));
$fn$;
REVOKE ALL ON FUNCTION public.bd083_visible(text,text,timestamptz,timestamptz) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bd083_visible(text,text,timestamptz,timestamptz) TO authenticated;
DROP POLICY IF EXISTS bd08_announcements_read ON public.bd08_announcements;
CREATE POLICY bd08_announcements_read ON public.bd08_announcements FOR SELECT TO authenticated USING(public.bd083_visible(audience,department,publish_at,expires_at));
DROP POLICY IF EXISTS bd08_announcements_write ON public.bd08_announcements;
CREATE POLICY bd08_announcements_write ON public.bd08_announcements FOR INSERT TO authenticated WITH CHECK(public.is_mkt_admin() AND audience IN ('all','department','staff','admin','requesters') AND length(trim(title)) BETWEEN 1 AND 120 AND (audience<>'department' OR nullif(trim(department),'') IS NOT NULL) AND (expires_at IS NULL OR expires_at>publish_at) AND dispatched_at IS NULL);
DROP POLICY IF EXISTS bd083_reads_select ON public.bd083_reads;
CREATE POLICY bd083_reads_select ON public.bd083_reads FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_mkt_admin());
DROP POLICY IF EXISTS bd083_reads_insert ON public.bd083_reads;
CREATE POLICY bd083_reads_insert ON public.bd083_reads FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.bd08_announcements a WHERE a.id=announcement_id AND a.publish_at<=now() AND (a.expires_at IS NULL OR a.expires_at>now())));
CREATE OR REPLACE FUNCTION public.bd083_run_jobs() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE c public.bd083_reminders%ROWTYPE; p record; a public.bd08_announcements%ROWTYPE; target uuid; n int:=0; m int:=0; ts timestamptz:=now();
BEGIN
 IF NOT pg_try_advisory_xact_lock(810083::bigint) THEN RETURN jsonb_build_object('busy',true); END IF;
 SELECT * INTO c FROM public.bd083_reminders WHERE id=1;
 FOR a IN SELECT * FROM public.bd08_announcements WHERE dispatched_at IS NULL AND publish_at<=ts AND (expires_at IS NULL OR expires_at>ts) FOR UPDATE SKIP LOCKED LOOP
 IF a.send_push THEN
 FOR target IN SELECT id FROM public.profiles WHERE public.bd083_matches(a.audience,a.department,id) LOOP
 PERFORM public.bd081_notify(target,NULL,NULL,NULL,a.title,'Novo comunicado disponível no BravaDesk.');
 END LOOP;
 END IF;
 UPDATE public.bd08_announcements SET dispatched_at=ts WHERE id=a.id; n:=n+1;
 END LOOP;
 IF c.enabled AND (c.weekends OR (extract(isodow FROM ts AT TIME ZONE 'America/Bahia')<6 AND NOT EXISTS(SELECT 1 FROM public.bd08_config WHERE id=1 AND coalesce(data->'holidays','[]'::jsonb) ? (ts AT TIME ZONE 'America/Bahia')::date::text))) THEN
 FOR p IN SELECT q.ticket_id,q.status,t.requester_id,t.data FROM public.bd083_pending q JOIN public.tickets t ON t.id=q.ticket_id WHERE q.next_at<=ts AND t.data->>'status'=q.status AND ((q.status='aguardando_solicitante' AND c.reply) OR (q.status='em_aprovacao' AND c.approval)) FOR UPDATE OF t SKIP LOCKED LOOP
 PERFORM public.bd081_notify(p.requester_id,NULL,p.ticket_id,p.data->>'protocol',CASE p.status WHEN 'em_aprovacao' THEN 'Aprovação pendente' ELSE 'Resposta pendente' END,'O chamado '||coalesce(p.data->>'protocol',p.ticket_id)||' aguarda sua ação.');
 UPDATE public.bd083_pending SET next_at=ts+make_interval(hours=>c.hours) WHERE ticket_id=p.ticket_id; m:=m+1;
 END LOOP;
 IF c.internal THEN
 FOR p IN SELECT r.id,r.ticket_id,t.data FROM public.bd081_revisions r JOIN public.tickets t ON t.id=r.ticket_id WHERE r.state='pending' AND r.bd083_next_at<=ts AND t.data->>'status' NOT IN ('concluido','cancelado') FOR UPDATE OF t SKIP LOCKED LOOP
 FOR target IN SELECT id FROM public.profiles WHERE active AND role IN ('admin','super_admin') LOOP
 PERFORM public.bd081_notify(target,NULL,p.ticket_id,p.data->>'protocol','Revisão interna pendente','Uma entrega aguarda revisão do Marketing.');
 END LOOP;
 UPDATE public.bd081_revisions SET bd083_next_at=ts+make_interval(hours=>c.hours) WHERE id=p.id AND state='pending'; m:=m+1;
 END LOOP;
 END IF;
 END IF;
 RETURN jsonb_build_object('announcements',n,'reminders',m);
END; $fn$;
REVOKE ALL ON FUNCTION public.bd083_run_jobs() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bd083_run_jobs() TO service_role;
REVOKE ALL ON FUNCTION public.bd083_track_pending() FROM public,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
