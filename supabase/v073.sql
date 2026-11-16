BEGIN;
-- BravaDesk v0.7.3: executar após v0.7.2. Bucket privado, sem apagar dados.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('bd-references','bd-references',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

-- Câmara de acesso: ticket existente, conta ativa e relação com o chamado.
-- SECURITY INVOKER: mantém as políticas de leitura da tabela tickets.
CREATE OR REPLACE FUNCTION public.bd_reference_access(p_path text,p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.is_mkt_active() AND split_part(p_path,'/',2) IN ('public','private')
 AND (NOT p_write OR (split_part(p_path,'/',3)=auth.uid()::text AND p_path ~ '^[^/]+/(public|private)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'))
 AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id=split_part(p_path,'/',1) AND (
 public.is_mkt_staff() OR (split_part(p_path,'/',2)='public' AND (t.requester_id=auth.uid() OR (NOT p_write AND coalesce(t.data->'observerIds','[]'::jsonb) ? auth.uid()::text))) ));
$$;
REVOKE ALL ON FUNCTION public.bd_reference_access(text,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bd_reference_access(text,boolean) TO authenticated;
DROP POLICY IF EXISTS bd_reference_read ON storage.objects;
CREATE POLICY bd_reference_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='bd-references' AND public.bd_reference_access(name,false));
DROP POLICY IF EXISTS bd_reference_insert ON storage.objects;
CREATE POLICY bd_reference_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='bd-references' AND public.bd_reference_access(name,true));
-- Impede que políticas permissivas de outros buckets abram acesso a este bucket.
DROP POLICY IF EXISTS bd_reference_guard_read ON storage.objects;
CREATE POLICY bd_reference_guard_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (bucket_id<>'bd-references' OR public.bd_reference_access(name,false));
DROP POLICY IF EXISTS bd_reference_guard_insert ON storage.objects;
CREATE POLICY bd_reference_guard_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (bucket_id<>'bd-references' OR public.bd_reference_access(name,true));
DROP POLICY IF EXISTS bd_reference_guard_update ON storage.objects;
CREATE POLICY bd_reference_guard_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (bucket_id<>'bd-references') WITH CHECK (bucket_id<>'bd-references');
DROP POLICY IF EXISTS bd_reference_guard_delete ON storage.objects;
CREATE POLICY bd_reference_guard_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (bucket_id<>'bd-references');
DROP POLICY IF EXISTS bd_reference_guard_anon ON storage.objects;
CREATE POLICY bd_reference_guard_anon ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING (bucket_id<>'bd-references') WITH CHECK (bucket_id<>'bd-references');

-- Anexa a mensagem atomicamente. Triggers da v072 separam notas e notificam participantes.
CREATE OR REPLACE FUNCTION public.bd_post_reference_message(p_ticket_id text,p_content text,p_internal boolean,p_attachments jsonb,p_reference boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); staff boolean:=public.is_mkt_staff(); person jsonb; entry jsonb; f jsonb; visibility text; changed int; ts timestamptz:=now();
BEGIN
 IF actor IS NULL OR NOT public.is_mkt_active() OR (p_internal AND NOT staff) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tickets t WHERE t.id=p_ticket_id AND (staff OR t.requester_id=actor)) THEN RAISE EXCEPTION 'Sem permissão para responder'; END IF;
 IF p_attachments IS NULL OR jsonb_typeof(p_attachments)<>'array' THEN RAISE EXCEPTION 'Anexos inválidos'; END IF;
 IF jsonb_array_length(p_attachments)>5 OR (coalesce(trim(p_content),'')='' AND jsonb_array_length(p_attachments)=0) THEN RAISE EXCEPTION 'Envio vazio ou acima do limite de cinco anexos'; END IF;
 visibility:=CASE WHEN p_internal THEN 'private' ELSE 'public' END;
 FOR f IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
  IF split_part(coalesce(f->>'path',''),'/',1)<>p_ticket_id OR split_part(coalesce(f->>'path',''),'/',2)<>visibility OR split_part(coalesce(f->>'path',''),'/',3)<>actor::text OR NOT public.bd_reference_access(f->>'path',true) OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='bd-references' AND o.name=f->>'path') OR coalesce(f->>'mime','') NOT IN ('image/jpeg','image/png','image/webp','application/pdf') THEN RAISE EXCEPTION 'Referência indisponível ou não autorizada'; END IF;
 END LOOP;
 SELECT p.data||jsonb_build_object('role',p.role) INTO person FROM public.profiles p WHERE p.id=actor;
 entry:=jsonb_build_object('id','msg_'||gen_random_uuid(),'type',CASE WHEN p_internal THEN 'internal' ELSE 'public' END,'authorId',actor,'authorName',coalesce(person->>'name','Colaborador'),'authorRole',person->>'role','content',coalesce(p_content,''),'createdAt',ts,'attachments',p_attachments,'isReference',p_reference AND NOT p_internal);
 UPDATE public.tickets t SET data=t.data||jsonb_build_object('timeline',coalesce(t.data->'timeline','[]'::jsonb)||jsonb_build_array(entry),'updatedAt',ts) || CASE WHEN staff AND NOT p_internal AND (t.data->>'firstResponseAt') IS NULL THEN jsonb_build_object('firstResponseAt',ts) ELSE '{}'::jsonb END WHERE t.id=p_ticket_id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Não foi possível salvar a mensagem'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.bd_post_reference_message(text,text,boolean,jsonb,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bd_post_reference_message(text,text,boolean,jsonb,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
