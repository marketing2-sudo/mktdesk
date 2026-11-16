import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
export const config={maxDuration:60};
// Called by a protected external scheduler; all credentials remain server-side.
function authorized(header,secret){if(!secret||typeof header!=='string')return false;const a=Buffer.from(header),b=Buffer.from('Bearer '+secret);return a.length===b.length&&timingSafeEqual(a,b);}
function allowedEndpoint(endpoint){try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(u.hostname)||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
export default async function handler(req,res){
 if(!['POST','GET'].includes(req.method))return res.status(405).end();
 const env=process.env;
 if(!env.CRON_SECRET)return res.status(503).json({error:'Agendamento não configurado'});
 if(!authorized(req.headers.authorization,env.CRON_SECRET))return res.status(401).end();
 if(!env.VITE_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:'Banco não configurado'});
 try{
  const db=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const jobs=await db.rpc('bd081_run_jobs');if(jobs.error){console.error('bd081 jobs:',jobs.error.code);return res.status(500).json({error:'Falha na rotina do banco'});}
  const extra=await db.rpc('bd083_run_jobs');if(extra.error){console.error('bd083 jobs:',extra.error.code);return res.status(500).json({error:'Falha na rotina de lembretes'});}
  if(!env.VITE_VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)return res.status(200).json({jobs:jobs.data,communication:extra.data,push:'não configurado'});
  webpush.setVapidDetails(env.VAPID_SUBJECT,env.VITE_VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  const {data:notes,error}=await db.from('notifications').select('id,user_id,data').is('sender_id',null).eq('data->>bd081Automated','true').is('push_claimed_at',null).limit(40);if(error)throw error;
  let sent=0,failed=0;
  for(const n of notes||[]){
   const claim=await db.from('notifications').update({push_claimed_at:new Date().toISOString()}).eq('id',n.id).is('push_claimed_at',null).select('id');if(claim.error||!claim.data?.length)continue;
   const {data:devices,error:deviceError}=await db.from('bd_push_devices').select('endpoint,subscription').eq('user_id',n.user_id);if(deviceError){failed++;continue;}
   await Promise.all((devices||[]).filter(d=>allowedEndpoint(d.endpoint)&&d.subscription?.endpoint===d.endpoint).map(async d=>{try{await webpush.sendNotification(d.subscription,JSON.stringify({title:n.data.title||'BravaDesk',body:n.data.message||'Há uma atualização em seu chamado.',ticketId:n.data.ticketId,tag:n.id}),{TTL:3600,timeout:3000});sent++;}catch(e){failed++;if([404,410].includes(e.statusCode))await db.from('bd_push_devices').delete().eq('endpoint',d.endpoint).eq('user_id',n.user_id);}}));
  }
  return res.status(200).json({jobs:jobs.data,communication:extra.data,push:{sent,failed}});
 }catch(e){console.error('bd081 routine failed',e.code||e.name);return res.status(500).json({error:'Falha na rotina automática'});}
}
