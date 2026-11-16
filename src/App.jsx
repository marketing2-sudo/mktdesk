import {Workflow081,MentionPicker,workflowRPC} from './workflow081';
import {businessState,addBusinessMs,formatSLADuration,formatDeliveryDate,deliveryLabel} from './business081';
import { ProductionPanel, ProductionChecklist } from './production08';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Moon, Sun,
  LayoutDashboard,
  Kanban,
  List,
  Users,
  Settings,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  LogOut,
  Plus,
  Search,
  Download,
  Upload,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Send,
  Lock,
  Star,
  ShieldCheck,
  UserPlus,
  Mail,
  Smartphone,
  Share,
  PlusSquare,
  Copy,
  Check,
  X,
  ChevronRight,
  Building2,
  Tag,
  FileText,
  Sparkles,
  Eye,
  EyeOff,
  MessageSquare,
  StickyNote,
  Award,
  ExternalLink,
  UserCheck,
  UserX,
  Inbox
} from 'lucide-react';
import { supabase, supabaseConfigured } from './supabase';
import { ReferencePicker, ReferenceFiles, uploadReferences } from './references';

// Armazenamento local seguro contra bloqueios de sandbox/iframe
const memoryFallbackStore = {};
const STORAGE_PREFIX = 'mktdesk_prod_v1_';

function safeStorageGet(key, fallbackValue) {
  const fullKey = `${STORAGE_PREFIX}${key}`;
  try {
    const storageObj = window['local' + 'Storage'];
    if (storageObj) {
      const raw = storageObj.getItem(fullKey);
      if (raw !== null) return JSON.parse(raw);
    }
  } catch (_) {
    // Fallback em memória caso o navegador bloqueie storage
  }
  return Object.prototype.hasOwnProperty.call(memoryFallbackStore, fullKey)
    ? memoryFallbackStore[fullKey]
    : fallbackValue;
}

function safeStorageSet(key, value) {
  const fullKey = `${STORAGE_PREFIX}${key}`;
  memoryFallbackStore[fullKey] = value;
  try {
    const storageObj = window['local' + 'Storage'];
    if (storageObj) {
      storageObj.setItem(fullKey, JSON.stringify(value));
    }
  } catch (_) {
    // Ignora erros de quota ou sandbox restrito
  }
}

/**
 * ============================================================================
 * CONSTANTES DO DOMÍNIO CORPORATIVO & REGRAS DE NEGÓCIO
 * ============================================================================
 */
const DEFAULT_CATEGORIES = [
  {
    id: 'cat-design',
    name: 'Design & Peças Gráficas',
    slaHours: 24,
    description: 'Banners, posts sociais, folders, flyers e identidade visual'
  },
  {
    id: 'cat-campanhas',
    name: 'Campanhas & Tráfego Pago',
    slaHours: 48,
    description: 'Meta Ads, Google Ads, LinkedIn Ads e lançamentos'
  },
  {
    id: 'cat-conteudo',
    name: 'Conteúdo, Copy & Social Media',
    slaHours: 24,
    description: 'Roteiros, artigos, e-mail marketing e calendário editorial'
  },
  {
    id: 'cat-comercial',
    name: 'Apresentações & Materiais Comerciais',
    slaHours: 36,
    description: 'Pitch decks, propostas comerciais, catálogos e one-pagers'
  },
  {
    id: 'cat-eventos',
    name: 'Eventos & Endomarketing',
    slaHours: 72,
    description: 'Feiras, webinars, convenções, comunicados internos e ativações'
  },
  {
    id: 'cat-web',
    name: 'Web, Landing Pages & CRM',
    slaHours: 72,
    description: 'Páginas de captura, formulários, automações e ajustes no site'
  },
  {
    id: 'cat-brindes',
    name: 'Brindes & Produção Gráfica',
    slaHours: 96,
    description: 'Orçamentos gráficos, kits corporativos e materiais físicos'
  },
  {
    id: 'cat-outros',
    name: 'Outras Demandas de Marketing',
    slaHours: 48,
    description: 'Solicitações especiais não listadas nas categorias anteriores'
  }
];

const DEPARTMENTS = [
  'Comercial & Vendas',
  'Marketing',
  'Recursos Humanos',
  'Financeiro & Controladoria',
  'Produto & Engenharia',
  'Operações & Logística',
  'Atendimento & CS',
  'Jurídico & Compliance',
  'Diretoria Executiva',
  'Outros'
];

const DEFAULT_SETTINGS = {
  departments: DEPARTMENTS.map(name => ({id:name,name,active:true})),
  allowedDomains: '', // Vazio por padrão para permitir uso imediato; configurável pelo Admin
  categories: DEFAULT_CATEGORIES,
  // Etapas adicionais permanecem vinculadas ao fluxo principal para preservar SLA e aprovações.
  customStages: []
};

const STATUS_META = {
  cancelado:{label:"Cancelado",shortLabel:"Cancelado",badgeClass:"bg-slate-100 text-slate-700 border-slate-300",dotClass:"bg-slate-400",headerAccent:"border-t-slate-400"},
  novo: {
    label: 'Novo / Triagem',
    shortLabel: 'Novo',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    dotClass: 'bg-sky-500',
    headerAccent: 'border-t-sky-500'
  },
  em_atendimento: {
    label: 'Em Produção',
    shortLabel: 'Produção',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotClass: 'bg-indigo-500',
    headerAccent: 'border-t-indigo-500'
  },
  aguardando_solicitante: {
    label: 'Aguardando Solicitante (SAC)',
    shortLabel: 'Pausado SAC',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    dotClass: 'bg-amber-500',
    headerAccent: 'border-t-amber-500'
  },
  em_aprovacao: {
    label: 'Em Aprovação',
    shortLabel: 'Aprovação',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotClass: 'bg-purple-500',
    headerAccent: 'border-t-purple-500'
  },
  concluido: {
    label: 'Concluído',
    shortLabel: 'Concluído',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    headerAccent: 'border-t-emerald-500'
  }
};

const PRIORITY_META = {
  baixa: {
    label: 'Baixa',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
  },
  normal: {
    label: 'Normal',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  alta: {
    label: 'Alta',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200'
  },
  urgente: {
    label: 'Urgente',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
  }
};

const ROLE_META = {
  super_admin: {label:'Super Admin',shortLabel:'Super Admin',badgeClass:'bg-indigo-600 text-white'},
  admin: {
    label: 'Admin do Marketing',
    shortLabel: 'Admin',
    badgeClass: 'bg-indigo-600 text-white'
  },
  tecnico: {
    label: 'Técnico do Marketing',
    shortLabel: 'Técnico',
    badgeClass: 'bg-slate-800 text-white'
  },
  solicitante: {
    label: 'Solicitante',
    shortLabel: 'Solicitante',
    badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  }
};

/**
 * ============================================================================
 * FUNÇÕES UTILITÁRIAS (HASH, DATAS, SLA GLPI, ÁUDIO WEB API, ÍCONES PWA)
 * ============================================================================
 */
function generateId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(ms) {
  const abs = Math.abs(ms);
  const totalMinutes = Math.floor(abs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

/**
 * Cálculo preciso de SLA descontando automaticamente o tempo pausado em SAC
 */
function calculateTicketSLA(ticket, nowMs = Date.now()) {
  const createdMs = new Date(ticket.createdAt).getTime();
  const endRefMs = ticket.completedAt
    ? new Date(ticket.completedAt).getTime()
    : nowMs;

  const currentPauseMs =
    ticket.status === 'aguardando_solicitante' &&
    ticket.sacPausedAt &&
    !ticket.completedAt
      ? Math.max(0, nowMs - new Date(ticket.sacPausedAt).getTime())
      : 0;

  const accumulatedPausedMs = Number(ticket.totalPausedMs || 0);
  const legacyElapsedMs = Math.max(
    0,
    endRefMs - createdMs - accumulatedPausedMs - currentPauseMs
  );

  const business = businessState(ticket,nowMs);
  const activeElapsedMs = business ? business.elapsed : legacyElapsedMs;
  const slaHours = Number(ticket.slaHours || 24);
  const slaTargetMs = slaHours * 3600 * 1000;
  const remainingMs = slaTargetMs - activeElapsedMs;
  const percentUsed = Math.min(
    100,
    Math.round((activeElapsedMs / Math.max(1, slaTargetMs)) * 100)
  );
  const isBreached = remainingMs < 0;
  const deadline = ['aguardando_solicitante','cancelado'].includes(ticket.status) ? null : ticket.businessSchedule ? addBusinessMs(createdMs,slaTargetMs+Number(ticket.businessPausedMs||0),ticket.businessSchedule) : endRefMs+remainingMs;
  if(ticket.status==='cancelado') return {deadline:null,isPaused:false,isBreached:false,activeElapsedMs,remainingMs,currentPauseMs:0,percentUsed,label:'Cancelado',badgeClass:'bg-slate-100 text-slate-700 border-slate-300'};

  if (ticket.status === 'aguardando_solicitante') {
    return {
      deadline,
      isPaused: true,
      isBreached,
      activeElapsedMs,
      remainingMs,
      currentPauseMs,
      percentUsed,
      label: `SLA Pausado (${formatDuration(currentPauseMs)})`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300'
    };
  }

  if (ticket.status === 'concluido') {
    return {
      deadline,
      isPaused: false,
      isBreached,
      activeElapsedMs,
      remainingMs,
      currentPauseMs: 0,
      percentUsed,
      label: isBreached ? 'Concluído Fora do SLA' : 'Concluído no SLA',
      badgeClass: isBreached
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
  }

  if (isBreached) {
    return {
      deadline,
      isPaused: false,
      isBreached: true,
      activeElapsedMs,
      remainingMs,
      currentPauseMs: 0,
      percentUsed: 100,
      label: `Estourado há ${formatSLADuration(remainingMs,ticket.businessSchedule)}`,
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
    };
  }

  if (remainingMs <= slaTargetMs * 0.25) {
    return {
      deadline,
      isPaused: false,
      isBreached: false,
      activeElapsedMs,
      remainingMs,
      currentPauseMs: 0,
      percentUsed,
      label: `Restam ${formatSLADuration(remainingMs,ticket.businessSchedule)}`,
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
    };
  }

  return {
    deadline,
    isPaused: false,
    isBreached: false,
    activeElapsedMs,
    remainingMs,
    currentPauseMs: 0,
    percentUsed,
    label: `Restam ${formatSLADuration(remainingMs,ticket.businessSchedule)}`,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };
}

/**
 * Alerta sonoro suave sintetizado via Web Audio API (sem dependências externas)
 */
let bravaAudioContext;
function unlockBravaAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(C){bravaAudioContext||=new C();bravaAudioContext.resume().catch(()=>{});}}catch{}}
function playGentleChime(enabled) {
  if (!enabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = bravaAudioContext || (bravaAudioContext = new AudioCtx());
    if(ctx.state!=='running') {ctx.resume().catch(()=>{});}
    const now = ctx.currentTime;

    const notes = [880, 1174.66]; // Lá5 -> Ré6 harmônico suave
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.07, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.34);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.36);
    });
  } catch {
    // Silencia bloqueios de autoplay do navegador
  }
}

/**
 * Gera ícone PNG via Canvas para manifesto PWA e Apple Touch Icon
 */
function generateAppIconDataUrl(size) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#07515a');
    grad.addColorStop(1, '#04383f');

    const radius = size * 0.22;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Emblema central
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(size * 0.34)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MKT', size / 2, size * 0.48);

    ctx.fillStyle = '#a4d0d3';
    ctx.font = `600 ${Math.round(size * 0.12)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText('DESK', size / 2, size * 0.74);

    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/**
 * ============================================================================
 * COMPONENTE PRINCIPAL: BravaDesk (App)
 * ============================================================================
 */
export default function App() {
  // Supabase Auth identifica a sessão; perfis e registros vêm do banco.
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [users, setUsers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [currentUserId, setCurrentUserId] = useState(null);
  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId && u.active !== false) || null,
    [users, currentUserId]
  );

  // Preferências de interface & navegação
  const [soundEnabled, setSoundEnabled] = useState(() =>
    safeStorageGet('soundEnabled', true)
  );
  const [adminTab, setAdminTab] = useState('bi'); // bi | torre | equipe | config
  const [techQueue, setTechQueue] = useState('minha'); // minha | geral | sac | todos
  const [requesterFilter, setRequesterFilter] = useState('abertos'); // abertos | sac | aprovacao | concluidos | todos
  const [viewMode, setViewMode] = useState('lista'); // lista | kanban

  // Modais e overlays
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Pop-ups flutuantes em tempo real
  const [popups, setPopups] = useState([]);

  // Estado PWA
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isStandalonePWA, setIsStandalonePWA] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);

  // Relógio reativo para atualização ao vivo dos SLAs (a cada 30s)
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(()=>{window.addEventListener('pointerdown',unlockBravaAudio);return()=>window.removeEventListener('pointerdown',unlockBravaAudio);},[]);
  // Preferência de áudio é local; dados corporativos NUNCA usam localStorage.
  useEffect(() => safeStorageSet('soundEnabled', soundEnabled), [soundEnabled]);

  useEffect(() => {
    if (!supabaseConfigured) { setAuthLoading(false); return; }
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setDataError(error.message);
      setAuthUser(data.user || null);
      setCurrentUserId(data.user?.id || null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthUser(session?.user || null);
      setCurrentUserId(session?.user?.id || null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const reloadData = useCallback(async () => {
    if (!supabaseConfigured || !authUser) return;
    const results = await Promise.all([
      supabase.from('profiles').select('id,role,active,data,created_at'),
      supabase.from('tickets').select('id,data'),
      supabase.from('notifications').select('id,data'),
      supabase.from('app_settings').select('data').eq('id', 1).maybeSingle()
    ]);
    const errors = results.filter((r) => r.error).map((r) => r.error.message);
    if (errors.length) { setDataError(errors.join(' | ')); return; }
    setDataError('');
    setUsers(results[0].data.map((r) => ({...r.data, id:r.id, role:r.role, active:r.active, createdAt:r.created_at})));
    setTickets(results[1].data.map((r) => ({...r.data, id:r.id})));
    setNotifications(results[2].data.map((r) => ({...r.data, id:r.id})));
    setSettings({...DEFAULT_SETTINGS, ...(results[3].data?.data || {}), categories:results[3].data?.data?.categories || DEFAULT_CATEGORIES, customStages:results[3].data?.data?.customStages || [], departments:results[3].data?.data?.departments || DEFAULT_SETTINGS.departments});
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser || !supabaseConfigured) {
      setUsers([]); setTickets([]); setNotifications([]);
      return;
    }
    reloadData();
    // Cada alteração relevante atualiza os painéis abertos sem recarregar a página.
    const channel = supabase.channel('mktdesk-sync')
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, reloadData)
      .on('postgres_changes', { event:'*', schema:'public', table:'tickets' }, reloadData)
      .on('postgres_changes', { event:'*', schema:'public', table:'notifications' }, reloadData)
      .on('postgres_changes', { event:'*', schema:'public', table:'app_settings' }, reloadData)
      .subscribe();
    const refresh=()=>reloadData(); const poll=setInterval(refresh,30000); window.addEventListener('focus',refresh); return () => { clearInterval(poll); window.removeEventListener('focus',refresh); supabase.removeChannel(channel); };
  }, [authUser?.id, reloadData]);

  const saveRecord = useCallback(async (table, value, extras = {}, expectedUpdatedAt) => {
    if (!supabaseConfigured || !authUser) {
      const error = new Error('Faça login no Supabase para salvar.');
      setDataError(error.message);
      throw error;
    }
    // IMPORTANTE: não usar upsert nos chamados.
    // O PostgreSQL executa os triggers BEFORE INSERT mesmo no caminho
    // ON CONFLICT DO UPDATE, bloqueando transições para SAC/produção/aprovação.
    // Verificamos o registro e usamos INSERT ou UPDATE explicitamente.
    try {
      const { data: existing, error: lookupError } = await supabase
        .from(table).select('id').eq('id', value.id).maybeSingle();
      if (lookupError) throw lookupError;

      const payload = { id: value.id, data: value, ...extras };
      let query=existing?supabase.from(table).update(payload).eq('id',value.id):supabase.from(table).insert(payload);
      if(existing&&table==='tickets'&&expectedUpdatedAt)query=query.eq('data->>updatedAt',expectedUpdatedAt);
      const {data:changed,error}=await query.select('id,data');
      if (error) throw error;
      if (!changed?.length) throw new Error('Registro não foi salvo. Atualize o chamado e confira as permissões; ele pode ter sido alterado por outra pessoa.');
      await reloadData();
      return changed[0].data;
    } catch (error) {
      setDataError(`Falha ao salvar ${table}: ${error.message || String(error)}`);
      throw error;
    }
  }, [authUser, reloadData]);

  const persistUserDoc = useCallback(async (userObj) => {
    // Gerenciamento de papéis é protegido pelas políticas RLS no Supabase.
    const {passwordHash: _ignored, ...safe} = userObj;
    if (!users.some((u) => u.id === safe.id)) {
      throw new Error('A pessoa precisa criar sua conta antes de receber uma função.');
    }
    const { error } = await supabase.from('profiles').update({
      role:safe.role, active:safe.active !== false, data:safe
    }).eq('id', safe.id);
    if (error) { setDataError(error.message); throw error; }
    await reloadData();
  }, [users, reloadData]);
  const persistTicketDoc = useCallback(async (obj) => {
    const saved = await saveRecord('tickets', obj, {requester_id:obj.requesterId},tickets.find(t=>t.id===obj.id)?.updatedAt);
    try { const {data:{session}} = await supabase.auth.getSession(); if(session) await fetch('/api/push', {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({ticketId:obj.id})}); } catch {}
    return saved;
  }, [saveRecord,tickets]);
  const handleSetCustomStage = async (ticket, stageId) => {
    if (!currentUser || !['admin','super_admin','tecnico'].includes(currentUser.role)) return;
    const stage = (settings.customStages || []).find(x => x.id === stageId && x.active !== false);
    if (stageId && (!stage || stage.baseStatus !== ticket.status)) return;
    await persistTicketDoc({
      ...ticket, customStageId: stageId || null, updatedAt: new Date().toISOString(),
      timeline: [...(ticket.timeline || []), {id:generateId('msg'),type:'system',authorId:currentUser.id,authorName:currentUser.name,authorRole:currentUser.role,content:stage ? `Etapa definida: ${stage.name}.` : 'Etapa personalizada removida.',createdAt:new Date().toISOString()}]
    });
  };
  const persistNotificationDoc = useCallback(async (obj) => {
    await saveRecord('notifications', obj, {user_id:obj.userId});
  }, [saveRecord]);
  const persistSettingsDoc = useCallback(async (obj) => {
    // Chaves privadas de serviços externos NÃO podem ficar no frontend.
    const {webhookSecret:_secret, webhookUrl:_url, techInviteCode:_t, adminInviteCode:_a, ...publicSettings} = obj;
    const {error} = await supabase.from('app_settings').upsert({id:1, data:publicSettings});
    if (error) { setDataError(error.message); throw error; }
    await reloadData();
  }, [reloadData]);

  /**
   * --------------------------------------------------------------------------
   * CONFIGURAÇÃO DINÂMICA DE PWA (MANIFEST, META TAGS, ÍCONES PNG & INSTALL)
   * --------------------------------------------------------------------------
   */
  useEffect(() => {
    try {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
      setIsStandalonePWA(standalone);

      const ua = window.navigator.userAgent || '';
      const ios = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      setIsIOSDevice(ios);

      const icon192 = new URL("/icon-192.png", window.location.origin).href;
      const icon512 = new URL("/icon-512.png", window.location.origin).href;

      const ensureMeta = (name, content) => {
        let tag = document.querySelector(`meta[name="${name}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('name', name);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };

      ensureMeta('mobile-web-app-capable', 'yes');
      ensureMeta('apple-mobile-web-app-capable', 'yes');
      ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
      ensureMeta('apple-mobile-web-app-title', 'BravaDesk');
      ensureMeta('theme-color', document.documentElement.dataset.theme==='dark'?'#101e22':'#07515a');

      if (icon192) {
        let appleLink = document.querySelector('link[rel="apple-touch-icon"]');
        if (!appleLink) {
          appleLink = document.createElement('link');
          appleLink.setAttribute('rel', 'apple-touch-icon');
          document.head.appendChild(appleLink);
        }
        appleLink.setAttribute('href', icon192);
      }

    } catch {
      // Ignora restrições de DOM em previews isolados
    }
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsStandalonePWA(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerPWAInstall = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setDeferredInstallPrompt(null);
        }
      } catch {
        setShowIOSInstallModal(true);
      }
    } else {
      setShowIOSInstallModal(true);
    }
  };

  /**
   * --------------------------------------------------------------------------
   * MOTOR DE POP-UPS EM TEMPO REAL, NOTIFICAÇÃO NATIVA & WEBHOOK DE E-MAIL
   * --------------------------------------------------------------------------
   */
  const showFloatingPopup = useCallback(
    ({ title, message, type = 'info', ticketId = null, withSound = true }) => {
      const id = generateId('pop');
      setPopups((prev) => [{ id, title, message, type, ticketId }, ...prev].slice(0, 4));
      if (withSound) {
        playGentleChime(soundEnabled);
      }
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.id !== id));
      }, 6500);
    },
    [soundEnabled]
  );

  const sendBrowserNativeNotification = useCallback((title, body) => {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification(title, { body });
          }
        });
      }
    } catch {
      // Ignora ambientes sem Notification API
    }
  }, []);

  // As notificações de chamados são criadas pelo trigger no banco.

  /**
   * --------------------------------------------------------------------------
   * OPERAÇÕES DE NEGÓCIO (CHAMADOS, SAC, APROVAÇÃO, CSAT, EQUIPE)
   * --------------------------------------------------------------------------
   */
  const generateNextProtocol = () => 'Gerado ao salvar';

  const handleCreateTicket = async (formData) => {
    if (!currentUser) return;
    if (!settings.categories.some(c => c.id === formData.categoryId && c.active !== false)) {
      throw new Error('Serviço indisponível. Escolha um serviço ativo.');
    }
    const categoryObj =
      settings.categories.find((c) => c.id === formData.categoryId && c.active !== false) ||
      settings.categories.find(c => c.active !== false) ||
      DEFAULT_CATEGORIES[0];

    let protocol = null;
    const nowIso = new Date().toISOString();

    const newTicket = {
      id: generateId('tkt'),
      protocol,
      title: formData.title.trim(),
      categoryId: categoryObj.id,
      categoryName: categoryObj.name,
      slaHours: Number(categoryObj.slaHours || 24),
      priority: formData.priority || 'normal',
      department: formData.department,
      observerIds: formData.observerIds || [],
      objective: formData.objective.trim(),
      description: formData.description.trim(),
      referenceLink: formData.referenceLink.trim(),
      status: 'novo',
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      requesterEmail: currentUser.email,
      assignedTechId: null,
      assignedTechName: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      firstResponseAt: null,
      sacPausedAt: null,
      totalPausedMs: 0,
      completedAt: null,
      deliveryLink: '',
      csatRating: null,
      csatComment: '',
      timeline: [
        {
          id: generateId('msg'),
          type: 'system',
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: currentUser.role,
          content: `Demanda aberta • Categoria: ${categoryObj.name} (SLA: ${categoryObj.slaHours}h).`,
          createdAt: nowIso
        }
      ]
    };

    const savedTicket = await persistTicketDoc(newTicket);
    protocol = savedTicket.protocol;
    newTicket.protocol = protocol;
    setShowNewTicketModal(false);
    setActiveTicketId(newTicket.id);
    if (formData.referenceFiles?.length) {
      try {
        await handlePostMessage(savedTicket, {content:'Referências do briefing', isInternal:false, files:formData.referenceFiles, isReference:true});
      } catch (error) {
        setDataError(`Chamado ${protocol} criado, mas não foi possível anexar as referências: ${error.message}. Abra o chat deste chamado e envie os arquivos novamente.`);
        showFloatingPopup({title: "Chamado criado sem anexos", message: "Não foi possível enviar as referências. Reenvie pelo chat.", type:"warning",ticketId:newTicket.id});
      }
    }

    // Notifica toda a equipe de Marketing (Admins + Técnicos ativos)
    const mktTeam = users.filter(
      (u) => u.active !== false && (['admin','super_admin'].includes(u.role) || u.role === 'tecnico')
    );

    showFloatingPopup({
      title: `Demanda ${protocol} Registrada`,
      message: `Sua solicitação foi enviada para triagem do Marketing (SLA: ${categoryObj.slaHours}h).`,
      type: 'success',
      ticketId: newTicket.id
    });
  };

  const handleAssignTech = async (ticket, techId) => {
    if (!currentUser) return;
    const tech = users.find((u) => u.id === techId);
    const nowIso = new Date().toISOString();

    // Se estava pausado em SAC e foi reatribuído, mantém status ou coloca em_atendimento se era novo
    const nextStatus =
      ticket.status === 'novo' && tech ? 'em_atendimento' : ticket.status;

    const updated = {
      ...ticket,
      assignedTechId: tech ? tech.id : null,
      assignedTechName: tech ? tech.name : null,
      status: nextStatus,
      firstResponseAt:
        ticket.firstResponseAt || (tech ? nowIso : null),
      updatedAt: nowIso,
      timeline: [
        ...ticket.timeline,
        {
          id: generateId('msg'),
          type: 'system',
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: currentUser.role,
          content: tech
            ? `Chamado atribuído para ${tech.name} (${ROLE_META[tech.role]?.shortLabel || 'Marketing'}).`
            : 'Atribuição técnica removida (retornou para fila geral).',
          createdAt: nowIso
        }
      ]
    };

    await persistTicketDoc(updated);

    if (tech) {
    }
  };

  const handlePostMessage = async (ticket, { content = '', isInternal = false, files = [], isReference = false }) => {
    if (!currentUser || (!content.trim() && !files.length)) throw new Error('Escreva uma mensagem ou selecione uma referência.');
    const staff = ['admin','super_admin','tecnico'].includes(currentUser.role);
    if (!staff && ticket.requesterId !== currentUser.id) throw new Error('Acesso somente para visualização.');
    if (isInternal && !staff) throw new Error('Nota interna exclusiva da equipe.');
    const attachments = await uploadReferences(ticket.id, currentUser.id, isInternal, files);
    const {error} = await supabase.rpc('bd_post_reference_message', {
      p_ticket_id:ticket.id, p_content:content.trim(), p_internal:isInternal,
      p_attachments:attachments, p_reference:isReference
    });
    if (error) throw error;
    await reloadData();
    {
      try { const {data:{session}} = await supabase.auth.getSession(); if(session) await fetch('/api/push', {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({ticketId:ticket.id})}); } catch {}
    }
  };

  /**
   * Pausar SAC: Técnico/Admin solicita informação ao solicitante e congela o relógio de SLA
   */
  const handlePauseForSAC = async (ticket, questionText) => {
    if (!currentUser || !questionText.trim()) return;
    const nowIso = new Date().toISOString();

    const updated = {
      ...ticket,
      status: 'aguardando_solicitante',
      assignedTechId: ticket.assignedTechId || currentUser.id,
      assignedTechName: ticket.assignedTechName || currentUser.name,
      firstResponseAt: ticket.firstResponseAt || nowIso,
      sacPausedAt: nowIso,
      updatedAt: nowIso,
      timeline: [
        ...ticket.timeline,
        {
          id: generateId('msg'),
          type: 'sac_pause',
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: currentUser.role,
          content: questionText.trim(),
          createdAt: nowIso
        }
      ]
    };

    await persistTicketDoc(updated);

    const reqUser = users.find((u) => u.id === ticket.requesterId);

    showFloatingPopup({
      title: `SAC Pausado • ${ticket.protocol}`,
      message: 'SLA congelado até o solicitante responder.',
      type: 'warning',
      ticketId: ticket.id
    });
  };

  /**
   * Destravar SAC: Solicitante responde e retoma o cronômetro de SLA
   */
  const handleUnlockSAC = async (ticket, replyText) => {
    if (!currentUser || !replyText.trim()) return;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const pausedDuration = ticket.sacPausedAt
      ? Math.max(0, nowMs - new Date(ticket.sacPausedAt).getTime())
      : 0;

    const updated = {
      ...ticket,
      status: 'em_atendimento',
      sacPausedAt: null,
      totalPausedMs: Number(ticket.totalPausedMs || 0) + pausedDuration,
      updatedAt: nowIso,
      timeline: [
        ...ticket.timeline,
        {
          id: generateId('msg'),
          type: 'sac_unlock',
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: currentUser.role,
          content: replyText.trim(),
          pausedDurationMs: pausedDuration,
          createdAt: nowIso
        }
      ]
    };

    await persistTicketDoc(updated);

    const targets = ticket.assignedTechId
      ? users.filter((u) => u.id === ticket.assignedTechId)
      : users.filter((u) => ['admin','super_admin'].includes(u.role) || u.role === 'tecnico');


    showFloatingPopup({
      title: `Demanda ${ticket.protocol} Destravada`,
      message: 'Sua resposta foi enviada e o atendimento foi retomado.',
      type: 'success',
      ticketId: ticket.id
    });
  };

  /**
   * Enviar para Revisão Interna do Solicitante
   */
  const handleSendDelivery = async (ticket, { deliveryNotes, deliveryLink }) => {
    if (!currentUser || !deliveryNotes.trim()) throw Error('Informe as observações da entrega.');
    await workflowRPC('bd081_review',{tid:ticket.id,action:'submit',notes:deliveryNotes.trim(),link:(deliveryLink||'').trim()},ticket.id);
    await reloadData();
    showFloatingPopup({title:`Revisão interna • ${ticket.protocol}`,message:'Versão enviada à administração do Marketing.',type:'success',ticketId:ticket.id});
  };

  /**
   * Solicitante Aprova Entrega + Avaliação CSAT (1 a 5 estrelas)
   */
  const handleApproveDelivery = async (ticket, { rating, comment }) => {
    if (!currentUser) return;
    const nowIso = new Date().toISOString();

    const updated = {
      ...ticket,
      status: 'concluido',
      completedAt: nowIso,
      updatedAt: nowIso,
      csatRating: Number(rating || 5),
      csatComment: (comment || '').trim(),
      timeline: [
        ...ticket.timeline,
        {
          id: generateId('msg'),
          type: 'approved',
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: currentUser.role,
          content: comment?.trim()
            ? `Entrega aprovada com nota CSAT ${rating}/5: "${comment.trim()}"`
            : `Entrega aprovada com nota CSAT ${rating}/5.`,
          csatRating: Number(rating || 5),
          createdAt: nowIso
        }
      ]
    };

    await persistTicketDoc(updated);

    const targets = users.filter(
      (u) => u.id === ticket.assignedTechId || ['admin','super_admin'].includes(u.role)
    );

    showFloatingPopup({
      title: `Demanda ${ticket.protocol} Concluída!`,
      message: `Obrigado pela sua avaliação CSAT (${rating}/5 estrelas).`,
      type: 'success',
      ticketId: ticket.id
    });
  };

  /**
   * Solicitante Solicita Ajustes na Entrega
   */
  const handleRequestAdjustments = async (ticket, adjustmentNotes) => {
    if (!currentUser || !adjustmentNotes.trim()) return;
    const nowIso = new Date().toISOString();

    const updated = {
      ...ticket,
      status: 'em_atendimento',
      updatedAt: nowIso,
      timeline: [
        ...ticket.timeline,
        {
          id: generateId('msg'),
          type: 'adjustment',
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: currentUser.role,
          content: adjustmentNotes.trim(),
          createdAt: nowIso
        }
      ]
    };

    await persistTicketDoc(updated);

    const targets = ticket.assignedTechId
      ? users.filter((u) => u.id === ticket.assignedTechId)
      : users.filter((u) => ['admin','super_admin'].includes(u.role) || u.role === 'tecnico');


    showFloatingPopup({
      title: `Solicitação de Ajustes Enviada`,
      message: `O time de Marketing foi notificado sobre os ajustes em ${ticket.protocol}.`,
      type: 'warning',
      ticketId: ticket.id
    });
  };

  /**
   * Cobrança de Pendências SAC por Departamento (Painel BI Admin)
   */
  const handleNudgeDepartmentSAC = async (deptName, pausedTickets) => {
    if (!pausedTickets || pausedTickets.length === 0) return;

    const reqIds = Array.from(
      new Set(pausedTickets.map((t) => t.requesterId).filter(Boolean))
    );
    const reqEmails = Array.from(
      new Set(pausedTickets.map((t) => t.requesterEmail).filter(Boolean))
    );
    const protocols = pausedTickets.map((t) => t.protocol).join(', ');


    showFloatingPopup({
      title: 'Lembrete manual indisponível',
      message: 'O lembrete manual ainda não está disponível nesta versão.',
      type: 'success'
    });
  };

  /**
   * --------------------------------------------------------------------------
   * FILTRAGEM DE NOTIFICAÇÕES & CHAMADO ATIVO
   * --------------------------------------------------------------------------
   */
  const myNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications
      .filter((n) => n.userId === currentUser.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [notifications, currentUser]);

  const seenNotifications = useRef({user:null, ids:new Set(), ready:false});
  useEffect(() => {
    if (!currentUser) { seenNotifications.current = {user:null,ids:new Set(),ready:false}; return; }
    const seen = seenNotifications.current;
    if (seen.user !== currentUser.id || !seen.ready) {
      seenNotifications.current = {user:currentUser.id,ids:new Set(myNotifications.map(n=>n.id)),ready:true}; return;
    }
    for(const n of myNotifications) if(!seen.ids.has(n.id)) {
      seen.ids.add(n.id);
      if(!n.read && document.visibilityState==='visible') {
        showFloatingPopup({title:n.title,message:n.message,ticketId:n.ticketId,type:n.type});
        if(safeStorageGet('vibration:'+currentUser.id,true)) navigator.vibrate?.([140,70,140]);
      }
    }
  }, [myNotifications,currentUser?.id,showFloatingPopup]);
  useEffect(()=>{ const id=new URLSearchParams(location.search).get('ticket'); if(id && currentUser && tickets.some(t=>t.id===id)) {setActiveTicketId(id);history.replaceState(null,'',location.pathname);} },[tickets,currentUser?.id]);

  const unreadCount = useMemo(
    () => myNotifications.filter((n) => !n.read).length,
    [myNotifications]
  );

  const handleMarkNotificationRead = async (notif) => {
    if (!notif.read) {
      await persistNotificationDoc({ ...notif, read: true });
    }
    if (notif.ticketId) {
      setActiveTicketId(notif.ticketId);
      setShowNotificationsDrawer(false);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = myNotifications.filter((n) => !n.read);
    for (const n of unread) {
      await persistNotificationDoc({ ...n, read: true });
    }
  };

  const activeTicket = useMemo(
    () => tickets.find((t) => t.id === activeTicketId) || null,
    [tickets, activeTicketId]
  );

  /**
   * ==========================================================================
   * RENDERIZAÇÃO: TELA DE AUTENTICAÇÃO / PRIMEIRO ACESSO
   * ==========================================================================
   */
  if (authLoading) return <div className="p-8 text-center">Verificando sessão do Supabase…</div>;
  if (!supabaseConfigured) return <div className="p-8 max-w-lg mx-auto"><h1 className="font-bold">Supabase não configurado</h1><p>Adicione VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY na Vercel e publique novamente.</p></div>;
  if (!currentUser) {
    return (
      <>
        {dataError && <p className="text-red-700 bg-red-50 p-3 text-sm">{dataError}</p>}
        {authUser ? (
          <div className="min-h-screen flex flex-col gap-4 items-center justify-center p-6 text-center">
            <h1 className="text-2xl font-bold">Preparando seu acesso</h1>
            <p>Seu perfil não está disponível ou foi bloqueado. Se acabou de confirmar o e-mail, atualize a página.</p>
            <button className="text-indigo-700 underline" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        ) : <><AuthScreen /><div className="fixed bottom-4 right-4 z-30"><button type="button" onClick={triggerPWAInstall} className="bg-indigo-600 text-white rounded-xl px-4 py-3 text-sm shadow-lg">Instalar BravaDesk</button></div></>}
        <ToastPopups
          popups={popups}
          onDismiss={(id) => setPopups((prev) => prev.filter((p) => p.id !== id))}
          onSelectTicket={(tid) => setActiveTicketId(tid)}
        />
        {showIOSInstallModal && (
          <IOSInstallModal onClose={() => setShowIOSInstallModal(false)} />
        )}
      </>
    );
  }

  /**
   * ==========================================================================
   * RENDERIZAÇÃO: AMBIENTE OPERACIONAL LOGADO (ADMIN / TÉCNICO / SOLICITANTE)
   * ==========================================================================
   */
  const requesterPausedTickets = tickets.filter(
    (t) =>
      t.requesterId === currentUser.id && t.status === 'aguardando_solicitante'
  );
  const requesterApprovalTickets = tickets.filter(
    (t) => t.requesterId === currentUser.id && t.status === 'em_aprovacao'
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pb-20 md:pb-0">
      {/* CABEÇALHO CORPORATIVO (APENAS USUÁRIO REAL LOGADO) */}
      <HeaderBar
        currentUser={currentUser}
        unreadCount={unreadCount}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        onOpenNotifications={() => setShowNotificationsDrawer((v) => !v)}
        onLogout={async () => {
          try { const reg=await navigator.serviceWorker?.getRegistration(); const sub=await reg?.pushManager?.getSubscription(); if(sub){ await supabase.rpc('bd_remove_device',{p_endpoint:sub.endpoint}); await sub.unsubscribe(); } } catch {}
          await supabase.auth.signOut();
          setActiveTicketId(null);
          setShowNotificationsDrawer(false);
        }}
        canInstallPWA={!isStandalonePWA}
        onInstallPWA={triggerPWAInstall}
      />

      {dataError && (
        <div role="alert" className="mx-auto w-full max-w-7xl px-6 py-3">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <span><strong>Erro ao salvar ou sincronizar:</strong> {dataError}</span>
            <button type="button" className="font-bold underline" onClick={() => setDataError('')}>Fechar</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl w-full mx-auto px-4 py-2"><NotificationPreferences key={currentUser.id} userId={currentUser.id} soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled}/>{currentUser.role==='solicitante' && <RedeemInvite onDone={reloadData}/>}</div>
      {/* BARRA DE NAVEGAÇÃO SUPERIOR (DESKTOP) POR PERFIL */}
      {['admin','super_admin'].includes(currentUser.role) && (
        <div className="hidden md:block bg-white border-b border-slate-200 sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
            <nav className="flex space-x-1 py-2">
              {[
                {
                  id: 'bi',
                  label: 'Dashboards & BI',
                  icon: LayoutDashboard
                },
                {
                  id: 'torre',
                  label: 'Torre de Controle & Triagem',
                  icon: Kanban,
                  badge: tickets.filter((t) => !['concluido','cancelado'].includes(t.status)).length
                },
                {
                  id: 'equipe',
                  label: 'Equipe & Usuários',
                  icon: Users,
                  badge: users.length
                },
                {
                  id: 'config',
                  label: 'Serviços, Status & Configurações',
                  icon: Settings
                }
              ].map((tab) => {
                const Icon = tab.icon;
                const active = adminTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setAdminTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      active
                        ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {typeof tab.badge === 'number' && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full tabular-nums ${
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <button
              onClick={() => setShowNewTicketModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Nova Demanda
            </button>
          </div>
        </div>
      )}

      {currentUser.role === 'tecnico' && (
        <div className="hidden md:block bg-white border-b border-slate-200 sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
            <nav className="flex space-x-1 py-2">
              {[
                {
                  id: 'minha',
                  label: 'Minha Fila',
                  count: tickets.filter(
                    (t) =>
                      t.assignedTechId === currentUser.id &&
                      !['concluido','cancelado'].includes(t.status)
                  ).length
                },
                {
                  id: 'geral',
                  label: 'Fila Geral Disponível',
                  count: tickets.filter(
                    (t) => !t.assignedTechId && !['concluido','cancelado'].includes(t.status)
                  ).length
                },
                {
                  id: 'sac',
                  label: 'Aguardando Solicitante (SAC)',
                  count: tickets.filter(
                    (t) => t.status === 'aguardando_solicitante'
                  ).length
                },
                {
                  id: 'todos',
                  label: 'Todos os Chamados',
                  count: tickets.length
                }
              ].map((q) => {
                const active = techQueue === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => setTechQueue(q.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      active
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span>{q.label}</span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full tabular-nums ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {q.count}
                    </span>
                  </button>
                );
              })}
            </nav>

            <button
              onClick={() => setShowNewTicketModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Abrir Demanda
            </button>
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL POR PERFIL */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-7">
        <details className="mb-5 bg-white border border-slate-200 rounded-xl p-3"><summary className="cursor-pointer font-bold text-indigo-700">Central de produção · v0.8.2</summary><div className="mt-3"><ProductionPanel key={currentUser.id} user={currentUser} tickets={tickets} users={users} onSelect={setActiveTicketId} calculateSLA={calculateTicketSLA} nowTick={nowTick}/></div></details>
        {/* ======================== PAINEL ADMIN ======================== */}
        {['admin','super_admin'].includes(currentUser.role) && (
          <>
            {adminTab === 'bi' && (
              <AdminDashboardBI
                tickets={tickets}
                users={users}
                settings={settings}
                nowTick={nowTick}
                onSelectTicket={(id) => setActiveTicketId(id)}
                onNudgeDepartmentSAC={handleNudgeDepartmentSAC}
              />
            )}

            {adminTab === 'torre' && (
              <TicketBoardView
                title="Torre de Controle & Triagem"
                subtitle="Visão unificada de todas as demandas de Marketing, atribuição técnica e acompanhamento de SLA."
                tickets={tickets}
                users={users}
                currentUser={currentUser}
                customStages={settings.customStages || []}
                viewMode={viewMode}
                onChangeViewMode={setViewMode}
                nowTick={nowTick}
                onSelectTicket={(id) => setActiveTicketId(id)}
                onAssignTech={handleAssignTech}
                onOpenNewTicket={() => setShowNewTicketModal(true)}
                allowTechFilter
              />
            )}

            {adminTab === 'equipe' && (
              <AdminTeamManager
                users={users}
                currentUser={currentUser}
                settings={settings}
                onSaveUser={persistUserDoc}
                onNotify={(title, message, type = 'success') =>
                  showFloatingPopup({ title, message, type })
                }
                onRequestConfirm={setConfirmDialog}
              />
            )}

            {adminTab === 'config' && (
              <AdminSettingsPanel
                settings={settings}
                users={users}
                tickets={tickets}
                notifications={notifications}
                canInstallPWA={!isStandalonePWA}
                isStandalonePWA={isStandalonePWA}
                onInstallPWA={triggerPWAInstall}
                onSaveSettings={async (updated) => {
                  try {
                    await persistSettingsDoc(updated);
                    showFloatingPopup({
                      title: 'Configurações Salvas no Supabase',
                      message: 'Serviços, status e regras de SLA foram atualizados.',
                      type: 'success'
                    });
                  } catch (err) {
                    showFloatingPopup({
                      title: 'Erro ao salvar configurações',
                      message: err?.message || 'Confira as permissões no Supabase.',
                      type: 'warning'
                    });
                  }
                }}
                onTestPopupAndSound={() => {
                  showFloatingPopup({
                    title: 'Teste de Alerta em Tempo Real',
                    message:
                      'Pop-up visual e alerta sonoro funcionando perfeitamente neste dispositivo.',
                    type: 'info',
                    withSound: true
                  });
                  sendBrowserNativeNotification(
                    'BravaDesk • Teste de Notificação',
                    'As notificações nativas estão ativas.'
                  );
                }}
                onRestoreBackup={async (backupData) => {
                  if (Array.isArray(backupData.users)) {
                    for (const u of backupData.users) await persistUserDoc(u);
                  }
                  if (Array.isArray(backupData.tickets)) {
                    for (const t of backupData.tickets) await persistTicketDoc(t);
                  }
                  if (backupData.settings) {
                    await persistSettingsDoc({
                      ...DEFAULT_SETTINGS,
                      ...backupData.settings
                    });
                  }
                  showFloatingPopup({
                    title: 'Backup Restaurado',
                    message: 'Os dados do arquivo JSON foram importados com sucesso.',
                    type: 'success'
                  });
                }}
                onRequestConfirm={setConfirmDialog}
              />
            )}
          </>
        )}

        {/* ======================= PAINEL TÉCNICO ======================= */}
        {currentUser.role === 'tecnico' && (
          <TechWorkspace
            customStages={settings.customStages || []}
            tickets={tickets}
            users={users}
            currentUser={currentUser}
            techQueue={techQueue}
            onChangeQueue={setTechQueue}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            nowTick={nowTick}
            onSelectTicket={(id) => setActiveTicketId(id)}
            onAssignTech={handleAssignTech}
            onOpenNewTicket={() => setShowNewTicketModal(true)}
          />
        )}

        {/* ===================== PAINEL SOLICITANTE ===================== */}
        {currentUser.role === 'solicitante' && (
          <RequesterPortal
            customStages={settings.customStages || []}
            tickets={tickets}
            currentUser={currentUser}
            filter={requesterFilter}
            onChangeFilter={setRequesterFilter}
            pausedTickets={requesterPausedTickets}
            approvalTickets={requesterApprovalTickets}
            nowTick={nowTick}
            onSelectTicket={(id) => setActiveTicketId(id)}
            onOpenNewTicket={() => setShowNewTicketModal(true)}
          />
        )}
      </main>

      {/* BARRA DE NAVEGAÇÃO INFERIOR FIXA NO MOBILE (SAFE-AREA) */}
      <MobileBottomNav
        currentUser={currentUser}
        adminTab={adminTab}
        onChangeAdminTab={setAdminTab}
        techQueue={techQueue}
        onChangeTechQueue={setTechQueue}
        requesterFilter={requesterFilter}
        onChangeRequesterFilter={setRequesterFilter}
        tickets={tickets}
        onOpenNewTicket={() => setShowNewTicketModal(true)}
      />

      {/* DRAWER / PAINEL DE NOTIFICAÇÕES */}
      {showNotificationsDrawer && (
        <NotificationsPanel
          notifications={myNotifications}
          onClose={() => setShowNotificationsDrawer(false)}
          onSelectNotification={handleMarkNotificationRead}
          onMarkAllRead={handleMarkAllRead}
        />
      )}

      {/* MODAL: ABRIR NOVA DEMANDA */}
      {showNewTicketModal && (
        <NewTicketModal
          currentUser={currentUser}
          categories={settings.categories.filter(c => c.active !== false)}
          departments={settings.departments.filter(d=>d.active!==false).map(d=>d.name)}
          departmentCatalog={settings.departments}
          users={users}
          nextProtocol={generateNextProtocol()}
          onClose={() => setShowNewTicketModal(false)}
          onSubmit={handleCreateTicket}
        />
      )}

      {/* MODAL: DETALHES DO CHAMADO & OPERAÇÃO GLPI */}
      {activeTicket && (
        <TicketDetailModal
          ticket={activeTicket}
          onRefresh={reloadData}
          departmentCatalog={settings.departments}
          currentUser={currentUser}
          users={users}
          customStages={settings.customStages || []}
          onSetCustomStage={(id) => handleSetCustomStage(activeTicket, id)}
          onSaveObservers={async ids => {await persistTicketDoc({...activeTicket,observerIds:ids,updatedAt:new Date().toISOString()});}}
          nowTick={nowTick}
          onClose={() => setActiveTicketId(null)}
          onAssignTech={(techId) => handleAssignTech(activeTicket, techId)}
          onPostMessage={(payload) => handlePostMessage(activeTicket, payload)}
          onPauseForSAC={(q) => handlePauseForSAC(activeTicket, q)}
          onUnlockSAC={(r) => handleUnlockSAC(activeTicket, r)}
          onSendDelivery={(d) => handleSendDelivery(activeTicket, d)}
          onApproveDelivery={(a) => handleApproveDelivery(activeTicket, a)}
          onRequestAdjustments={(n) => handleRequestAdjustments(activeTicket, n)}
        />
      )}

      {/* MODAL: INSTRUÇÕES DE INSTALAÇÃO IOS SAFARI */}
      {showIOSInstallModal && (
        <IOSInstallModal onClose={() => setShowIOSInstallModal(false)} />
      )}

      {/* MODAL DE CONFIRMAÇÃO CUSTOMIZADO (ZERO window.confirm) */}
      {confirmDialog && (
        <ConfirmDialogModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel || 'Confirmar'}
          danger={confirmDialog.danger}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => {
            const fn = confirmDialog.onConfirm;
            setConfirmDialog(null);
            if (fn) fn();
          }}
        />
      )}

      {/* POP-UPS FLUTUANTES EM TEMPO REAL (TOPO MOBILE / CANTO INFERIOR DESKTOP) */}
      <ToastPopups
        popups={popups}
        onDismiss={(id) => setPopups((prev) => prev.filter((p) => p.id !== id))}
        onSelectTicket={(tid) => setActiveTicketId(tid)}
      />
    </div>
  );
}

/**
 * ============================================================================
 * TELA DE AUTENTICAÇÃO REAL & PRIMEIRO ACESSO MASTER
 * ============================================================================
 */
function ThemeToggle() {
  const [dark,setDark]=useState(()=>document.documentElement.dataset.theme==='dark');
  function toggle(){const next=!dark;setDark(next);document.documentElement.dataset.theme=next?'dark':'light';safeStorageSet('theme',next?'dark':'light');document.querySelector('meta[name="theme-color"]')?.setAttribute('content',next?'#101e22':'#07515a');}
  return <button type="button" onClick={toggle} aria-pressed={dark} aria-label={dark?'Ativar modo claro':'Ativar modo escuro'} title={dark?'Modo claro':'Modo escuro'} className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition">{dark?<Sun className="w-5 h-5"/>:<Moon className="w-5 h-5"/>}</button>;
}

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [departments,setDepartments]=useState([]);
  useEffect(()=>{supabase.rpc('bd_active_departments').then(({data,error})=>{if(error){setNotice(error.message);return;}setDepartments(data||[]);setDepartment(data?.[0]||'');});},[]);
  const [jobTitle, setJobTitle] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(e) {
    e.preventDefault(); setNotice(''); setPending(true);
    try {
      if (mode === 'login') {
        const {error} = await supabase.auth.signInWithPassword({email:email.trim(),password});
        if (error) throw error;
      } else if (mode === 'register') {
        if(!departments.includes(department)) throw new Error('Selecione um departamento ativo.');
        const {data,error} = await supabase.auth.signUp({
          email:email.trim().toLowerCase(), password,
          options:{data:{name:name.trim(), department, jobTitle:jobTitle.trim()}}
        });
        if (error) throw error;
        setNotice(data.session ? 'Conta criada. Entrando…' : 'Cadastro recebido. Verifique seu e-mail para confirmar a conta. Use seu convite individual após entrar, se houver.');
      } else {
        const {error} = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setNotice('Se o e-mail estiver cadastrado, você receberá instruções de recuperação.');
      }
    } catch(err) {setNotice(err.message || 'Não foi possível concluir a operação.');}
    finally {setPending(false);}
  }
  return <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-7 space-y-5">
      <div className="flex justify-end"><ThemeToggle /></div>
      <div className="text-center"><img src="/logo-bravadesk.svg" alt="BravaDesk" className="mx-auto mb-3 w-16 h-16 rounded-2xl object-contain" /><h1 className="text-2xl font-bold">BravaDesk</h1><p className="text-sm text-slate-500">Central de Serviços e Demandas Corporativas</p></div>
      <div className="flex gap-2 justify-center text-sm">{[['login','Entrar'],['register','Cadastrar'],['reset','Recuperar senha']].map(([value,label])=><button key={value} type="button" onClick={()=>{setMode(value);setNotice('');}} className={'px-3 py-2 rounded-lg '+(mode===value?'bg-indigo-600 text-white':'bg-slate-100')}>{label}</button>)}</div>
      <form onSubmit={submit} className="space-y-3">
        {mode==='register'&&<><input className="w-full border rounded-lg p-3" placeholder="Nome completo" required value={name} onChange={e=>setName(e.target.value)}/><select className="w-full border rounded-lg p-3" value={department} onChange={e=>setDepartment(e.target.value)}><option value="" disabled>Selecione o departamento</option>{departments.map(d=><option key={d}>{d}</option>)}</select><input className="w-full border rounded-lg p-3" placeholder="Cargo" required value={jobTitle} onChange={e=>setJobTitle(e.target.value)}/></>}
        <input className="w-full border rounded-lg p-3" type="email" placeholder="E-mail corporativo" required value={email} onChange={e=>setEmail(e.target.value)}/>
        {mode!=='reset'&&<input className="w-full border rounded-lg p-3" type="password" minLength={8} placeholder="Senha (mínimo 8 caracteres)" required value={password} onChange={e=>setPassword(e.target.value)}/>}
        {notice&&<p role="status" className="text-sm text-indigo-800 bg-indigo-50 p-3 rounded-lg">{notice}</p>}
        <button disabled={pending} className="bg-indigo-600 text-white py-3 rounded-lg w-full font-semibold disabled:opacity-50">{pending?'Processando…':mode==='login'?'Entrar':mode==='register'?'Criar conta':'Enviar recuperação'}</button>
      </form>
      <p className="text-xs text-slate-500 text-center">Novas contas recebem o perfil Solicitante. Use um convite individual após entrar para ativar seu perfil de equipe.</p>
    </div>
  </div>;
}

/**
 * ============================================================================
 * CABEÇALHO CORPORATIVO (EXIBE APENAS O USUÁRIO REALMENTE LOGADO)
 * ============================================================================
 */
function HeaderBar({
  currentUser,
  unreadCount,
  soundEnabled,
  onToggleSound,
  onOpenNotifications,
  onLogout,
  canInstallPWA,
  onInstallPWA
}) {
  const roleInfo = ROLE_META[currentUser.role] || ROLE_META.solicitante;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Marca */}
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo-bravadesk.svg" alt="BravaDesk" className="w-10 h-10 rounded-xl object-contain shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                BravaDesk
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                Service Desk
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate hidden sm:block">
              Central de Serviços e Demandas Corporativas
            </p>
          </div>
        </div>

        {/* Controles do Usuário Real Logado */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {canInstallPWA && (
            <button
              type="button"
              onClick={onInstallPWA}
              title="Instalar App (PWA)"
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition"
            >
              <Smartphone className="w-4 h-4" />
              <span className="hidden lg:inline">Instalar App</span>
            </button>
          )}

          <ThemeToggle />
          {/* Toggle de Som */}
          <button
            type="button"
            onClick={onToggleSound}
            title={
              soundEnabled
                ? 'Alertas sonoros ativados'
                : 'Alertas sonoros silenciados'
            }
            className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 transition"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-indigo-600" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Sininho de Notificações */}
          <button
            type="button"
            onClick={onOpenNotifications}
            title="Notificações"
            className="relative p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 transition"
          >
            {unreadCount > 0 ? (
              <BellRing className="w-4 h-4 text-indigo-600" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <div className="h-6 w-px bg-slate-200 mx-0.5 hidden sm:block" />

          {/* Identificação do Usuário Logado */}
          <div className="flex items-center gap-2.5 pl-1">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-900 leading-tight">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-slate-500 leading-tight">
                {currentUser.jobTitle} • {currentUser.department}
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${roleInfo.badgeClass}`}
            >
              {roleInfo.shortLabel}
            </span>
          </div>

          {/* Botão Sair */}
          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta"
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-slate-600 hover:text-rose-700 hover:bg-rose-50 text-xs font-semibold transition"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * ============================================================================
 * BARRA DE NAVEGAÇÃO INFERIOR MOBILE (ADAPTADA POR PERFIL + SAFE AREA)
 * ============================================================================
 */
function MobileBottomNav({
  currentUser,
  adminTab,
  onChangeAdminTab,
  techQueue,
  onChangeTechQueue,
  requesterFilter,
  onChangeRequesterFilter,
  tickets,
  onOpenNewTicket
}) {
  if (['admin','super_admin'].includes(currentUser.role)) {
    const items = [
      { id: 'bi', label: 'BI', icon: LayoutDashboard },
      { id: 'torre', label: 'Torre', icon: Kanban },
      { id: 'equipe', label: 'Equipe', icon: Users },
      { id: 'config', label: 'Config', icon: Settings }
    ];
    return (
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-16">
          {items.map((item) => {
            const Icon = item.icon;
            const active = adminTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeAdminTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  active ? 'text-indigo-600' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  if (currentUser.role === 'tecnico') {
    const items = [
      { id: 'minha', label: 'Minha Fila', icon: UserCheck },
      { id: 'geral', label: 'Fila Geral', icon: Inbox },
      { id: 'sac', label: 'SAC', icon: PauseCircle },
      { id: 'todos', label: 'Todos', icon: List }
    ];
    return (
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-16">
          {items.map((item) => {
            const Icon = item.icon;
            const active = techQueue === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeTechQueue(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  active ? 'text-indigo-600' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // Solicitante
  const approvalCount = tickets.filter(
    (t) => t.requesterId === currentUser.id && t.status === 'em_aprovacao'
  ).length;

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3 h-16 items-center">
        <button
          onClick={() => onChangeRequesterFilter('abertos')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
            requesterFilter !== 'aprovacao' ? 'text-indigo-600' : 'text-slate-500'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span>Minhas Demandas</span>
        </button>

        <div className="flex justify-center">
          <button
            onClick={onOpenNewTicket}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/25"
          >
            <Plus className="w-4 h-4" />
            <span>Nova</span>
          </button>
        </div>

        <button
          onClick={() => onChangeRequesterFilter('aprovacao')}
          className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
            requesterFilter === 'aprovacao' ? 'text-indigo-600' : 'text-slate-500'
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>Aprovação</span>
          {approvalCount > 0 && (
            <span className="absolute top-2 right-6 px-1.5 py-0.2 rounded-full bg-purple-600 text-white text-[10px] font-bold">
              {approvalCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}

/**
 * ============================================================================
 * PAINEL ADMIN — ABA 1: DASHBOARDS & BI EXECUTIVO
 * ============================================================================
 */
function AdminDashboardBI({
  tickets,
  users,
  settings,
  nowTick,
  onSelectTicket,
  onNudgeDepartmentSAC
}) {
  const [period, setPeriod] = useState('month'); // mês atual ou período móvel
  const [deptFilter, setDeptFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');

  const filteredTickets = useMemo(() => {
    const cutoffMs =
      period === 'month'
        ? new Date(new Date(nowTick).getFullYear(), new Date(nowTick).getMonth(), 1).getTime()
        : period === '7d'
        ? nowTick - 7 * 86400000
        : period === '30d'
        ? nowTick - 30 * 86400000
        : period === '90d'
        ? nowTick - 90 * 86400000
        : 0;

    return tickets.filter((t) => {
      if (cutoffMs > 0 && new Date(t.createdAt).getTime() < cutoffMs) {
        return false;
      }
      if (deptFilter !== 'all' && t.department !== deptFilter) return false;
      if (catFilter !== 'all' && t.categoryId !== catFilter) return false;
      return true;
    });
  }, [tickets, period, deptFilter, catFilter, nowTick]);

  // Ranking de Gargalos SAC por Departamento
  const sacBottlenecks = useMemo(() => {
    const map = {};
    tickets
      .filter((t) => t.status === 'aguardando_solicitante')
      .forEach((t) => {
        const dept = t.department || 'Outros';
        if (!map[dept]) {
          map[dept] = { department: dept, tickets: [], oldestWaitMs: 0 };
        }
        const waitMs = t.sacPausedAt
          ? Math.max(0, nowTick - new Date(t.sacPausedAt).getTime())
          : 0;
        map[dept].tickets.push(t);
        if (waitMs > map[dept].oldestWaitMs) {
          map[dept].oldestWaitMs = waitMs;
        }
      });

    return Object.values(map).sort(
      (a, b) =>
        b.tickets.length - a.tickets.length || b.oldestWaitMs - a.oldestWaitMs
    );
  }, [tickets, nowTick]);

  // Scorecards da Equipe Técnica
  const techScorecards = useMemo(() => {
    const staff = users.filter(
      (u) => u.role === 'tecnico' || ['admin','super_admin'].includes(u.role)
    );
    return staff.map((member) => {
      const assigned = filteredTickets.filter(
        (t) => t.assignedTechId === member.id
      );
      const activeQueue = assigned.filter((t) => !['concluido','cancelado'].includes(t.status));
      const done = assigned.filter((t) => t.status === 'concluido');
      const inSla = assigned.filter(
        (t) => !calculateTicketSLA(t, nowTick).isBreached
      );
      const slaRate =
        assigned.length > 0
          ? Math.round((inSla.length / assigned.length) * 100)
          : 100;
      const rated = done.filter((t) => typeof t.csatRating === 'number');
      const csat =
        rated.length > 0
          ? (
              rated.reduce((s, t) => s + t.csatRating, 0) / rated.length
            ).toFixed(1)
          : '—';

      return {
        ...member,
        activeCount: activeQueue.length,
        doneCount: done.length,
        slaRate,
        csat
      };
    });
  }, [users, filteredTickets, nowTick]);

  // Exportação CSV real com BOM UTF-8
  const handleExportCSV = () => {
    const headers = [
      'Protocolo',
      'Titulo',
      'Status',
      'Prioridade',
      'Categoria',
      'SLA_Horas',
      'Situacao_SLA',
      'Prazo_formatado',
      'Previsao_entrega_Bahia',
      'Departamento',
      'Solicitante',
      'Email_Solicitante',
      'Responsavel_Tecnico',
      'Data_Abertura',
      'Data_Conclusao',
      'Nota_CSAT'
    ];

    const escapeCsv = (val) =>
      `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = filteredTickets.map((t) => {
      const sla = calculateTicketSLA(t, nowTick);
      return [
        t.protocol,
        t.title,
        STATUS_META[t.status]?.label || t.status,
        PRIORITY_META[t.priority]?.label || t.priority,
        t.categoryName,
        t.slaHours,
        sla.label,
        formatSLADuration(t.slaHours*3600000,t.businessSchedule),
        sla.deadline==null ? deliveryLabel(sla,t.status) : formatDeliveryDate(sla.deadline),
        t.department,
        t.requesterName,
        t.requesterEmail,
        t.assignedTechName || 'Não atribuído',
        formatDateTime(t.createdAt),
        t.completedAt ? formatDateTime(t.completedAt) : '',
        t.csatRating || ''
      ]
        .map(escapeCsv)
        .join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mktdesk-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const META_BASE = 85;
  const scope = tickets.filter(t => (deptFilter === 'all' || t.department === deptFilter) && (catFilter === 'all' || t.categoryId === catFilter));
  const now = new Date(nowTick);
  const start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : period === 'all' ? 0 : nowTick - Number.parseInt(period, 10) * 86400000;
  const inPeriod = value => { const ms = new Date(value).getTime(); return Boolean(value) && ms >= start && ms <= nowTick; };
  const opened = scope.filter(t => inPeriod(t.createdAt));
  const closed = scope.filter(t => t.status === 'concluido' && inPeriod(t.completedAt));
  const pending = opened.filter(t => t.status === 'aguardando_solicitante').length;
  const rate = opened.length ? closed.length / opened.length * 100 : null;
  const delta = rate === null ? null : (rate / META_BASE - 1) * 100;
  const fmt = n => n.toLocaleString('pt-BR', {maximumFractionDigits:1, minimumFractionDigits:1});
  const serviceCounts = new Map();
  opened.forEach(t => { const name = settings.categories.find(c => c.id === t.categoryId)?.name || t.categoryName || 'Outros'; serviceCounts.set(name, (serviceCounts.get(name)||0)+1); });
  const ranking = [...serviceCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  const rankMax = Math.max(1,...ranking.map(r=>r[1]));
  const statusColors = {cancelado:'#b3b9bd',concluido:'#104f59',em_atendimento:'#7ca2a6',novo:'#a9c5c7',aguardando_solicitante:'#d9a34b',em_aprovacao:'#8b82a5'};
  const segments = Object.keys(statusColors).map(key=>({key,label:STATUS_META[key].shortLabel,color:statusColors[key],count:opened.filter(t=>t.status===key).length})).filter(x=>x.count);
  let angle = 0;
  const gradient = segments.map(seg=>{ const from=angle; angle += seg.count/opened.length*360; return `${seg.color} ${from}deg ${angle}deg`; }).join(', ');
  const months = Array.from({length:12}, (_,i)=>{
    const from=new Date(now.getFullYear(),now.getMonth()-11+i,1);
    const to=new Date(from.getFullYear(),from.getMonth()+1,1);
    const during=value=> Boolean(value) && new Date(value)>=from && new Date(value)<to && new Date(value).getTime()<=nowTick;
    const created=scope.filter(t=>during(t.createdAt));
    return {label:from.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}).replace('.',''), opened:created.length, closed:scope.filter(t=>t.status==='concluido'&&during(t.completedAt)).length, late:created.filter(t=>calculateTicketSLA(t,nowTick).isBreached).length};
  });
  const axisMax=Math.max(4,Math.ceil(Math.max(...months.flatMap(m=>[m.opened,m.closed,m.late]))/4)*4);
  const chartY=n=>200-n/axisMax*165;
  const chartX=i=>66+i*72;

  return (
    <div className="space-y-6">
      {/* Cabeçalho & Filtros Executivos */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
            Dashboards & Inteligência Operacional (BI) · v0.4
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Indicadores de chamados, meta de fechamento e evolução mensal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="month">Mês atual</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="all">Todo o período</option>
          </select>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos os Departamentos</option>
            {[...new Set([...settings.departments.map(d=>d.name),...tickets.map(t=>t.department).filter(Boolean)])].sort().map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todas as Categorias</option>
            {settings.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <h3 className="font-bold text-sm">Próximas entregas</h3>
        {filteredTickets.filter(t=>!['concluido','cancelado'].includes(t.status)).map(t=>({t,sla:calculateTicketSLA(t,nowTick)})).sort((a,b)=>(a.sla.deadline??Infinity)-(b.sla.deadline??Infinity)).slice(0,10).map(({t,sla})=><button key={t.id} onClick={()=>onSelectTicket(t.id)} className="block text-left text-xs border-b border-slate-100 pb-2 w-full"><strong>{t.protocol} · {t.title}</strong><span className="block text-slate-600">{deliveryLabel(sla,t.status)}</span></button>)}
      </section>
      {/* Dashboard executivo - referência verde petróleo */}
      <section className="bd-dashboard rounded-3xl p-3 sm:p-4 space-y-4" style={{backgroundColor:'#416267'}}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[['Pendente',pending,'Aguardando solicitante'],['Aberto',opened.length,'Aberturas no período'],['Fechado',closed.length,'Conclusões no período'],['Meta',rate===null?'—':fmt(rate)+'%','Base: 85%']].map(([label,value,detail])=>(
                <div key={label} className="bd-metric bg-white rounded-2xl px-2 py-3 text-center min-w-0" style={{color:'#416267'}}>
                  <div className="text-lg sm:text-xl font-normal">{label}</div>
                  <div className="text-3xl xl:text-5xl font-normal tabular-nums mt-1">{value}</div>
                  {label==='Meta' && delta!==null && <div className={"text-sm font-semibold "+(delta>=0?"bd-meta-positive":"bd-meta-negative")} style={{color:delta>=0?'#15803d':'#b74724'}}>{delta>=0?'↑ +':'↓ '}{fmt(delta)}%</div>}
                  <p className="text-[10px] mt-1 text-slate-500">{detail}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl p-4 text-white" style={{backgroundColor:'#104f59'}}>
              <h3 className="text-sm font-semibold">Serviços mais solicitados</h3>
              {ranking.length===0 ? <p className="py-14 text-center text-sm">Nenhuma abertura no período.</p> : <div className="overflow-x-auto"><svg viewBox="0 0 600 155" className="w-full min-w-[320px]" role="img" aria-label="Ranking dos cinco serviços mais solicitados">
                {[0,.25,.5,.75,1].map(v=><g key={v}><line x1="32" x2="594" y1={110-v*85} y2={110-v*85} stroke="white" opacity=".25"/><text x="27" y={113-v*85} fill="white" fontSize="9" textAnchor="end">{Math.round(rankMax*v)}</text></g>)}
                {ranking.map(([name,count],i)=>{const slot=560/ranking.length; const x=32+i*slot+slot/2; const h=count/rankMax*85; return <g key={name}><rect x={x-slot*.34} y={110-h} width={slot*.68} height={h} fill="white"><title>{name}: {count}</title></rect><text x={x} y={105-h} fill="white" fontSize="11" textAnchor="middle">{count}</text><text x={x} y="126" textAnchor="middle" fill="white" fontSize="10">{name.length>22?name.slice(0,20)+'…':name}<title>{name}</title></text></g>;})}
              </svg></div>}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 flex flex-col justify-center gap-4">
            <h3 className="text-sm font-semibold text-slate-700">Distribuição por status</h3>
            {segments.length ? <div className="flex flex-wrap items-center justify-center gap-4"><div className="relative rounded-full w-40 h-40 shrink-0" style={{background:`conic-gradient(${gradient})`}} role="img" aria-label="Distribuição por status"/><div className="space-y-2 text-xs">{segments.map(seg=><div key={seg.key} className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0" style={{backgroundColor:seg.color}}/>{seg.label} · {fmt(seg.count/opened.length*100)}%</div>)}</div></div> : <p className="text-center text-sm text-slate-500 py-12">Sem dados no período</p>}
            <p className="text-[10px] text-slate-500 text-center">Situação atual dos chamados abertos no período.</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2"><h3 className="text-sm font-bold text-slate-700">Evolução mensal · últimos 12 meses</h3><div className="bd-month-legend flex flex-wrap gap-3 text-xs text-slate-600"><span style={{color:'#b74724'}}>━ Chamados atrasados</span><span style={{color:'#416267'}}>■ Abertos mês</span><span style={{color:'#104f59'}}>■ Fechados mês</span></div></div>
          <div className="overflow-x-auto"><svg viewBox="0 0 930 238" className="w-full min-w-[650px]" role="img" aria-label="Comparativo mensal de aberturas, conclusões e atrasos">
            {[0,1,2,3,4].map(i=>{const value=axisMax*i/4;return <g key={i}><line x1="34" x2="914" y1={chartY(value)} y2={chartY(value)} stroke="#e2e8f0"/><text x="28" y={chartY(value)+4} fontSize="10" textAnchor="end" fill="#64748b">{value}</text></g>;})}
            {months.map((m,i)=><g key={i}><rect x={chartX(i)-22} y={chartY(m.opened)} width="20" height={200-chartY(m.opened)} fill="#416267"><title>{m.label}: {m.opened} abertos</title></rect><rect x={chartX(i)+1} y={chartY(m.closed)} width="20" height={200-chartY(m.closed)} fill="#104f59"><title>{m.label}: {m.closed} fechados</title></rect><text x={chartX(i)} y="219" textAnchor="middle" fontSize="11" fill="#475569">{m.label}</text></g>)}
            <polyline points={months.map((m,i)=>`${chartX(i)},${chartY(m.late)}`).join(' ')} fill="none" stroke="#b74724" strokeWidth="2"/>
            {months.map((m,i)=><circle key={i} cx={chartX(i)} cy={chartY(m.late)} r="3" fill="#b74724"><title>{m.label}: {m.late} chamados fora do SLA</title></circle>)}
          </svg></div>
          <p className="text-[11px] text-slate-500">Aberturas por data de criação, fechamentos por data de conclusão. Atrasos por mês de abertura, conforme SLA atual ou final. O gráfico mantém 12 meses e respeita os filtros de departamento e serviço.</p>
        </div>
      </section>

      {/* RANKING DE GARGALOS SAC & SCORECARDS DA EQUIPE TÉCNICA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking de Gargalos SAC por Departamento */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Ranking de Gargalos SAC por Departamento
              </h3>
              <p className="text-xs text-slate-500">
                Demandas pausadas aguardando resposta das áreas solicitantes
              </p>
            </div>
            <PauseCircle className="w-5 h-5 text-amber-500" />
          </div>

          {sacBottlenecks.length === 0 ? (
            <div className="p-6 rounded-xl bg-emerald-50/60 border border-emerald-200/80 text-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto mb-1.5" />
              <p className="text-sm font-semibold text-emerald-900">
                Nenhum gargalo SAC pendente
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Nenhuma demanda está travada aguardando retorno dos
                solicitantes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sacBottlenecks.map((item) => (
                <div
                  key={item.department}
                  className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {item.department}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 text-xs font-bold tabular-nums">
                        {item.tickets.length}{' '}
                        {item.tickets.length === 1 ? 'parada' : 'paradas'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Maior espera:{' '}
                      <strong>{formatDuration(item.oldestWaitMs)}</strong> •{' '}
                      {item.tickets.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSelectTicket(t.id)}
                          className="underline font-semibold text-indigo-700 mr-1.5"
                        >
                          {t.protocol}
                        </button>
                      ))}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onNudgeDepartmentSAC(item.department, item.tickets)
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition shrink-0"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    Cobrar Pendências (Pop-up + E-mail)
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scorecards da Equipe Técnica */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Scorecards da Equipe de Marketing
              </h3>
              <p className="text-xs text-slate-500">
                Carga ativa, entregas concluídas, SLA individual e CSAT
              </p>
            </div>
            <Award className="w-5 h-5 text-indigo-600" />
          </div>

          {techScorecards.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
              Nenhum membro técnico cadastrado na equipe ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-2 pr-2">Profissional</th>
                    <th className="py-2 px-2 text-center">Ativos</th>
                    <th className="py-2 px-2 text-center">Concluídos</th>
                    <th className="py-2 px-2 text-center">SLA</th>
                    <th className="py-2 pl-2 text-right">CSAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {techScorecards.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-2">
                        <div className="font-bold text-slate-900">{m.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {m.jobTitle}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold tabular-nums">
                        {m.activeCount}
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold text-emerald-700 tabular-nums">
                        {m.doneCount}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold tabular-nums">
                          {m.slaRate}%
                        </span>
                      </td>
                      <td className="py-2.5 pl-2 text-right font-bold tabular-nums">
                        {m.csat}{' '}
                        {m.csat !== '—' && (
                          <span className="text-amber-500">★</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * PAINEL ADMIN — ABA 3: EQUIPE & USUÁRIOS CORPORATIVOS
 * ============================================================================
 */
function AdminTeamManager({
  users,
  currentUser,
  settings,
  onSaveUser,
  onNotify,
  onRequestConfirm
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');

  // Formulário de cadastro direto pelo Admin
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDept, setNewDept] = useState('Marketing');
  const [newTitle, setNewTitle] = useState('');
  const [newRole, setNewRole] = useState('tecnico');
  const [newPass, setNewPass] = useState('');
  const [formErr, setFormErr] = useState('');

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  const activeAdminsCount = useMemo(
    () =>
      users.filter((u) => ['admin','super_admin'].includes(u.role) && u.active !== false).length,
    [users]
  );

  const handleCopyCode = (code, label) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedCode(label);
      setTimeout(() => setCopiedCode(''), 2500);
      onNotify(
        'Código Copiado',
        `Código de convite (${label}) copiado para a área de transferência.`
      );
    } catch {
      onNotify('Código de Convite', `Código: ${code}`);
    }
  };

  const handleRoleChange = async (targetUser, nextRole) => {
    if (
      ['admin','super_admin'].includes(targetUser.role) &&
      nextRole !== 'admin' &&
      activeAdminsCount <= 1
    ) {
      onNotify(
        'Ação Bloqueada',
        'O sistema precisa ter pelo menos 1 Administrador Master ativo.',
        'warning'
      );
      return;
    }
    await onSaveUser({ ...targetUser, role: nextRole });
    onNotify(
      'Perfil Atualizado',
      `${targetUser.name} agora possui perfil ${ROLE_META[nextRole]?.label}.`
    );
  };

  const handleToggleActive = (targetUser) => {
    const nextActive = targetUser.active === false;
    if (!nextActive && ['admin','super_admin'].includes(targetUser.role) && activeAdminsCount <= 1) {
      onNotify(
        'Ação Bloqueada',
        'Não é possível bloquear o único Administrador ativo.',
        'warning'
      );
      return;
    }

    onRequestConfirm({
      title: nextActive ? 'Reativar Usuário' : 'Bloquear Acesso do Usuário',
      message: nextActive
        ? `Deseja restaurar o acesso de ${targetUser.name} ao BravaDesk?`
        : `Deseja bloquear o acesso de ${targetUser.name}? Ele não poderá entrar enquanto estiver bloqueado.`,
      confirmLabel: nextActive ? 'Reativar' : 'Bloquear Acesso',
      danger: !nextActive,
      onConfirm: async () => {
        await onSaveUser({ ...targetUser, active: nextActive });
        onNotify(
          nextActive ? 'Usuário Reativado' : 'Usuário Bloqueado',
          `Status de ${targetUser.name} atualizado.`
        );
      }
    });
  };

  const handleCreateDirectUser = async (e) => {
    e.preventDefault();
    setFormErr('Por segurança, peça que a pessoa faça seu cadastro na tela inicial. Depois, selecione a função dela nesta lista. Não é possível criar senha de outra pessoa no navegador.');
  };

  return (
    <div className="space-y-6">
      <InviteManager currentUser={currentUser} />
      {/* Busca e Lista de Usuários */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail ou departamento..."
            className="w-full text-sm focus:outline-none"
          />
        </div>

        <div className="divide-y divide-slate-100">
          {filteredUsers.map((u) => {
            const isSelf = u.id === currentUser.id;
            const isBlocked = u.active === false;
            return (
              <div
                key={u.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isBlocked ? 'bg-slate-50/80 opacity-75' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      {u.name}
                    </span>
                    {isSelf && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[11px] font-bold">
                        Você
                      </span>
                    )}
                    {isBlocked && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[11px] font-bold">
                        Bloqueado
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {u.email} • {u.jobTitle} ({u.department})
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-center">
                  <select
                    value={u.role}
                    disabled={u.role==='super_admin' || (u.role==='admin' && currentUser.role!=='super_admin')}
                    onChange={(e) => handleRoleChange(u, e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="solicitante">Solicitante</option>
                    <option value="tecnico" disabled={u.role!=='tecnico'}>Técnico do Marketing</option>
                    <option value="admin" disabled={u.role!=='admin'}>Admin do Marketing</option>
                    <option value="super_admin" disabled>Super Admin</option>
                  </select>

                  <button
                    type="button"
                    disabled={u.role==='super_admin' || (u.role==='admin' && currentUser.role!=='super_admin')}
                    onClick={() => handleToggleActive(u)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      isBlocked
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-white text-rose-700 border-slate-200 hover:bg-rose-50'
                    }`}
                  >
                    {isBlocked ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        Ativar
                      </>
                    ) : (
                      <>
                        <UserX className="w-3.5 h-3.5" />
                        Bloquear
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

/**
 * ============================================================================
 * PAINEL ADMIN — ABA 4: CONFIGURAÇÕES, PWA, WEBHOOKS & CAIXA DE SAÍDA DE E-MAILS
 * ============================================================================
 */
function AdminSettingsPanel({
  settings,
  users,
  tickets,
  notifications,
  canInstallPWA,
  isStandalonePWA,
  onInstallPWA,
  onSaveSettings,
  onTestPopupAndSound,
  onRestoreBackup,
  onRequestConfirm
}) {
  const [draft, setDraft] = useState(settings);
  const [deptName,setDeptName]=useState('');
  const [deptEdit,setDeptEdit]=useState(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceHours, setServiceHours] = useState('24');
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [stageName, setStageName] = useState('');
  const [stageBase, setStageBase] = useState('em_atendimento');
  const [editingStageId, setEditingStageId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleCategorySlaChange = (catId, hours) => {
    const num = Math.max(1, Number(hours) || 1);
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.map((c) =>
        c.id === catId ? { ...c, slaHours: num } : c
      )
    }));
  };

  const saveService = () => {
    const name = serviceName.trim();
    const hours = Number(serviceHours);
    if (!name || !Number.isFinite(hours) || hours < 1 || hours > 8760) return;
    if ((draft.categories || []).some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingServiceId)) return;
    const next = {id: editingServiceId || `cat-${crypto.randomUUID()}`, name, description: serviceDescription.trim(), slaHours: hours, active: editingServiceId ? (draft.categories || []).find(c => c.id === editingServiceId)?.active !== false : true};
    setDraft(prev => ({...prev, categories: editingServiceId
      ? prev.categories.map(c => c.id === editingServiceId ? {...c, ...next} : c)
      : [...prev.categories, next]}));
    setServiceName(''); setServiceDescription(''); setServiceHours('24'); setEditingServiceId(null);
  };
  const editService = (cat) => {
    setEditingServiceId(cat.id); setServiceName(cat.name);
    setServiceDescription(cat.description || ''); setServiceHours(String(cat.slaHours));
  };
  const saveStage = () => {
    const name = stageName.trim();
    if (!name) return;
    const current = draft.customStages || [];
    if (current.some(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== editingStageId)) return;
    const value = {id: editingStageId || `stage-${crypto.randomUUID()}`, name, baseStatus: stageBase, active: editingStageId ? (draft.customStages || []).find(c => c.id === editingStageId)?.active !== false : true};
    setDraft(prev => ({...prev, customStages: editingStageId
      ? (prev.customStages || []).map(x => x.id === editingStageId ? {...x,...value} : x)
      : [...(prev.customStages || []),value]}));
    setStageName(''); setStageBase('em_atendimento'); setEditingStageId(null);
  };

  const handleDownloadBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      system: 'MktDesk',
      version: '1.0-prod',
      users,
      tickets,
      notifications,
          settings: draft
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mktdesk-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (!parsed || (!Array.isArray(parsed.users) && !Array.isArray(parsed.tickets))) {
          throw new Error('Formato inválido');
        }
        onRequestConfirm({
          title: 'Restaurar Backup JSON',
          message: `Deseja importar os registros deste backup (${
            parsed.users?.length || 0
          } usuários e ${parsed.tickets?.length || 0} chamados)?`,
          confirmLabel: 'Importar Dados',
          onConfirm: () => onRestoreBackup(parsed)
        });
      } catch {
        onRequestConfirm({
          title: 'Arquivo Inválido',
          message:
            'O arquivo selecionado não é um backup JSON válido do BravaDesk.',
          confirmLabel: 'Entendi',
          onConfirm: () => {}
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <section className="bg-white p-5 rounded-xl border border-slate-200 space-y-3"><h3 className="font-bold">Briefing personalizado por serviço</h3><p className="text-xs text-slate-500">Uma pergunta por linha. As respostas serão incorporadas ao briefing do chamado.</p>{draft.categories.map(c=><label key={c.id} className="block text-sm font-semibold">{c.name}<textarea rows={3} className="block w-full border rounded-lg p-2 font-normal" value={(c.briefingQuestions||[]).join('\n')} onChange={e=>setDraft(old=>({...old,categories:old.categories.map(item=>item.id===c.id?{...item,briefingQuestions:e.target.value.split('\n')}:item)}))}/></label>)}<button type="button" className="bg-indigo-600 text-white rounded-lg p-2" onClick={()=>onSaveSettings({...draft,categories:draft.categories.map(c=>({...c,briefingQuestions:(c.briefingQuestions||[]).map(q=>q.trim()).filter(Boolean).slice(0,30)}))})}>Salvar perguntas</button></section>

      <section className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
        <h2 className="text-lg font-extrabold">Gestão de Departamentos</h2><p className="text-xs text-slate-500">Departamentos solicitantes do Marketing. Desativar não apaga históricos.</p>
        {(draft.departments||[]).map(d=><div key={d.id} className="flex items-center gap-2 border-b border-slate-200 py-2"><span className="flex-1 text-sm">{d.name} · {d.active===false?'Inativo':'Ativo'}</span><button type="button" className="text-indigo-600 text-xs" onClick={()=>{setDeptEdit(d.id);setDeptName(d.name)}}>Editar</button><button type="button" className="text-xs border rounded p-2" onClick={()=>setDraft(old=>({...old,departments:old.departments.map(x=>x.id===d.id?{...x,active:x.active===false}:x)}))}>{d.active===false?'Ativar':'Desativar'}</button></div>)}
        <div className="flex flex-wrap gap-2"><input className="flex-1 border rounded-lg p-2" placeholder="Nome do departamento" value={deptName} onChange={e=>setDeptName(e.target.value)}/><button type="button" disabled={!deptName.trim()||(draft.departments||[]).some(d=>d.id!==deptEdit&&[d.name,...(d.aliases||[])].some(n=>n.toLowerCase()===deptName.trim().toLowerCase()))} className="bg-indigo-600 text-white rounded-lg p-2 disabled:opacity-50" onClick={()=>{setDraft(old=>({...old,departments:deptEdit?old.departments.map(d=>d.id===deptEdit?{...d,name:deptName.trim(),aliases:[...new Set([...(d.aliases||[]),d.name])].filter(n=>n!==deptName.trim())}:d):[...old.departments,{id:crypto.randomUUID(),name:deptName.trim(),active:true}]}));setDeptEdit(null);setDeptName('');}}>{deptEdit?'Aplicar edição':'Adicionar'}</button><button type="button" className="border rounded-lg p-2" onClick={()=>onSaveSettings(draft)}>Salvar departamentos</button></div>
      </section>
      {/* Segurança, Convites & Domínio Corporativo */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Configurações gerais e notificações
            </h2>
            <p className="text-xs text-slate-500">
              Convites individuais estão disponíveis na aba Equipe.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSaveSettings(draft)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition self-start sm:self-auto"
          >
            Salvar Configurações
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onTestPopupAndSound}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition"
          >
            <BellRing className="w-4 h-4" />
            Testar Pop-up & Som
          </button>

          {canInstallPWA && !isStandalonePWA && (
            <button
              type="button"
              onClick={onInstallPWA}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition"
            >
              <Smartphone className="w-4 h-4" />
              Instalar WebApp (PWA)
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
          >
            <Download className="w-4 h-4" />
            Backup JSON
          </button>

          <button
            type="button"
            disabled
            title="Restauração administrativa indisponível"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
          >
            <Upload className="w-4 h-4" />
            Restaurar JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileImport}
            className="hidden"
          />
        </div>
      </div>

      {/* Acesso direto e identificação da versão implantada. */}
      <section className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-indigo-950">Gestão de Serviços e Status</h2>
            <p className="text-xs text-indigo-700">Versão 0.7 · BravaDesk · Identidade visual e instalação</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">Painel do Administrador</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#catalogo-servicos" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold">Cadastrar serviços e prazos</a>
          <a href="#status-personalizados" className="px-4 py-2 rounded-lg bg-white text-indigo-700 border border-indigo-200 text-xs font-bold">Cadastrar status</a>
        </div>
        <p className="text-xs text-indigo-800">Após adicionar ou editar, clique em Salvar Configurações no topo da página para gravar no Supabase.</p>
      </section>

      {/* Catálogo editável: salvo no registro app_settings, protegido por RLS de admin. */}
      <section id="catalogo-servicos" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4 scroll-mt-36">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Gestão de Serviços e SLAs</h3>
          <p className="text-xs text-slate-500">Cadastre serviços e os prazos em horas úteis. Mudanças de prazo afetam novos chamados, não os anteriores.</p>
        </div>
        <div className="space-y-2">
          {(draft.categories || []).map(cat => (
            <div key={cat.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{cat.name} {cat.active === false ? '(Inativo)' : ''}</p>
                <p className="text-xs text-slate-500">{cat.description || 'Sem descrição'} · SLA: {cat.slaHours}h</p>
              </div>
              <button type="button" className="text-xs text-indigo-700 font-semibold" onClick={() => editService(cat)}>Editar</button>
              <button type="button" className="text-xs text-slate-600 font-semibold" onClick={() => setDraft(prev => ({...prev,categories:prev.categories.map(c => c.id === cat.id ? {...c,active:cat.active === false} : c)}))}>{cat.active === false ? 'Ativar' : 'Desativar'}</button>
            </div>
          ))}
        </div>
        <form onSubmit={e => {e.preventDefault(); saveService();}} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <label className="text-xs font-semibold">Serviço<input required maxLength={100} className="block mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={serviceName} onChange={e=>setServiceName(e.target.value)} placeholder="Ex.: Edição de vídeo"/></label>
          <label className="text-xs font-semibold">Descrição<input maxLength={250} className="block mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={serviceDescription} onChange={e=>setServiceDescription(e.target.value)} placeholder="Opcional"/></label>
          <label className="text-xs font-semibold">Prazo (horas úteis)<input required min="1" max="8760" type="number" className="block mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={serviceHours} onChange={e=>setServiceHours(e.target.value)}/></label>
          <div className="flex gap-2"><button type="submit" className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-bold">{editingServiceId ? 'Atualizar' : 'Adicionar serviço'}</button>{editingServiceId && <button type="button" onClick={()=>{setEditingServiceId(null);setServiceName('');setServiceDescription('');setServiceHours('24')}} className="text-xs">Cancelar</button>}</div>
        </form>
        <p className="text-xs text-amber-700 font-semibold">Para gravar as alterações no Supabase, clique em “Salvar Configurações” no início desta página.</p>
      </section>
      <section id="status-personalizados" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4 scroll-mt-36">
        <h3 className="text-lg font-bold text-slate-900">Status personalizados</h3>
        <p className="text-xs text-slate-500">Crie etapas específicas vinculadas ao status principal. As ações de pausa, aprovação e conclusão continuam no fluxo padrão, preservando a contagem do SLA.</p>
        {(draft.customStages || []).map(stage => (
          <div key={stage.id} className="flex gap-3 items-center rounded-xl border border-slate-200 p-3">
            <div className="flex-1"><p className="text-sm font-semibold">{stage.name} {stage.active === false ? '(Inativo)' : ''}</p><p className="text-xs text-slate-500">Fluxo: {STATUS_META[stage.baseStatus]?.label || stage.baseStatus}</p></div>
            <button type="button" className="text-indigo-700 text-xs" onClick={()=>{setEditingStageId(stage.id);setStageName(stage.name);setStageBase(stage.baseStatus)}}>Editar</button>
            <button type="button" className="text-slate-600 text-xs" onClick={()=>setDraft(prev=>({...prev,customStages:(prev.customStages||[]).map(x=>x.id===stage.id?{...x,active:stage.active===false}:x)}))}>{stage.active === false ? 'Ativar' : 'Desativar'}</button>
          </div>
        ))}
        <form onSubmit={e=>{e.preventDefault();saveStage();}} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <label className="text-xs font-semibold">Nome do status<input required maxLength={80} className="block mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={stageName} onChange={e=>setStageName(e.target.value)} placeholder="Ex.: Em revisão de arte"/></label>
          <label className="text-xs font-semibold">Vincular ao fluxo<select className="block mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={stageBase} onChange={e=>setStageBase(e.target.value)}>{['novo','em_atendimento','aguardando_solicitante','em_aprovacao'].map(k=><option key={k} value={k}>{STATUS_META[k].label}</option>)}</select></label>
          <div className="flex gap-2"><button type="submit" className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-bold">{editingStageId ? 'Atualizar' : 'Adicionar status'}</button>{editingStageId && <button type="button" className="text-xs" onClick={()=>{setEditingStageId(null);setStageName('');setStageBase('em_atendimento')}}>Cancelar</button>}</div>
        </form>
        <p className="text-xs text-amber-700 font-semibold">Clique em “Salvar Configurações” para persistir as alterações.</p>
      </section>

    </div>
  );
}

/**
 * ============================================================================
 * PAINEL TÉCNICO DO MARKETING
 * ============================================================================
 */
function TechWorkspace({
  customStages = [],
  tickets,
  users,
  currentUser,
  techQueue,
  onChangeQueue,
  viewMode,
  onChangeViewMode,
  nowTick,
  onSelectTicket,
  onAssignTech,
  onOpenNewTicket
}) {
  const queueTickets = useMemo(() => {
    if (techQueue === 'minha') {
      return tickets.filter(
        (t) =>
          t.assignedTechId === currentUser.id && !['concluido','cancelado'].includes(t.status)
      );
    }
    if (techQueue === 'geral') {
      return tickets.filter(
        (t) => !t.assignedTechId && !['concluido','cancelado'].includes(t.status)
      );
    }
    if (techQueue === 'sac') {
      return tickets.filter((t) => t.status === 'aguardando_solicitante');
    }
    return tickets;
  }, [tickets, techQueue, currentUser.id]);

  const titles = {
    minha: {
      title: 'Minha Fila de Produção',
      subtitle: 'Demandas sob sua responsabilidade técnica ativa.'
    },
    geral: {
      title: 'Fila Geral Disponível',
      subtitle: 'Demandas aguardando um técnico assumir o atendimento.'
    },
    sac: {
      title: 'Aguardando Solicitante (SAC Pausado)',
      subtitle: 'Demandas com SLA congelado aguardando retorno da área.'
    },
    todos: {
      title: 'Todos os Chamados do Marketing',
      subtitle: 'Visão completa de histórico e atendimentos em andamento.'
    }
  };

  return (
    <div className="space-y-4">
      {/* Seletor rápido de fila no Mobile */}
      <div className="flex md:hidden overflow-x-auto gap-1.5 pb-1">
        {[
          { id: 'minha', label: 'Minha Fila' },
          { id: 'geral', label: 'Fila Geral' },
          { id: 'sac', label: 'Pausados SAC' },
          { id: 'todos', label: 'Todos' }
        ].map((q) => (
          <button
            key={q.id}
            onClick={() => onChangeQueue(q.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${
              techQueue === q.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      <TicketBoardView
        title={titles[techQueue].title}
        subtitle={titles[techQueue].subtitle}
        tickets={queueTickets}
        customStages={customStages}
        users={users}
        currentUser={currentUser}
        viewMode={viewMode}
        onChangeViewMode={onChangeViewMode}
        nowTick={nowTick}
        onSelectTicket={onSelectTicket}
        onAssignTech={onAssignTech}
        onOpenNewTicket={onOpenNewTicket}
      />
    </div>
  );
}

/**
 * ============================================================================
 * QUADRO OPERACIONAL COMPARTILHADO (LISTA & KANBAN + FILTROS + TRIAGEM)
 * ============================================================================
 */
function TicketBoardView({
  customStages = [],
  title,
  subtitle,
  tickets,
  users,
  currentUser,
  viewMode,
  onChangeViewMode,
  nowTick,
  onSelectTicket,
  onAssignTech,
  onOpenNewTicket,
  allowTechFilter = false
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('all');

  const marketingStaff = useMemo(
    () =>
      users.filter(
        (u) =>
          u.active !== false && (u.role === 'tecnico' || ['admin','super_admin'].includes(u.role))
      ),
    [users]
  );

  const visibleTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter((t) => {
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (priorityFilter !== 'all' && t.priority !== priorityFilter)
          return false;
        if (allowTechFilter && techFilter !== 'all') {
          if (techFilter === 'unassigned' && t.assignedTechId) return false;
          if (
            techFilter !== 'unassigned' &&
            t.assignedTechId !== techFilter
          )
            return false;
        }
        if (q) {
          const hay = `${t.protocol} ${t.title} ${t.requesterName} ${t.department} ${t.categoryName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [tickets, search, statusFilter, priorityFilter, allowTechFilter, techFilter]);

  const kanbanColumns = [
    'novo',
    'em_atendimento',
    'aguardando_solicitante',
    'em_aprovacao',
    'concluido',
    'cancelado'
  ];

  return (
    <div className="space-y-4">
      {/* Cabeçalho e Controles */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => onChangeViewMode('lista')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === 'lista'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                Lista
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('kanban')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === 'kanban'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                Kanban
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenNewTicket}
              className="md:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              Nova
            </button>
          </div>
        </div>

        {/* Barra de Busca e Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Protocolo (#BD-000001), título ou área..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <option value="all">Todos os Status</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <option value="all">Todas as Prioridades</option>
            {Object.entries(PRIORITY_META).map(([k, v]) => (
              <option key={k} value={k}>
                Prioridade: {v.label}
              </option>
            ))}
          </select>

          {allowTechFilter && (
            <select
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <option value="all">Todos os Responsáveis</option>
              <option value="unassigned">Sem Técnico Atribuído</option>
              {marketingStaff.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ESTADO VAZIO LIMPO */}
      {visibleTickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            Nenhuma demanda encontrada nesta visão
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1">
            {tickets.length === 0
              ? 'O sistema está limpo e pronto para produção. Abra a primeira demanda para gerar um protocolo automaticamente.'
              : 'Ajuste os filtros acima ou alterne de fila para visualizar outras demandas.'}
          </p>
        </div>
      ) : viewMode === 'lista' ? (
        /* VISUALIZAÇÃO EM LISTA RESPONSIVA */
        <div className="space-y-3">
          {visibleTickets.map((t) => {
            const sla = calculateTicketSLA(t, nowTick);
            const st = STATUS_META[t.status] || STATUS_META.novo;
            const pr = PRIORITY_META[t.priority] || PRIORITY_META.normal;

            return (
              <div
                key={t.id}
                onClick={() => onSelectTicket(t.id)}
                className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg tabular-nums">
                      {t.protocol}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${st.badgeClass}`}
                    >
                      {st.label}{customStages.find(x=>x.id===t.customStageId && x.baseStatus===t.status)?.name ? ` · ${customStages.find(x=>x.id===t.customStageId).name}` : ''}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${pr.badgeClass}`}
                    >
                      {pr.label}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border tabular-nums ${sla.badgeClass}`}
                    >
                      {sla.label}
                    </span>
                    <span className="block text-[11px] font-medium text-slate-600 break-words">{deliveryLabel(sla,t.status)}</span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {t.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      {t.categoryName}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      {t.department} • {t.requesterName}
                    </span>
                    <span>Aberto em {formatDateTime(t.createdAt)}</span>
                  </div>
                </div>

                {/* Controles Rápidos na Linha */}
                <div
                  className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {['admin','super_admin'].includes(currentUser.role) ? (
                    <select
                      value={t.assignedTechId || ''}
                      onChange={(e) => onAssignTech(t, e.target.value || null)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                      <option value="">Sem técnico atribuído</option>
                      {marketingStaff.map((m) => (
                        <option key={m.id} value={m.id}>
                          Resp: {m.name}
                        </option>
                      ))}
                    </select>
                  ) : !t.assignedTechId ? (
                    <button
                      type="button"
                      onClick={() => onAssignTech(t, currentUser.id)}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
                    >
                      Assumir Chamado
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
                      Técnico: {t.assignedTechName}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectTicket(t.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISUALIZAÇÃO KANBAN HORIZONTAL RESPONSIVA */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanColumns.map((colKey) => {
            const meta = STATUS_META[colKey];
            const colTickets = visibleTickets.filter((t) => t.status === colKey);
            return (
              <div
                key={colKey}
                className={`w-72 sm:w-80 shrink-0 bg-slate-100/80 rounded-2xl border border-slate-200 border-t-4 ${meta.headerAccent} p-3 flex flex-col max-h-[72vh]`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    {meta.shortLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white text-slate-700 text-xs font-bold shadow-2xs tabular-nums">
                    {colTickets.length}
                  </span>
                </div>

                <div className="space-y-2.5 overflow-y-auto pr-0.5 flex-1">
                  {colTickets.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-[11px] text-slate-400">
                      Nenhuma demanda nesta etapa
                    </div>
                  ) : (
                    colTickets.map((t) => {
                      const sla = calculateTicketSLA(t, nowTick);
                      return (
                        <div
                          key={t.id}
                          onClick={() => onSelectTicket(t.id)}
                          className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-indigo-400 shadow-2xs cursor-pointer space-y-2 transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-extrabold text-indigo-600 tabular-nums">
                              {t.protocol}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border tabular-nums ${sla.badgeClass}`}
                            >
                              {sla.label}
                            </span>
                    <span className="block text-[11px] font-medium text-slate-600 break-words">{deliveryLabel(sla,t.status)}</span>
                          </div>
                          <div className="text-xs font-bold text-slate-900 line-clamp-2">
                            {t.title}
                          </div>
                          {customStages.find(x=>x.id===t.customStageId && x.baseStatus===t.status) && <div className="text-[11px] text-indigo-700 font-semibold">{customStages.find(x=>x.id===t.customStageId).name}</div>}
                          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="truncate max-w-[130px]">
                              {t.department}
                            </span>
                            <span className="font-semibold text-slate-700 truncate max-w-[110px]">
                              {t.assignedTechName || 'Sem técnico'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * ============================================================================
 * PAINEL DO SOLICITANTE
 * ============================================================================
 */
function RequesterPortal({
  customStages = [],
  tickets,
  currentUser,
  filter,
  onChangeFilter,
  pausedTickets,
  approvalTickets,
  nowTick,
  onSelectTicket,
  onOpenNewTicket
}) {
  const myTickets = useMemo(
    () =>
      tickets
        .filter((t) => t.requesterId === currentUser.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [tickets, currentUser.id]
  );

  const observedTickets=tickets.filter(t=>t.requesterId!==currentUser.id && (t.observerIds||[]).includes(currentUser.id));
  const filtered = useMemo(() => {
    if(filter==='observados') return tickets.filter(t=>t.requesterId!==currentUser.id&&(t.observerIds||[]).includes(currentUser.id));
    if (filter === 'abertos') {
      return myTickets.filter((t) => !['concluido','cancelado'].includes(t.status));
    }
    if (filter === 'sac') {
      return myTickets.filter((t) => t.status === 'aguardando_solicitante');
    }
    if (filter === 'aprovacao') {
      return myTickets.filter((t) => t.status === 'em_aprovacao');
    }
    if(filter==='cancelados') return myTickets.filter(t=>t.status==='cancelado');
    if (filter === 'concluidos') {
      return myTickets.filter((t) => t.status === 'concluido');
    }
    return myTickets;
  }, [myTickets, filter, tickets,currentUser.id]);

  return (
    <div className="space-y-5">
      {/* BANNER DE DESTAQUE CASO TENHA DEMANDAS PAUSADAS AGUARDANDO RESPOSTA (SAC) */}
      {pausedTickets.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white shrink-0">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-amber-950">
                Você possui {pausedTickets.length}{' '}
                {pausedTickets.length === 1
                  ? 'demanda pausada aguardando sua resposta (SAC)'
                  : 'demandas pausadas aguardando sua resposta (SAC)'}
              </h3>
              <p className="text-xs text-amber-900 mt-0.5">
                O prazo de entrega está congelado até você enviar as
                informações solicitadas pelo time de Marketing.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectTicket(pausedTickets[0].id)}
            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition shrink-0"
          >
            Responder & Destravar ({pausedTickets[0].protocol})
          </button>
        </div>
      )}

      {/* BANNER DE ENTREGAS PRONTAS PARA APROVAÇÃO */}
      {approvalTickets.length > 0 && (
        <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0" />
            <div className="text-xs sm:text-sm text-purple-950">
              <strong>
                {approvalTickets.length}{' '}
                {approvalTickets.length === 1
                  ? 'entrega aguardando sua aprovação'
                  : 'entregas aguardando sua aprovação'}
                :
              </strong>{' '}
              Revise o material entregue e finalize com sua avaliação CSAT.
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectTicket(approvalTickets[0].id)}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shrink-0"
          >
            Revisar ({approvalTickets[0].protocol})
          </button>
        </div>
      )}

      {/* Cabeçalho & CTA + Nova Demanda */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
            Minhas Solicitações de Marketing
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Acompanhe o andamento, responda pendências e aprove entregas finais.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewTicket}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-600/20 transition"
        >
          <Plus className="w-4 h-4" />
          Nova Demanda
        </button>
      </div>

      {/* Filtros do Solicitante */}
      <div className="flex flex-wrap gap-2">
        {[
          {
            id: 'abertos',
            label: 'Em Andamento',
            count: myTickets.filter((t) => !['concluido','cancelado'].includes(t.status)).length
          },
          {
            id: 'sac',
            label: 'Aguardando Minha Resposta',
            count: pausedTickets.length
          },
          {
            id: 'aprovacao',
            label: 'Para Aprovar',
            count: approvalTickets.length
          },
          {
            id: 'concluidos',
            label: 'Concluídos',
            count: myTickets.filter((t) => t.status === 'concluido').length
          },
          {
            id:'cancelados',label:'Cancelados',count:myTickets.filter(t=>t.status==='cancelado').length
          }, {
            id: 'observados', label: 'Chamados que acompanho', count: observedTickets.length
          }, {
            id: 'todos',
            label: 'Todos',
            count: myTickets.length
          }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeFilter(tab.id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              filter === tab.id
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                filter === tab.id
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Lista de Demandas do Solicitante */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <Sparkles className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            Nenhuma demanda nesta aba
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1">
            Clique em <strong>+ Nova Demanda</strong> para solicitar campanhas,
            peças gráficas, apresentações, eventos ou materiais digitais.
          </p>
          <button
            type="button"
            onClick={onOpenNewTicket}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            Abrir Primeira Demanda
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => {
            const st = STATUS_META[t.status] || STATUS_META.novo;
            const sla = calculateTicketSLA(t, nowTick);
            return (
              <div
                key={t.id}
                onClick={() => onSelectTicket(t.id)}
                className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition cursor-pointer flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg tabular-nums">
                      {t.protocol}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${st.badgeClass}`}
                    >
                      {st.label}{customStages.find(x=>x.id===t.customStageId && x.baseStatus===t.status)?.name ? ` · ${customStages.find(x=>x.id===t.customStageId).name}` : ''}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-slate-900">
                    {t.title}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {t.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {t.assignedTechName
                      ? `Técnico: ${t.assignedTechName}`
                      : 'Aguardando triagem'}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border tabular-nums ${sla.badgeClass}`}
                  >
                    {sla.label}
                  </span>
                    <span className="block text-[11px] font-medium text-slate-600 break-words">{deliveryLabel(sla,t.status)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * ============================================================================
 * MODAL: ABRIR NOVA DEMANDA (TELA CHEIA NO MOBILE, EXIBE SLA AUTOMÁTICO)
 * ============================================================================
 */
function NewTicketModal({
  currentUser,
  departments, departmentCatalog, users,
  categories,
  nextProtocol,
  onClose,
  onSubmit
}) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [priority, setPriority] = useState('normal');
  const [department, setDepartment] = useState(
    departments.find(d=>sameDepartment(departmentCatalog,d,currentUser.department))||(departments[0]||'')
  );
  const [observerIds,setObserverIds]=useState([]);
  const [objective, setObjective] = useState('');
  const [description, setDescription] = useState('');
  const [briefingAnswers,setBriefingAnswers]=useState({});
  const [previewSchedule,setPreviewSchedule]=useState(null);
  const [previewError,setPreviewError]=useState('');
  const [previewNow,setPreviewNow]=useState(Date.now);
  useEffect(()=>{let alive=true;supabase.rpc('bd082_public_schedule').then(({data,error})=>{if(!alive)return;if(error||!data)setPreviewError('Previsão indisponível; o prazo será calculado ao salvar.');else setPreviewSchedule(data);});const timer=setInterval(()=>setPreviewNow(Date.now()),30000);return()=>{alive=false;clearInterval(timer);};},[]);


  const [referenceLink, setReferenceLink] = useState('');
  const [referenceFiles,setReferenceFiles] = useState([]);
  const [sending,setSending] = useState(false);
  const [sendError,setSendError] = useState('');
  const submitting = useRef(false);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || categories[0],
    [categories, categoryId]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current || !title.trim() || !description.trim() || !departments.includes(department)) return;
    submitting.current=true; setSending(true); setSendError('');
    try { await onSubmit({title,categoryId,priority,department,objective,description:[description,...(selectedCategory?.briefingQuestions||[]).filter(q=>q.trim()).map((q,i)=>q+": "+(briefingAnswers[categoryId+":"+i]||"Não informado"))].join("\n\n"),referenceLink,observerIds,referenceFiles}); }
    catch(error) {setSendError(error.message || 'Não foi possível abrir o chamado.');}
    finally {submitting.current=false;setSending(false);}
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                {nextProtocol}
              </span>
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
                Nova Demanda de Marketing
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Preencha o briefing para iniciar o cronômetro de SLA.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo Rolável */}
        <form
          id="new-ticket-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Título da Demanda *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Campanha Lançamento Linha Corporativa Q4"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Categoria do Serviço *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({previewSchedule ? formatSLADuration(c.slaHours*3600000,previewSchedule) : `${c.slaHours}h úteis`})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Prioridade
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>

          {/* Exibição Automática do SLA da Categoria */}
          {selectedCategory && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-indigo-950">
                  Prazo do serviço: {previewSchedule ? formatSLADuration(selectedCategory.slaHours*3600000,previewSchedule) : `${selectedCategory.slaHours}h úteis`}
                </div>
                <div className="text-[11px] text-indigo-800 mt-0.5">
                  {selectedCategory.description}
                </div>
                <div className="text-xs font-semibold mt-2">{previewSchedule ? `Previsão de entrega: ${formatDeliveryDate(addBusinessMs(previewNow,Number(selectedCategory.slaHours)*3600000,previewSchedule))}` : previewError || 'Consultando o expediente...'}</div>
                <div className="text-[11px] text-indigo-800">Estimativa; a data oficial será calculada na abertura e recalculada após pausas.</div>
              </div>
              <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Departamento Solicitante
              </label>
              <select
                value={department}
                onChange={(e) => {setDepartment(e.target.value);setObserverIds([]);}}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Canal / Público-Alvo (Opcional)
              </label>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Ex: LinkedIn B2B, Clientes Ativos, E-mail..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <ObserverPicker users={users} catalog={departmentCatalog} department={department} requesterId={currentUser.id} value={observerIds} onChange={setObserverIds}/>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Briefing Detalhado & Especificações *
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onPaste={e=>{const pasted=Array.from(e.clipboardData.files||[]);if(pasted.length){e.preventDefault();setReferenceFiles(old=>[...old,...pasted]);}}}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva textos, formatos, dimensões, objetivos e informações essenciais para execução sem retrabalho..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {(selectedCategory?.briefingQuestions||[]).filter(q=>q.trim()).map((q,i)=><label key={categoryId+':'+i} className="block text-sm font-semibold">{q}<textarea className="block w-full border rounded-lg p-2 font-normal" rows={2} value={briefingAnswers[categoryId+':'+i]||''} onChange={e=>setBriefingAnswers(old=>({...old,[categoryId+':'+i]:e.target.value}))}/></label>)}
          <ReferencePicker files={referenceFiles} onChange={setReferenceFiles} disabled={sending} label="Anexos de referência (opcional)" />
          {sendError && <p role="alert" className="text-red-700 text-sm">{sendError}</p>}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Link de Referências / Pasta Drive (Opcional)
            </label>
            <input
              type="url"
              value={referenceLink}
              onChange={(e) => setReferenceLink(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </form>

        {/* Rodapé Fixo */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="new-ticket-form"
            disabled={sending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? 'Enviando...' : `Abrir Demanda (${nextProtocol})`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * MODAL: DETALHES DO CHAMADO & OPERAÇÃO GLPI COMPLETA
 * ============================================================================
 */
function TicketDetailModal({
  ticket, onSaveObservers, departmentCatalog, onRefresh,
  currentUser,
  users,
  customStages = [],
  onSetCustomStage,
  nowTick,
  onClose,
  onAssignTech,
  onPostMessage,
  onPauseForSAC,
  onUnlockSAC,
  onSendDelivery,
  onApproveDelivery,
  onRequestAdjustments
}) {
  const isStaff =
    ['admin','super_admin'].includes(currentUser.role) || currentUser.role === 'tecnico';
  const isRequester = currentUser.id === ticket.requesterId;
  const [privateNotes,setPrivateNotes]=useState([]);
  const [observerDraft,setObserverDraft]=useState(ticket.observerIds||[]);
  useEffect(()=>{setObserverDraft(ticket.observerIds||[]);},[ticket.id,JSON.stringify(ticket.observerIds||[])]);
  useEffect(()=>{let live=true;setPrivateNotes([]);if(isStaff) supabase.from('bd_private_notes').select('entry').eq('ticket_id',ticket.id).then(({data})=>{if(live)setPrivateNotes((data||[]).map(x=>x.entry));});return()=>{live=false;};},[isStaff,ticket.id,ticket.updatedAt]);

  const sla = calculateTicketSLA(ticket, nowTick);
  const stage = customStages.find(x => x.id === ticket.customStageId);
  const st = STATUS_META[ticket.status] || STATUS_META.novo;

  // Estados de interação
  const [replyText, setReplyText] = useState('');
  const [replyFiles,setReplyFiles]=useState([]);
  const [chatSending,setChatSending]=useState(false);
  const [chatError,setChatError]=useState('');
  const chatSubmitting=useRef(false);
  const [isInternalNote, setIsInternalNote] = useState(false);

  // Modo de ação operacional: 'chat' | 'sac_pause' | 'deliver' | 'adjust'
  const [actionMode, setActionMode] = useState('chat');
  const [workflowRefresh,setWorkflowRefresh]=useState(0);
  const [workflowError,setWorkflowError]=useState('');
  const [deliveryBusy,setDeliveryBusy]=useState(false);
  const [sacQuestion, setSacQuestion] = useState('');
  const [sacUnlockReply, setSacUnlockReply] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryLink, setDeliveryLink] = useState('');
  const [csatRating, setCsatRating] = useState(5);
  const [csatComment, setCsatComment] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');

  const marketingStaff = useMemo(
    () =>
      users.filter(
        (u) =>
          u.active !== false && (u.role === 'tecnico' || ['admin','super_admin'].includes(u.role))
      ),
    [users]
  );

  // Filtra notas internas para que NUNCA apareçam ao solicitante
  const visibleTimeline = useMemo(
    () =>
      [...ticket.timeline.filter(item=>item.type!=='internal'),...(isStaff?privateNotes:[])].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)),
    [ticket.timeline, isStaff,privateNotes]
  );

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (chatSubmitting.current || (!isStaff&&!isRequester) || (!replyText.trim()&&!replyFiles.length)) return;
    chatSubmitting.current=true;setChatSending(true);setChatError('');
    try {
      await onPostMessage({content:replyText,isInternal:isStaff&&isInternalNote,files:replyFiles});
      setReplyText('');setReplyFiles([]);
    } catch(error) {setChatError(error.message || 'Falha ao enviar referência.');}
    finally {chatSubmitting.current=false;setChatSending(false);}
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-[90vh] sm:max-w-4xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0 bg-white">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg tabular-nums">
                {ticket.protocol}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${st.badgeClass}`}
              >
                {st.label}{stage ? ` · ${stage.name}` : ''}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border tabular-nums ${sla.badgeClass}`}
              >
                {sla.label}
              </span>
                    <span className="block text-[11px] font-medium text-slate-600 break-words">{deliveryLabel(sla,ticket.status)}</span>
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1 truncate">
              {ticket.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo Rolável: Briefing + Barra Técnica + Linha do Tempo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/70">
          {isStaff && <ProductionChecklist key={ticket.id} ticket={ticket} onReply={text=>{setReplyText(old=>old?old+'\n'+text:text);setActionMode('chat');}}/>}
          <Workflow081 key={ticket.id} ticket={ticket} user={currentUser} users={users} onRefresh={onRefresh} refreshKey={workflowRefresh}/>
          {workflowError&&<p role="alert" className="text-red-700 text-xs">{workflowError}</p>}
          {/* Card de Metadados & Briefing */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Solicitante</span>
                <span className="font-bold text-slate-900">
                  {ticket.requesterName}
                </span>
                <span className="text-slate-500 block">
                  {ticket.department}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Categoria & SLA</span>
                <span className="font-bold text-slate-900">
                  {ticket.categoryName}
                </span>
                <span className="text-slate-500 block">
                  Prazo: {formatSLADuration(ticket.slaHours*3600000,ticket.businessSchedule)} {ticket.businessSchedule ? "(horas úteis)" : "(regra antiga)"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Responsável Técnico</span>
                {isStaff ? (
                  <select
                    value={ticket.assignedTechId || ''}
                    onChange={(e) => onAssignTech(e.target.value || null)}
                    className="mt-0.5 w-full px-2 py-1 rounded-lg border border-slate-300 text-xs font-semibold bg-slate-50"
                  >
                    <option value="">Não atribuído</option>
                    {marketingStaff.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-bold text-slate-900">
                    {ticket.assignedTechName || 'Em triagem'}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block">Abertura</span>
                <span className="font-semibold text-slate-800">
                  {formatDateTime(ticket.createdAt)}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                Briefing da Solicitação
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </p>
              <ReferenceFiles files={(ticket.timeline||[]).filter(x=>x.isReference).flatMap(x=>x.attachments||[])} />
              {ticket.objective && (
                <p className="text-xs text-slate-600 mt-2">
                  <strong>Canal / Objetivo:</strong> {ticket.objective}
                </p>
              )}
              {ticket.referenceLink && (
                <a
                  href={ticket.referenceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir Link de Referência
                </a>
              )}
            </div>
          </div>

          <section className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2"><h3 className="font-bold text-sm">Observadores</h3><p className="text-xs">{(ticket.observerIds||[]).map(id=>users.find(u=>u.id===id)?.name||'Colaborador').join(', ')||'Nenhum observador'}</p>{(isStaff||isRequester)&&<><ObserverPicker users={users} catalog={departmentCatalog} department={ticket.department} requesterId={ticket.requesterId} value={observerDraft} onChange={setObserverDraft}/><button type="button" className="bg-indigo-600 text-white rounded-lg p-2 text-xs" onClick={async()=>{try{await onSaveObservers(observerDraft);}catch(e){alert(e.message);}}}>Salvar observadores</button></>}</section>
          {isStaff && !['concluido','cancelado'].includes(ticket.status) && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-2">Etapa personalizada (opcional)</label>
              <select className="w-full border border-slate-300 rounded-lg p-2 text-sm" value={customStages.some(x=>x.id===ticket.customStageId && x.active!==false && x.baseStatus===ticket.status) ? ticket.customStageId : ''} onChange={e=>onSetCustomStage(e.target.value)}>
                <option value="">Sem etapa adicional</option>
                {customStages.filter(x=>x.active!==false && x.baseStatus===ticket.status).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">Use as ações padrão para pausar, aprovar e concluir. Esta etapa não altera o cálculo do SLA.</p>
            </div>
          )}
                    {/* FLUXO ESPECIAL DO SOLICITANTE: DESTRAVAR SAC */}
          {isRequester && ticket.status === 'aguardando_solicitante' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-3">
              <div className="flex items-center gap-2 text-amber-950 font-extrabold text-sm">
                <PauseCircle className="w-5 h-5 text-amber-600" />
                Demanda Pausada (SAC) — Responda para Destravar a Produção
              </div>
              <textarea
                rows={3}
                value={sacUnlockReply}
                onChange={(e) => setSacUnlockReply(e.target.value)}
                placeholder="Informe aqui os dados, arquivos ou aprovações solicitadas pelo Marketing..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (!sacUnlockReply.trim()) return;
                  onUnlockSAC(sacUnlockReply);
                  setSacUnlockReply('');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs"
              >
                <PlayCircle className="w-4 h-4" />
                Responder & Destravar Demanda
              </button>
            </div>
          )}

          {/* FLUXO ESPECIAL DO SOLICITANTE: APROVAR ENTREGA + CSAT OU PEDIR AJUSTES */}
          {isRequester && ticket.status === 'em_aprovacao' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-purple-50 border-2 border-purple-300 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-950 font-extrabold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                  Entrega Disponível para Sua Validação
                </div>
                {ticket.deliveryLink && (
                  <a
                    href={ticket.deliveryLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Material Entregue
                  </a>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActionMode('chat')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                    actionMode !== 'adjust'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  Aprovar & Avaliar CSAT
                </button>
                <button
                  type="button"
                  onClick={() => setActionMode('adjust')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                    actionMode === 'adjust'
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  Solicitar Ajustes
                </button>
              </div>

              {actionMode === 'adjust' ? (
                <div className="space-y-2.5">
                  <textarea
                    rows={3}
                    value={adjustmentNotes}
                    onChange={(e) => setAdjustmentNotes(e.target.value)}
                    placeholder="Descreva claramente quais ajustes precisam ser realizados na entrega..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 bg-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!adjustmentNotes.trim()) return;
                      onRequestAdjustments(adjustmentNotes);
                      setAdjustmentNotes('');
                      setActionMode('chat');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                  >
                    Enviar Pedido de Ajustes ao Técnico
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <span className="block text-xs font-bold text-purple-950 mb-1.5">
                      Avalie o atendimento do Marketing (CSAT 1 a 5 estrelas):
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setCsatRating(star)}
                          className="p-1.5 rounded-lg hover:bg-purple-100 transition"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              star <= csatRating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-300'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="text-xs font-bold text-purple-900 ml-2">
                        {csatRating}/5
                      </span>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={csatComment}
                    onChange={(e) => setCsatComment(e.target.value)}
                    placeholder="Comentário opcional sobre a entrega..."
                    className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white text-xs"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      onApproveDelivery({
                        rating: csatRating,
                        comment: csatComment
                      })
                    }
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Aprovar Entrega e Concluir Chamado
                  </button>
                </div>
              )}
            </div>
          )}

          {/* BARRA DE AÇÕES TÉCNICAS (PARA TÉCNICO & ADMIN) */}
          {isStaff && !['concluido','cancelado'].includes(ticket.status) && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {!ticket.assignedTechId && (
                  <button
                    type="button"
                    onClick={() => onAssignTech(currentUser.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Assumir Chamado
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setActionMode((m) =>
                      m === 'sac_pause' ? 'chat' : 'sac_pause'
                    )
                  }
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                    actionMode === 'sac_pause'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  Pedir Informação ao Solicitante (Pausar SAC)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActionMode((m) => (m === 'deliver' ? 'chat' : 'deliver'))
                  }
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                    actionMode === 'deliver'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Enviar para Revisão Interna
                </button>
              </div>

              {actionMode === 'sac_pause' && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                  <div className="text-xs font-bold text-amber-950">
                    Qual informação você precisa do solicitante? (O SLA será
                    pausado automaticamente)
                  </div>
                  <textarea
                    rows={2}
                    value={sacQuestion}
                    onChange={(e) => setSacQuestion(e.target.value)}
                    placeholder="Ex: Precisamos do logotipo em vetor ou aprovação do texto comercial..."
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!sacQuestion.trim()) return;
                      try {
                        await onPauseForSAC(sacQuestion);
                        setSacQuestion('');
                        setActionMode('chat');
                      } catch (error) { console.error('Falha ao pausar SAC:', error); }
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                  >
                    Confirmar Pausa SAC & Notificar Solicitante
                  </button>
                </div>
              )}

              {actionMode === 'deliver' && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5">
                  <div className="text-xs font-bold text-emerald-950">
                    Enviar Material para Revisão do Marketing
                  </div>
                  <input
                    type="url"
                    value={deliveryLink}
                    onChange={(e) => setDeliveryLink(e.target.value)}
                    placeholder="Link dos arquivos no Google Drive"
                    className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs"
                  />
                  <textarea
                    rows={2}
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="Resumo da entrega e orientações de uso..."
                    className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!deliveryNotes.trim()||deliveryBusy) return;
                      setDeliveryBusy(true);setWorkflowError('');
                      try {
                        await onSendDelivery({ deliveryNotes, deliveryLink });
                        setDeliveryNotes('');setDeliveryLink('');setWorkflowRefresh(v=>v+1);
                        setActionMode('chat');
                      } catch (error) { setWorkflowError(error.message); } finally {setDeliveryBusy(false);}
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    {deliveryBusy?'Enviando...':'Enviar para Revisão Interna'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* LINHA DO TEMPO / HISTÓRICO DE INTERAÇÕES */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Histórico & Interações ({visibleTimeline.length})
            </h4>

            {visibleTimeline.map((item) => {
              if (item.type === 'system') {
                return (
                  <div
                    key={item.id}
                    className="text-center text-[11px] text-slate-500 py-1"
                  >
                    <span className="px-3 py-1 rounded-full bg-slate-200/70">
                      {item.content} • {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                );
              }

              const isInternal = item.type === 'internal';
              const isSacPause = item.type === 'sac_pause';
              const isDelivery = item.type === 'delivery';
              const isApproved = item.type === 'approved';

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border text-xs sm:text-sm ${
                    isInternal
                      ? 'bg-amber-50/90 border-amber-300'
                      : isSacPause
                      ? 'bg-amber-50 border-amber-200'
                      : isDelivery
                      ? 'bg-purple-50 border-purple-200'
                      : isApproved
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">
                        {item.authorName}
                      </span>
                      {isInternal && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 text-[10px] font-extrabold uppercase">
                          <Lock className="w-3 h-3" />
                          Nota Interna Técnica
                        </span>
                      )}
                      {isSacPause && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 text-[10px] font-bold">
                          Pausa SAC Solicitada
                        </span>
                      )}
                      {["cancelled","reopened","adjustment"].includes(item.type)&&<span className="text-[10px] font-bold">{({cancelled:"Cancelamento",reopened:"Reabertura",adjustment:"Ajustes solicitados"})[item.type]}</span>}
                      {isDelivery && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-200 text-purple-950 text-[10px] font-bold">
                          Entrega Enviada{item.version?` · V${item.version}`:""}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>

                  <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {item.content}
                  </p>
                  <ReferenceFiles files={item.attachments || []} />

                  {item.deliveryLink && (
                    <a
                      href={item.deliveryLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Acessar Arquivo Entregue
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RODAPÉ FIXO: COMPOSITOR DE MENSAGEM PÚBLICA OU NOTA INTERNA */}
        {(isStaff||isRequester)?<form
          onSubmit={handleSendChat}
          className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-white shrink-0 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5 space-y-2"
        >
          {isStaff && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={chatSending}
                onClick={() => setIsInternalNote(false)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  !isInternalNote
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Mensagem Pública
              </button>
              <button
                type="button"
                disabled={chatSending}
                onClick={() => setIsInternalNote(true)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  isInternalNote
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5" />
                Nota Interna Técnica
              </button>
            </div>
          )}

          <MentionPicker users={users} user={currentUser} ticket={ticket} internal={isInternalNote} value={replyText} onChange={setReplyText} disabled={chatSending}/>
          <ReferencePicker files={replyFiles} onChange={setReplyFiles} disabled={chatSending} label={isInternalNote ? 'Referências privadas do Marketing' : 'Anexar imagem, print ou PDF'} />
          {chatError && <p role="alert" className="text-red-700 text-xs">{chatError}</p>}
          <div className="flex items-center gap-2">
            <input
              type="text"
              disabled={chatSending}
              onPaste={e=>{const pasted=Array.from(e.clipboardData.files||[]);if(pasted.length){e.preventDefault();setReplyFiles(old=>[...old,...pasted]);}}}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={
                isStaff && isInternalNote
                  ? 'Escreva uma anotação técnica visível apenas para a equipe de Marketing...'
                  : 'Escreva uma atualização ou resposta neste chamado...'
              }
              className={`flex-1 px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                isStaff && isInternalNote
                  ? 'border-amber-300 bg-amber-50/50 focus:ring-amber-500'
                  : 'border-slate-300 focus:ring-indigo-500'
              }`}
            />
            <button
              type="submit"
              disabled={chatSending || (!replyText.trim() && !replyFiles.length)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs transition ${
                isStaff && isInternalNote
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{chatSending ? 'Enviando...' : 'Enviar'}</span>
            </button>
          </div>
        </form>:<div className="p-4 bg-white border-t text-sm text-slate-500">Você acompanha este chamado somente para visualização.</div>}
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * PAINEL DE HISTÓRICO DE NOTIFICAÇÕES (SININHO)
 * ============================================================================
 */
function NotificationsPanel({
  notifications,
  onClose,
  onSelectNotification,
  onMarkAllRead
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="bg-white w-full sm:max-w-md h-full shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-slate-900">Notificações</h3>
            <p className="text-xs text-slate-500">
              Clique em um alerta para abrir o chamado correspondente
            </p>
          </div>
          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Marcar lidas
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-10 text-center">
              <Bell className="w-9 h-9 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">
                Nenhuma notificação ainda
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Alertas de novos chamados, pausas SAC e aprovações aparecerão
                aqui.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => onSelectNotification(n)}
                className={`p-4 cursor-pointer transition hover:bg-slate-50 ${
                  !n.read ? 'bg-indigo-50/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-slate-900">
                    {n.title}
                  </span>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                <div className="text-[11px] text-slate-400 mt-1.5">
                  {formatDateTime(n.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * POP-UPS FLUTUANTES EM TEMPO REAL (BANNER TOPO MOBILE / INFERIOR DIREITO PC)
 * ============================================================================
 */
function ToastPopups({ popups, onDismiss, onSelectTicket }) {
  if (!popups || popups.length === 0) return null;

  const typeStyles = {
    info: 'border-indigo-200 bg-white text-slate-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    warning: 'border-amber-300 bg-amber-50 text-amber-950'
  };

  return (
    <div className="fixed top-3 inset-x-3 md:top-auto md:bottom-5 md:right-5 md:left-auto md:w-96 z-50 space-y-2.5 pointer-events-none">
      {popups.map((p) => (
        <div
          key={p.id}
          onClick={() => {
            if (p.ticketId) onSelectTicket(p.ticketId);
            onDismiss(p.id);
          }}
          className={`pointer-events-auto p-3.5 rounded-2xl border shadow-xl flex items-start justify-between gap-3 cursor-pointer transition-all ${
            typeStyles[p.type] || typeStyles.info
          }`}
        >
          <div className="min-w-0">
            <div className="text-xs font-extrabold">{p.title}</div>
            <div className="text-xs opacity-90 mt-0.5 line-clamp-2">
              {p.message}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(p.id);
            }}
            className="p-1 rounded-lg opacity-60 hover:opacity-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * ============================================================================
 * MODAL DE INSTRUÇÃO PWA PARA SAFARI NO IPHONE / IPAD
 * ============================================================================
 */
function IOSInstallModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-base">
            Instalar BravaDesk na Tela de Início
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Para instalar o <strong>BravaDesk</strong> como aplicativo no seu iPhone,
          iPad ou navegador:
        </p>

        <ol className="space-y-3 text-xs text-slate-800">
          <li className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <Share className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>
              1. No iPhone, abra no Safari e toque em <strong>Compartilhar</strong>. No Android, abra no Chrome e toque no menu ⋮.
            </span>
          </li>
          <li className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <PlusSquare className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>
              2. Role e selecione <strong>&quot;Adicionar à Tela de Início&quot;</strong>{' '}
              (ou &quot;Instalar Aplicativo&quot;).
            </span>
          </li>
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * MODAL DE CONFIRMAÇÃO CUSTOMIZADO (SUBSTITUI window.confirm)
 * ============================================================================
 */
function ConfirmDialogModal({
  title,
  message,
  confirmLabel,
  danger,
  onCancel,
  onConfirm
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl p-6 space-y-4">
        <h3 className="font-extrabold text-slate-900 text-base">{title}</h3>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-white text-xs font-bold ${
              danger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
function InviteManager({currentUser}) {
 const [email,setEmail]=useState(''),[role,setRole]=useState('tecnico'),[code,setCode]=useState(''),[msg,setMsg]=useState(''),[rows,setRows]=useState([]);
 const load=async()=>{const {data,error}=await supabase.rpc('bd_list_invites');if(error)setMsg(error.message);else setRows(data||[]);};
 useEffect(()=>{load();},[]);
 return <section className="bg-white rounded-2xl border p-4 space-y-3"><h2 className="font-bold">Convites individuais</h2><p className="text-xs text-slate-500">Válidos por 48 horas, uso único e vinculados ao e-mail. Envie o código diretamente ao colaborador.</p><form className="flex flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();setCode('');const {data,error}=await supabase.rpc('bd_create_invite',{p_email:email,p_role:role});if(error)setMsg(error.message);else{setCode(data);setMsg('Convite criado. Copie e compartilhe de forma privada.');load();}}}><input required type="email" placeholder="E-mail do colaborador" className="border rounded-lg p-2" value={email} onChange={e=>setEmail(e.target.value)}/><select className="border rounded-lg p-2" value={role} onChange={e=>setRole(e.target.value)}><option value="tecnico">Técnico</option>{currentUser.role==='super_admin'&&<option value="admin">Administrador</option>}</select><button className="bg-indigo-600 text-white rounded-lg p-2">Gerar convite</button></form>{code&&<input readOnly onFocus={e=>e.target.select()} className="w-full border p-2 rounded font-mono text-xs" value={code}/>}<p role="status" className="text-sm">{msg}</p>{rows.map(r=><div key={r.id} className="flex flex-wrap gap-2 justify-between border-t pt-2 text-xs"><span>{r.email} · {r.role} · {r.used_at?'Usado':r.revoked?'Revogado':new Date(r.expires_at)<new Date()?'Expirado':'Pendente'} · {formatDateTime(r.expires_at)}</span>{!r.used_at&&!r.revoked&&<button className="underline" onClick={async()=>{const {error}=await supabase.rpc('bd_revoke_invite',{p_id:r.id});setMsg(error?.message||'Convite revogado');load();}}>Revogar</button>}</div>)}</section>;
}
function RedeemInvite({onDone}) {
 const [code,setCode]=useState(''),[msg,setMsg]=useState('');
 return <details className="bg-white border rounded-lg p-3 mt-2 text-sm"><summary>Tenho um convite de equipe</summary><form className="flex flex-wrap gap-2 mt-2" onSubmit={async e=>{e.preventDefault();const {error}=await supabase.rpc('bd_redeem_invite',{p_code:code});setMsg(error?.message||'Convite ativado');if(!error)await onDone();}}><input className="border rounded p-2 flex-1" required placeholder="Código individual" value={code} onChange={e=>setCode(e.target.value)}/><button className="bg-indigo-600 text-white p-2 rounded">Ativar</button></form><p role="status">{msg}</p></details>;
}
function NotificationPreferences({userId,soundEnabled,setSoundEnabled}) {
  const [vibration,setVibration]=useState(()=>safeStorageGet('vibration:'+userId,true));
  const [msg,setMsg]=useState(''),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[prompt,setPrompt]=useState(false),[permission,setPermission]=useState(()=>typeof Notification==='undefined'?'unsupported':Notification.permission);
  const supported='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const registrationKey='pushRegistered:'+userId, snoozeKey='pushSnooze:'+userId;
  const key=import.meta.env.VITE_VAPID_PUBLIC_KEY;
  function dismiss(){safeStorageSet(snoozeKey,Date.now()+86400000);setPrompt(false);}
  async function registration(){const reg=await navigator.serviceWorker.getRegistration();if(!reg)throw Error('Aplicativo ainda não está pronto para push. Atualize a página e tente novamente.');return reg.active?reg:await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service Worker ainda não está ativo. Atualize a página.')),8000))]);}
  async function configure(on){
    if(busy)return;setBusy(true);setMsg('');
    try{
      if(!supported)throw Error('Push indisponível neste navegador. No iPhone, instale pela tela de início e abra o aplicativo instalado.');
      if(on){
        if(!key)throw Error('Push ainda não configurado na Vercel.');
        // A permissão é solicitada diretamente no clique, antes de outras operações assíncronas.
        const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission();setPermission(perm);
        if(perm!=='granted')throw Error(perm==='denied'?'Notificações bloqueadas. Libere nas configurações do navegador ou do celular.':'Permissão não concedida. Você pode tentar novamente.');
      }
      const reg=await registration();let sub=await reg.pushManager.getSubscription();
      if(!on){if(sub){const {error}=await supabase.rpc('bd_remove_device',{p_endpoint:sub.endpoint});if(error)throw error;await sub.unsubscribe();}safeStorageSet(registrationKey,null);setEnabled(false);dismiss();setMsg('Push desativado neste dispositivo.');return;}
      const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'='));
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});
      const {error}=await supabase.rpc('bd_save_device',{p_subscription:sub.toJSON()});if(error)throw error;
      safeStorageSet(registrationKey,sub.endpoint);safeStorageSet(snoozeKey,0);setEnabled(true);setPrompt(false);setMsg('Dispositivo registrado para push.');
    }catch(e){setMsg(e.message||'Não foi possível configurar as notificações.');}finally{setBusy(false);}
  }
  useEffect(()=>{
    let alive=true;
    async function check(){
      if(!supported||!key)return;
      try {const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager?.getSubscription();if(!alive)return;
        const perm=Notification.permission;setPermission(perm);
        const active=perm==='granted'&&!!sub&&safeStorageGet(registrationKey,null)===sub.endpoint;
        if(perm==='granted'&&sub&&!active){
          // Revalida uma inscrição antiga nesta conta sem pedir permissão novamente.
          const {error}=await supabase.rpc('bd_save_device',{p_subscription:sub.toJSON()});if(!alive)return;
          if(!error){safeStorageSet(registrationKey,sub.endpoint);setEnabled(true);return;}
          setMsg(error.message);
        }
        setEnabled(active);if(!active&&Date.now()>=Number(safeStorageGet(snoozeKey,0)))setPrompt(true);
      }catch(e){if(alive)setMsg(e.message);}
    }
    check();return()=>{alive=false;};
  },[userId]);
  useEffect(()=>{if(!prompt)return;const listener=e=>{if(e.key==='Escape'&&!busy)dismiss();};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[prompt,busy]);
  const status=enabled?'Notificações ativadas':permission==='denied'?'Notificações bloqueadas':!supported?'Push indisponível neste navegador':!key?'Push não configurado':'Notificações desativadas';
  return <>
    <details className="bg-white border border-slate-200 rounded-xl p-3 text-sm"><summary className="font-semibold cursor-pointer"><span className="inline-flex items-center gap-2"><BellRing className="w-4 h-4 text-indigo-600"/> Preferências de notificações <span className={'text-xs '+(enabled?'text-emerald-700':'text-amber-700')}>· {status}</span></span></summary>
      <div className="flex flex-wrap gap-4 mt-3 items-center"><label><input type="checkbox" checked={soundEnabled} onChange={e=>setSoundEnabled(e.target.checked)}/> Som</label><label><input type="checkbox" checked={vibration} onChange={e=>{setVibration(e.target.checked);safeStorageSet('vibration:'+userId,e.target.checked);}}/> Vibração</label><button disabled={busy} className="underline text-indigo-700" onClick={()=>configure(true)}>{enabled?'Registrar novamente':'Ativar push'}</button><button disabled={busy} className="underline" onClick={()=>configure(false)}>Desativar push</button><button className="underline" onClick={()=>{playGentleChime(soundEnabled);if(vibration)navigator.vibrate?.([150,80,150]);setMsg('Teste local solicitado. O aparelho pode bloquear som ou vibração.');}}>Testar som e vibração</button></div><p role="status" className="text-xs mt-2">{msg}</p>
    </details>
    {prompt&&<div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget&&!busy)dismiss();}}><section role="dialog" aria-modal="true" aria-labelledby="bd-push-title" className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white border border-slate-200 rounded-3xl shadow-xl p-6 space-y-4 text-slate-900">
      <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center"><BellRing className="w-8 h-8 text-indigo-700"/></div><h2 id="bd-push-title" className="text-xl font-bold text-center">Não perca nenhuma atualização!</h2><p className="text-sm text-slate-600 text-center">Receba avisos do BravaDesk mesmo com o aplicativo fechado.</p>
      <div className="space-y-2 text-sm text-slate-700"><p className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-600"/> Novas respostas nos chamados</p><p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-indigo-600"/> Atualizações e aprovações</p><p className="flex items-center gap-2"><Volume2 className="w-4 h-4 text-indigo-600"/> Som e vibração conforme seu aparelho</p></div>
      {permission==='denied'&&<p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">Permissão bloqueada. Abra as configurações do navegador ou do celular, permita notificações para o BravaDesk e tente novamente.</p>}
      {msg&&<p className="text-xs text-slate-600" role="status">{msg}</p>}
      <button autoFocus type="button" disabled={busy} onClick={()=>configure(true)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-3 disabled:opacity-50">{busy?'Ativando…':'Ativar notificações'}</button><button type="button" disabled={busy} onClick={dismiss} className="w-full text-sm text-slate-500 py-2">Agora não</button><p className="text-center text-xs text-slate-500">Você pode alterar essa preferência a qualquer momento.</p>
    </section></div>}
  </>;
}

function ObserverPicker({users,catalog,department,requesterId,value,onChange}){const [q,setQ]=useState('');const candidates=users.filter(u=>u.active!==false&&u.id!==requesterId&&sameDepartment(catalog,u.department,department)&&value.length<20&&!value.includes(u.id)&&`${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));return <div className="space-y-2 border border-slate-200 rounded-xl p-3"><label className="text-xs font-bold">Observadores (opcional)</label><p className="text-xs text-slate-500">Colaboradores do departamento com conta ativa. Apenas acompanhamento.</p>{value.map(id=><div key={id} className="flex justify-between text-sm"><span>{users.find(u=>u.id===id)?.name||id}</span><button type="button" className="text-rose-600" onClick={()=>onChange(value.filter(x=>x!==id))}>Remover</button></div>)}<input className="w-full border rounded-lg p-2 text-sm" placeholder="Buscar por nome ou e-mail" value={q} onChange={e=>setQ(e.target.value)}/>{candidates.slice(0,8).map(u=><button type="button" key={u.id} className="block text-left w-full text-sm p-2 border rounded-lg" onClick={()=>onChange([...value,u.id])}>{u.name} · {u.email}</button>)}</div>}

function sameDepartment(catalog,a,b){if(!a||!b)return false;if(a===b)return true;return (catalog||[]).some(d=>[d.name,...(d.aliases||[])].includes(a)&&[d.name,...(d.aliases||[])].includes(b));}
