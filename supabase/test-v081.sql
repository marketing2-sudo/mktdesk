-- Run in a test Supabase project AFTER migration. No persistent writes.
BEGIN;
DO $$
DECLARE c jsonb:='{"days":[1,2,3,4,5],"start":"09:00","lunch":"12:00","back":"13:00","end":"17:30","holidays":[]}'; n numeric;
BEGIN
 n:=public.bd081_business_ms('2026-11-16 09:00-03','2026-11-16 17:30-03',c);
 IF n IS DISTINCT FROM 27000000::numeric THEN RAISE EXCEPTION 'Dia útil incorreto: %',n; END IF;
 n:=public.bd081_business_ms('2026-11-13 16:30-03','2026-11-16 10:00-03',c);
 IF n IS DISTINCT FROM 7200000::numeric THEN RAISE EXCEPTION 'Fim de semana incorreto: %',n; END IF;
 n:=public.bd081_business_ms('2026-11-13 16:30-03','2026-11-16 10:00-03',jsonb_set(c,'{holidays}','["2026-11-16"]'));
 IF n IS DISTINCT FROM 3600000::numeric THEN RAISE EXCEPTION 'Feriado incorreto: %',n; END IF;
 IF public.bd081_next_run('2027-01-31 09:00-03','monthly',31) IS DISTINCT FROM '2027-02-28 09:00-03'::timestamptz THEN RAISE EXCEPTION 'Recorrência mensal incorreta'; END IF;
 IF public.bd081_next_run('2027-02-28 09:00-03','monthly',31) IS DISTINCT FROM '2027-03-31 09:00-03'::timestamptz THEN RAISE EXCEPTION 'Dia âncora mensal incorreto'; END IF;
 IF has_function_privilege('authenticated','public.bd081_run_jobs()','execute') THEN RAISE EXCEPTION 'Rotina indevidamente exposta'; END IF;
 IF has_table_privilege('authenticated','public.bd081_revisions','insert') THEN RAISE EXCEPTION 'Revisão privada indevidamente gravável'; END IF;
 RAISE NOTICE 'Testes SQL de cálculo, recorrência e permissões básicas passaram.';
END $$;
ROLLBACK;
