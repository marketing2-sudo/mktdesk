-- Read-only checks after applying v083.sql. Results must be true.
SELECT to_regclass('public.bd083_announcement_reads') IS NOT NULL AS reads_table,
 to_regprocedure('public.bd083_dispatch(uuid)') IS NOT NULL AS dispatch_function,
 to_regprocedure('public.bd083_read_counts()') IS NOT NULL AS read_counts_function,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='bd083_publish' AND tgrelid='public.bd08_announcements'::regclass AND NOT tgisinternal) AS publish_trigger,
 NOT has_function_privilege('authenticated','public.bd083_dispatch(uuid)','EXECUTE') AS dispatch_protected;
SELECT public.bd083_matches('all',NULL,'solicitante','Reservas') AS all_allowed,
 NOT public.bd083_matches('staff',NULL,'solicitante','Reservas') AS staff_protected,
 public.bd083_matches('department','Reservas','solicitante','Reservas') AS same_department,
 NOT public.bd083_matches('department','RH','solicitante','Reservas') AS other_department_protected;
-- No sensitive messages or recipient identities are returned.
SELECT count(*) FILTER (WHERE data ? 'announcementId') AS announcement_notifications,
 count(*) FILTER (WHERE data ? 'announcementId' AND data->>'bd081Automated'='true' AND push_claimed_at IS NULL) AS push_pending,
 count(*) FILTER (WHERE data ? 'announcementId' AND push_claimed_at IS NOT NULL) AS push_claimed_not_delivery_confirmation
FROM public.notifications;
