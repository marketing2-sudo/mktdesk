BEGIN;
-- Migration for an existing, working v0.8.2. Stop before touching data if prerequisites are missing.
DO $f$ BEGIN
 IF to_regclass('public.bd08_announcements') IS NULL OR to_regprocedure('public.bd082_public_schedule()') IS NULL OR to_regprocedure('public.bd081_run_jobs()') IS NULL THEN
  RAISE EXCEPTION 'Instale e valide as versoes 0.8.1 e 0.8.2 antes da 0.8.3';
 END IF;
END; $f$;
ALTER TABLE public.bd08_announcements ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Comunicado geral', ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'info' CHECK(kind IN ('info','important','urgent','news')), ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all' CHECK(audience IN ('all','staff','requesters','department')), ADD COLUMN IF NOT EXISTS department text, ADD COLUMN IF NOT EXISTS starts_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS ends_at timestamptz, ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS show_banner boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS published_by uuid, ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
CREATE INDEX IF NOT EXISTS bd083_scheduled_idx ON public.bd08_announcements(starts_at) WHERE dispatched_at IS NULL;
CREATE INDEX IF NOT EXISTS bd083_push_queue_idx ON public.notifications ((data->>'announcementId')) WHERE push_claimed_at IS NULL;
-- Existing communications remain visible but do not trigger a retrospective broadcast.
UPDATE public.bd08_announcements SET dispatched_at=now() WHERE dispatched_at IS NULL AND published_by IS NULL;
CREATE OR REPLACE FUNCTION public.bd083_matches(p_audience text,p_department text,p_role text,p_profile_department text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $f$
 SELECT CASE p_audience WHEN 'all' THEN true WHEN 'staff' THEN p_role IN ('admin','super_admin','tecnico') WHEN 'requesters' THEN p_role='solicitante' WHEN 'department' THEN p_department=p_profile_department ELSE false END;
$f$;
DROP POLICY IF EXISTS bd08_announcements_read ON public.bd08_announcements;
CREATE POLICY bd08_announcements_read ON public.bd08_announcements FOR SELECT TO authenticated USING(public.is_mkt_active() AND (public.is_mkt_admin() OR (starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND public.bd083_matches(bd08_announcements.audience,bd08_announcements.department,p.role,p.data->>'department')))));
CREATE OR REPLACE FUNCTION public.bd083_prepare_announcement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN
 IF NOT public.is_mkt_admin() THEN RAISE EXCEPTION 'Sem permissão para publicar'; END IF;
 IF length(trim(NEW.title)) NOT BETWEEN 1 AND 150 OR (NEW.ends_at IS NOT NULL AND NEW.ends_at<=NEW.starts_at) OR (NEW.audience='department' AND nullif(trim(NEW.department),'') IS NULL) THEN RAISE EXCEPTION 'Confira título, público e validade'; END IF;
 NEW.published_by:=auth.uid(); NEW.dispatched_at:=NULL; NEW.created_at:=now(); RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS bd083_prepare ON public.bd08_announcements;
CREATE TRIGGER bd083_prepare BEFORE INSERT ON public.bd08_announcements FOR EACH ROW EXECUTE FUNCTION public.bd083_prepare_announcement();
CREATE OR REPLACE FUNCTION public.bd083_dispatch(p_id uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE a record; total integer:=0; n integer;
BEGIN
 FOR a IN SELECT * FROM public.bd08_announcements WHERE dispatched_at IS NULL AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) AND (p_id IS NULL OR id=p_id) FOR UPDATE SKIP LOCKED LOOP
  INSERT INTO public.notifications(id,user_id,sender_id,data)
  SELECT 'ntf_'||gen_random_uuid(),p.id,NULL,jsonb_build_object('userId',p.id,'title','Comunicado • '||a.title,'message','Novo comunicado disponível no BravaDesk.','announcementId',a.id,'read',false,'type','info','createdAt',now(),'bd081Automated',a.push_enabled)
  FROM public.profiles p WHERE p.active AND p.id IS DISTINCT FROM a.published_by AND public.bd083_matches(a.audience,a.department,p.role,p.data->>'department');
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n;
  UPDATE public.bd08_announcements SET dispatched_at=now() WHERE id=a.id;
 END LOOP; RETURN total;
END;
$f$;
REVOKE ALL ON FUNCTION public.bd083_dispatch(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bd083_dispatch(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.bd083_publish_now() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN PERFORM public.bd083_dispatch(NEW.id); RETURN NEW; END;
$f$;
REVOKE ALL ON FUNCTION public.bd083_publish_now() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bd083_publish ON public.bd08_announcements;
CREATE TRIGGER bd083_publish AFTER INSERT ON public.bd08_announcements FOR EACH ROW EXECUTE FUNCTION public.bd083_publish_now();
CREATE TABLE IF NOT EXISTS public.bd083_announcement_reads(announcement_id uuid REFERENCES public.bd08_announcements(id) ON DELETE CASCADE,user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(announcement_id,user_id));
ALTER TABLE public.bd083_announcement_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd083_announcement_reads FROM anon,authenticated;
GRANT SELECT,INSERT ON public.bd083_announcement_reads TO authenticated;
DROP POLICY IF EXISTS bd083_reads_select ON public.bd083_announcement_reads;
CREATE POLICY bd083_reads_select ON public.bd083_announcement_reads FOR SELECT TO authenticated USING(public.is_mkt_active() AND (user_id=auth.uid() OR public.is_mkt_admin()));
DROP POLICY IF EXISTS bd083_reads_insert ON public.bd083_announcement_reads;
CREATE POLICY bd083_reads_insert ON public.bd083_announcement_reads FOR INSERT TO authenticated WITH CHECK(public.is_mkt_active() AND user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.bd08_announcements a WHERE a.id=announcement_id));
CREATE OR REPLACE FUNCTION public.bd083_read_counts() RETURNS TABLE(announcement_id uuid,total bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT r.announcement_id,count(*) FROM public.bd083_announcement_reads r WHERE public.is_mkt_admin() GROUP BY r.announcement_id;
$f$;
REVOKE ALL ON FUNCTION public.bd083_read_counts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bd083_read_counts() TO authenticated;
-- Own inbox is sorted and isolated from administrative exports; avoids global API row limits.
CREATE INDEX IF NOT EXISTS bd083_personal_inbox_idx ON public.notifications(user_id,(data->>'createdAt') DESC);
CREATE OR REPLACE FUNCTION public.bd083_my_notifications() RETURNS TABLE(id text,data jsonb) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT n.id,n.data FROM public.notifications n WHERE n.user_id=auth.uid() AND public.is_mkt_active() ORDER BY n.data->>'createdAt' DESC NULLS LAST,n.id DESC LIMIT 500;
$f$;
REVOKE ALL ON FUNCTION public.bd083_my_notifications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bd083_my_notifications() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
