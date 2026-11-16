self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method === 'GET' && event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request));
  }
});
self.addEventListener('push',event=>{let p={};try{p=event.data.json();}catch{}event.waitUntil(self.registration.showNotification(p.title||'BravaDesk',{body:p.body||'Nova atualização',icon:'/icon-192.png',badge:'/icon-192.png',tag:p.tag||'bravadesk',vibrate:[160,80,160],data:{ticketId:p.ticketId||''}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=new URL('/',self.location.origin);if(event.notification.data?.ticketId)url.searchParams.set('ticket',event.notification.data.ticketId);event.waitUntil(self.clients.openWindow(url.href));});
