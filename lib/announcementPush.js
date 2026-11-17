// Shared by the immediate and scheduled paths. Never accepts recipient URLs from clients.
export function allowedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password &&
      (/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(u.hostname) || u.hostname.endsWith('.push.apple.com') || u.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}
export async function sendAnnouncement(db, webpush, note, announcementId) {
  const result = {sent:0, failed:0, deferred:0, skipped:0};
  const claimedAt = new Date().toISOString();
  const claim = await db.from('notifications').update({push_claimed_at:claimedAt}).eq('id',note.id).is('push_claimed_at',null).select('id');
  if (claim.error) { result.failed++; return result; }
  if (!claim.data?.length) { result.skipped++; return result; }
  async function release() {
    const r = await db.from('notifications').update({push_claimed_at:null}).eq('id',note.id).eq('push_claimed_at',claimedAt);
    if (r.error) result.failed++; else result.deferred++;
  }
  const devices = await db.from('bd_push_devices').select('endpoint,subscription').eq('user_id',note.user_id);
  if (devices.error) { result.failed++; await release(); return result; }
  let transient = false;
  await Promise.all((devices.data||[]).map(async d => {
    if (!allowedEndpoint(d.endpoint) || d.subscription?.endpoint !== d.endpoint) { result.skipped++; return; }
    try {
      await webpush.sendNotification(d.subscription, JSON.stringify({title:'BravaDesk · Comunicado',body:'Novo comunicado disponível no BravaDesk.',announcementId,tag:note.id}),{TTL:3600,timeout:3000});
      result.sent++;
    } catch (e) {
      result.failed++;
      if ([404,410].includes(e.statusCode)) await db.from('bd_push_devices').delete().eq('endpoint',d.endpoint).eq('user_id',note.user_id);
      else if (e.statusCode === 429 || (e.statusCode >= 500 && e.statusCode <= 599)) transient = true;
    }
  }));
  // Only retry explicit transient provider failures if no device accepted the push.
  // Ambiguous timeouts and partial success are not replayed to avoid duplicates.
  if (!result.sent && transient) await release();
  return result;
}
