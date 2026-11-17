
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const config = {
  maxDuration: 60
};

// Autenticação segura do agendador
function authorized(header, secret) {
  if (!secret || typeof header !== 'string') {
    return false;
  }

  const match = header.trim().match(/^Bearer\s+(\S+)$/i);

  if (!match) return false;

  const a = Buffer.from(match[1]);
  const b = Buffer.from(secret.trim());

  return a.length === b.length && timingSafeEqual(a, b);
}

// Validação dos provedores de notificações push
function allowedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);

    return (
      u.protocol === 'https:' &&
      !u.port &&
      !u.username &&
      !u.password &&
      (
        /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(u.hostname) ||
        u.hostname.endsWith('.push.apple.com') ||
        u.hostname.endsWith('.notify.windows.com')
      )
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {

  // Validar método HTTP
  if (!['POST', 'GET'].includes(req.method)) {
    return res.status(405).json({
      error: 'Método não permitido'
    });
  }

  const env = process.env;

  // Verificar configuração do agendador
  if (!env.CRON_SECRET) {
    return res.status(503).json({
      source: 'bravadesk-automation',
      error: 'Agendamento não configurado'
    });
  }

  // Autenticação com diagnóstico seguro
  if (!authorized(req.headers.authorization, env.CRON_SECRET)) {

    console.warn('BravaDesk: autenticação recusada', {
      authorizationPresent: Boolean(req.headers.authorization),
      secretConfigured: Boolean(env.CRON_SECRET)
    });

    return res.status(401).json({
      source: 'bravadesk-automation',
      error: 'Autenticacao recusada',
      authorizationPresent: Boolean(req.headers.authorization),
      secretConfigured: Boolean(env.CRON_SECRET)
    });
  }

  // Verificar configuração do banco
  if (
    !env.VITE_SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return res.status(503).json({
      error: 'Banco não configurado'
    });
  }

  try {

    const db = createClient(
      env.VITE_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    // Processar comunicados
    const announcements = await db.rpc(
      'bd083_dispatch',
      { p_id: null }
    );

    if (announcements.error) {
      console.error(
        'bd083 dispatch:',
        announcements.error.code
      );
    }

    // Processar alertas SLA e chamados recorrentes
    const jobs = await db.rpc('bd081_run_jobs');

    if (jobs.error) {
      console.error(
        'bd081 jobs:',
        jobs.error.code
      );
    }

    // Validar configuração VAPID
    if (
      !env.VITE_VAPID_PUBLIC_KEY ||
      !env.VAPID_PRIVATE_KEY ||
      !env.VAPID_SUBJECT
    ) {
      return res.status(200).json({
        jobs: jobs.data,
        push: 'não configurado'
      });
    }

    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VITE_VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    // Consultar notificações pendentes
    const {
      data: notes,
      error
    } = await db
      .from('notifications')
      .select('id,user_id,data')
      .is('sender_id', null)
      .eq('data->>bd081Automated', 'true')
      .is('push_claimed_at', null)
      .limit(40);

    if (error) {
      throw error;
    }

    let sent = 0;
    let failed = 0;

    // Processar fila de notificações
    for (const n of notes || []) {

      const claim = await db
        .from('notifications')
        .update({
          push_claimed_at: new Date().toISOString()
        })
        .eq('id', n.id)
        .is('push_claimed_at', null)
        .select('id');

      if (claim.error || !claim.data?.length) {
        continue;
      }

      // Buscar dispositivos do destinatário
      const {
        data: devices,
        error: deviceError
      } = await db
        .from('bd_push_devices')
        .select('endpoint,subscription')
        .eq('user_id', n.user_id);

      if (deviceError) {
        failed++;
        continue;
      }

      // Enviar notificações aos dispositivos
      await Promise.all(

        (devices || [])
          .filter(d =>
            allowedEndpoint(d.endpoint) &&
            d.subscription?.endpoint === d.endpoint
          )
          .map(async d => {

            try {

              const payload = JSON.stringify({
                title: n.data.announcementId
                  ? 'BravaDesk · Comunicado'
                  : n.data.title || 'BravaDesk',

                body: n.data.announcementId
                  ? 'Novo comunicado disponível no BravaDesk.'
                  : 'Há uma atualização em seu chamado.',

                ticketId: n.data.ticketId,
                announcementId: n.data.announcementId,
                tag: n.id
              });

              await webpush.sendNotification(
                d.subscription,
                payload,
                {
                  TTL: 3600,
                  timeout: 3000
                }
              );

              sent++;

            } catch (e) {

              failed++;

              // Remover inscrições expiradas
              if ([404, 410].includes(e.statusCode)) {

                await db
                  .from('bd_push_devices')
                  .delete()
                  .eq('endpoint', d.endpoint)
                  .eq('user_id', n.user_id);

              }
            }
          })
      );
    }

    // Retornar resultado do processamento
    return res
      .status(
        announcements.error || jobs.error
          ? 500
          : 200
      )
      .json({
        jobs: jobs.data,
        announcements: announcements.data,
        push: {
          sent,
          failed
        },
        errors: [
          announcements.error?.code,
          jobs.error?.code
        ].filter(Boolean)
      });

  } catch (e) {

    console.error(
      'BravaDesk: falha na rotina automática',
      e.code || e.name
    );

    return res.status(500).json({
      source: 'bravadesk-automation',
      error: 'Falha na rotina automática'
    });

  }
}
