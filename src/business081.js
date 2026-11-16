// America/Bahia: UTC-03 for modern dates. Snapshot per new ticket.
export const defaultSchedule={days:[1,2,3,4,5],start:'09:00',lunch:'12:00',back:'13:00',end:'17:30',holidays:[]};
const DAY=86400000;
export const dayKey=ms=>new Date(ms-10800000).toISOString().slice(0,10);
const dayBase=ms=>Date.parse(dayKey(ms)+'T00:00:00-03:00');
function windows(base,c){const k=dayKey(base);if(!c.days.includes(new Date(base+12*3600000).getUTCDay())||c.holidays.includes(k))return [];return [[c.start,c.lunch],[c.back,c.end]].map(([a,b])=>[Date.parse(k+'T'+a+':00-03:00'),Date.parse(k+'T'+b+':00-03:00')]);}
export function businessMs(start,end,c){if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0;let total=0;for(let base=dayBase(start);base<end;base+=DAY)for(const [lo,hi] of windows(base,c))total+=Math.max(0,Math.min(end,hi)-Math.max(start,lo));return total;}
export function addBusinessMs(start,amount,c){if(!Number.isFinite(start)||!Number.isFinite(amount)||amount<0)return null;if(amount===0)return start;for(let base=dayBase(start),i=0;i<36600;i++,base+=DAY)for(const [lo,hi] of windows(base,c)){const from=Math.max(start,lo);if(hi<=from)continue;if(amount<=hi-from)return from+amount;amount-=hi-from;}return null;}
export function businessState(ticket,now){const c=ticket.businessSchedule;if(!c)return null;const start=Date.parse(ticket.createdAt),end=ticket.completedAt?Date.parse(ticket.completedAt):now;const paused=ticket.status==='aguardando_solicitante'&&ticket.sacPausedAt?businessMs(Date.parse(ticket.sacPausedAt),end,c):0;return {elapsed:Math.max(0,businessMs(start,end,c)-Number(ticket.businessPausedMs||0)-paused),paused};}
