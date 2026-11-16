BEGIN;
-- Requires v0.8.1. Only exposes working hours, not internal configuration.
CREATE OR REPLACE FUNCTION public.bd082_public_schedule()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT coalesce(public.is_mkt_active(),false) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 RETURN public.bd081_schedule();
END;
$$;
REVOKE ALL ON FUNCTION public.bd082_public_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bd082_public_schedule() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
