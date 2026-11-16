import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 const {VITE_SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:secret,VITE_VAPID_PUBLIC_KEY:pub,VAPID_PRIVATE_KEY:priv,VAPID_SUBJECT:subject}=process.env;
 if(!url||!secret||!pub||!priv||!subject)return res.status(503).json({error:'Push não configurado'});
 try{
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=(req.headers.authorization||'').replace(/^Bearer /i,'');if(!token)return res.status(401).end();
 const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return res.status(401).end();
 const {data:profile}=await db.from('profiles').select('active').eq('id',user.id).single();if(!profile?.active)return res.status(403).end();
 const ticketId=req.body?.ticketId;if(typeof ticketId!=='string'||ticketId.length>100)return res.status(400).end();
 const {data:notes,error:err}=await db.from('notifications').update({push_claimed_at:new Date().toISOString()}).eq('sender_id',user.id).eq('data->>ticketId',ticketId).is('push_claimed_at',null).select('id,user_id');if(err)throw err;
 webpush.setVapidDetails(subject,pub,priv);
 for(const n of notes||[]){const {data:devices}=await db.from('bd_push_devices').select('endpoint,subscription').eq('user_id',n.user_id);for(const d of devices||[]){try{
 // Restrict outbound requests to known browser push providers; never arbitrary user URLs.
 const u=new URL(d.endpoint);if(u.protocol!=='https:'||u.port||u.username||u.password||!(/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(u.hostname)||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com')))continue;
 await webpush.sendNotification(d.subscription,JSON.stringify({title:'BravaDesk',body:'Você tem uma atualização em um chamado.',ticketId,tag:n.id}),{TTL:300,timeout:5000});
 }catch(e){if(e.statusCode===404||e.statusCode===410)await db.from('bd_push_devices').delete().eq('endpoint',d.endpoint).eq('user_id',n.user_id);}}}
 return res.status(200).json({ok:true});
 }catch{return res.status(500).json({error:'Falha de envio'});}
}
