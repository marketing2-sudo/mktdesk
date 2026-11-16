BEGIN;
-- v0.8 preview: additive only; preserves existing workflow and policies.
CREATE TABLE IF NOT EXISTS public.bd08_config(id integer primary key check(id=1), data jsonb not null default '{}'::jsonb);
INSERT INTO public.bd08_config(id,data) VALUES(1,'{}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.bd08_checklists(ticket_id text primary key references public.tickets(id) on delete cascade, data jsonb not null default '[]'::jsonb check(jsonb_typeof(data)='array'));
CREATE TABLE IF NOT EXISTS public.bd08_announcements(id uuid primary key default gen_random_uuid(), message text not null check(length(trim(message)) between 1 and 4000), created_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS public.bd08_audit(id bigint generated always as identity primary key, created_at timestamptz not null default now(), actor uuid, entity text not null, record_id text, action text not null, changes jsonb not null default '{}'::jsonb);
ALTER TABLE public.bd08_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd08_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd08_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd08_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd08_config,public.bd08_checklists,public.bd08_announcements,public.bd08_audit FROM anon,authenticated;
GRANT SELECT,UPDATE ON public.bd08_config TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.bd08_checklists TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.bd08_announcements TO authenticated;
GRANT SELECT ON public.bd08_audit TO authenticated;
DROP POLICY IF EXISTS bd08_config_read ON public.bd08_config;
CREATE POLICY bd08_config_read ON public.bd08_config FOR SELECT TO authenticated USING(public.is_mkt_staff());
DROP POLICY IF EXISTS bd08_config_write ON public.bd08_config;
CREATE POLICY bd08_config_write ON public.bd08_config FOR UPDATE TO authenticated USING(public.is_mkt_admin()) WITH CHECK(public.is_mkt_admin());
DROP POLICY IF EXISTS bd08_checklist_staff ON public.bd08_checklists;
CREATE POLICY bd08_checklist_staff ON public.bd08_checklists FOR ALL TO authenticated USING(public.is_mkt_staff()) WITH CHECK(public.is_mkt_staff() AND EXISTS(SELECT 1 FROM public.tickets t WHERE t.id=ticket_id));
DROP POLICY IF EXISTS bd08_announcements_read ON public.bd08_announcements;
CREATE POLICY bd08_announcements_read ON public.bd08_announcements FOR SELECT TO authenticated USING(public.is_mkt_active());
DROP POLICY IF EXISTS bd08_announcements_write ON public.bd08_announcements;
CREATE POLICY bd08_announcements_write ON public.bd08_announcements FOR INSERT TO authenticated WITH CHECK(public.is_mkt_admin());
DROP POLICY IF EXISTS bd08_announcements_delete ON public.bd08_announcements;
CREATE POLICY bd08_announcements_delete ON public.bd08_announcements FOR DELETE TO authenticated USING(public.is_mkt_admin());
DROP POLICY IF EXISTS bd08_audit_read ON public.bd08_audit;
CREATE POLICY bd08_audit_read ON public.bd08_audit FOR SELECT TO authenticated USING(public.is_bd_super());
-- Store only selected metadata, never message bodies, private notes, credentials or entire rows.
CREATE OR REPLACE FUNCTION public.bd08_record_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:='{}'; b jsonb:='{}'; diff jsonb:='{}'; k text; fields text[]; rid text;
BEGIN
 IF TG_OP<>'INSERT' THEN a:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN b:=to_jsonb(NEW); END IF;
 rid:=coalesce(b->>'id',a->>'id',b->>'ticket_id',a->>'ticket_id');
 IF TG_TABLE_NAME='tickets' THEN
  fields:=ARRAY['status','assignedTechId','priority','slaHours','customStageId','observerIds','department']; a:=coalesce(a->'data','{}'); b:=coalesce(b->'data','{}');
 ELSIF TG_TABLE_NAME='profiles' THEN fields:=ARRAY['role','active'];
 ELSE fields:=ARRAY[]::text[]; END IF;
 FOREACH k IN ARRAY fields LOOP IF a->k IS DISTINCT FROM b->k THEN diff:=diff||jsonb_build_object(k,jsonb_build_object('before',a->k,'after',b->k)); END IF; END LOOP;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('tickets','profiles') AND diff='{}'::jsonb THEN RETURN NEW; END IF;
 INSERT INTO public.bd08_audit(actor,entity,record_id,action,changes) VALUES(auth.uid(),TG_TABLE_NAME,rid,TG_OP,diff);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bd08_record_audit() FROM public,anon,authenticated;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['tickets','profiles','app_settings','bd08_config','bd08_checklists','bd08_announcements'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS bd08_audit ON public.%I',t);
 EXECUTE format('CREATE TRIGGER bd08_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bd08_record_audit()',t);
END LOOP; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
