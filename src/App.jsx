import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
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
  Webhook,
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
  techInviteCode: '',
  adminInviteCode: '',
  allowedDomains: '', // Vazio por padrão para permitir uso imediato; configurável pelo Admin
  webhookUrl: '',
  webhookSecret: '',
  categories: DEFAULT_CATEGORIES,
  // Etapas adicionais permanecem vinculadas ao fluxo principal para preservar SLA e aprovações.
  customStages: []
};

const STATUS_META = {
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
  const activeElapsedMs = Math.max(
    0,
    endRefMs - createdMs - accumulatedPausedMs - currentPauseMs
  );

  const slaHours = Number(ticket.slaHours || 24);
  const slaTargetMs = slaHours * 3600 * 1000;
  const remainingMs = slaTargetMs - activeElapsedMs;
  const percentUsed = Math.min(
    100,
    Math.round((activeElapsedMs / Math.max(1, slaTargetMs)) * 100)
  );
  const isBreached = remainingMs < 0;

  if (ticket.status === 'aguardando_solicitante') {
    return {
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
      isPaused: false,
      isBreached: true,
      activeElapsedMs,
      remainingMs,
      currentPauseMs: 0,
      percentUsed: 100,
      label: `Estourado há ${formatDuration(remainingMs)}`,
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
    };
  }

  if (remainingMs <= slaTargetMs * 0.25) {
    return {
      isPaused: false,
      isBreached: false,
      activeElapsedMs,
      remainingMs,
      currentPauseMs: 0,
      percentUsed,
      label: `Restam ${formatDuration(remainingMs)}`,
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
    };
  }

  return {
    isPaused: false,
    isBreached: false,
    activeElapsedMs,
    remainingMs,
    currentPauseMs: 0,
    percentUsed,
    label: `Restam ${formatDuration(remainingMs)}`,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };
}

/**
 * Alerta sonoro suave sintetizado via Web Audio API (sem dependências externas)
 */
function playGentleChime(enabled) {
  if (!enabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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
    grad.addColorStop(0, '#4f46e5');
    grad.addColorStop(1, '#312e81');

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

    ctx.fillStyle = '#a5b4fc';
    ctx.font = `600 ${Math.round(size * 0.12)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText('DESK', size / 2, size * 0.74);

    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/**
 * ============================================================================
 * COMPONENTE PRINCIPAL: MktDesk (App)
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
  const [emailLogs, setEmailLogs] = useState([]);
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
      supabase.from('email_logs').select('id,data'),
      supabase.from('app_settings').select('data').eq('id', 1).maybeSingle()
    ]);
    const errors = results.filter((r) => r.error).map((r) => r.error.message);
    if (errors.length) { setDataError(errors.join(' | ')); return; }
    setDataError('');
    setUsers(results[0].data.map((r) => ({...r.data, id:r.id, role:r.role, active:r.active, createdAt:r.created_at})));
    setTickets(results[1].data.map((r) => ({...r.data, id:r.id})));
    setNotifications(results[2].data.map((r) => ({...r.data, id:r.id})));
    setEmailLogs(results[3].data.map((r) => ({...r.data, id:r.id})));
    setSettings({...DEFAULT_SETTINGS, ...(results[4].data?.data || {}), categories:results[4].data?.data?.categories || DEFAULT_CATEGORIES, customStages:results[4].data?.data?.customStages || []});
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser || !supabaseConfigured) {
      setUsers([]); setTickets([]); setNotifications([]); setEmailLogs([]);
      return;
    }
    reloadData();
    // Cada alteração relevante atualiza os painéis abertos sem recarregar a página.
    const channel = supabase.channel('mktdesk-sync')
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, reloadData)
      .on('postgres_changes', { event:'*', schema:'public', table:'tickets' }, reloadData)
      .on('postgres_changes', { event:'*', schema:'public', table:'notifications' }, reloadData)
      .on('postgres_changes', { event:'*', schema:'public', table:'email_logs' }, reloadData)
      .on('postgres_changes', { event:'*', schema:'public', table:'app_settings' }, reloadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id, reloadData]);

  const saveRecord = useCallback(async (table, value, extras = {}) => {
    if (!supabaseConfigured || !authUser) throw new Error('Faça login no Supabase para salvar.');
    const { error } = await supabase.from(table).upsert({id:value.id, data:value, ...extras}, {onConflict:'id'});
    if (error) { setDataError(error.message); throw error; }
    await reloadData();
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
    await saveRecord('tickets', obj, {requester_id:obj.requesterId});
  }, [saveRecord]);
  const handleSetCustomStage = async (ticket, stageId) => {
    if (!currentUser || !['admin','tecnico'].includes(currentUser.role)) return;
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
  const persistEmailLogDoc = useCallback(async (obj) => {
    await saveRecord('email_logs', obj);
  }, [saveRecord]);
  const persistSettingsDoc = useCallback(async (obj) => {
    // Chaves privadas de serviços externos NÃO podem ficar no frontend.
    const {webhookSecret:_secret, webhookUrl:_url, ...publicSettings} = obj;
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

      const icon192 = generateAppIconDataUrl(192);
      const icon512 = generateAppIconDataUrl(512);

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
      ensureMeta('apple-mobile-web-app-title', 'MktDesk');
      ensureMeta('theme-color', '#4f46e5');

      if (icon192) {
        let appleLink = document.querySelector('link[rel="apple-touch-icon"]');
        if (!appleLink) {
          appleLink = document.createElement('link');
          appleLink.setAttribute('rel', 'apple-touch-icon');
          document.head.appendChild(appleLink);
        }
        appleLink.setAttribute('href', icon192);
      }

      const manifestObj = {
        name: 'MktDesk — Central de Demandas de Marketing',
        short_name: 'MktDesk',
        description: 'GLPI Corporativo de Demandas e SLA de Marketing',
        start_url: '.',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#4f46e5',
        icons: [
          icon192 && { src: icon192, sizes: '192x192', type: 'image/png' },
          icon512 && { src: icon512, sizes: '512x512', type: 'image/png' }
        ].filter(Boolean)
      };

      const blob = new Blob([JSON.stringify(manifestObj)], {
        type: 'application/manifest+json'
      });
      const manifestUrl = URL.createObjectURL(blob);

      let manifestLink = document.querySelector('link[rel="manifest"]');
      if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.setAttribute('rel', 'manifest');
        document.head.appendChild(manifestLink);
      }
      manifestLink.setAttribute('href', manifestUrl);

      return () => URL.revokeObjectURL(manifestUrl);
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

  const dispatchNotificationAndWebhook = useCallback(
    async ({
      recipientUserIds = [],
      recipientEmails = [],
      eventType,
      title,
      message,
      ticket = null,
      popupType = 'info'
    }) => {
      const nowIso = new Date().toISOString();

      // 1. Grava notificações internas para os destinatários
      const uniqueUserIds = Array.from(new Set(recipientUserIds.filter(Boolean)));
      for (const uid of uniqueUserIds) {
        const notif = {
          id: generateId('ntf'),
          userId: uid,
          title,
          message,
          ticketId: ticket ? ticket.id : null,
          protocol: ticket ? ticket.protocol : null,
          type: popupType,
          read: false,
          createdAt: nowIso
        };
        await persistNotificationDoc(notif);
      }

      // 2. Se o usuário atualmente logado está entre os destinatários, exibe pop-up + som
      if (currentUser && uniqueUserIds.includes(currentUser.id)) {
        showFloatingPopup({
          title,
          message,
          type: popupType,
          ticketId: ticket ? ticket.id : null,
          withSound: true
        });
        sendBrowserNativeNotification(`MktDesk • ${title}`, message);
      }

      // 3. Dispara Webhook real (n8n / Make / Zapier / API) se configurado e registra na Caixa de Saída
      const emailsList = Array.from(new Set(recipientEmails.filter(Boolean)));
      if (emailsList.length > 0 || eventType === 'WEBHOOK_TEST') {
        const payload = {
          system: 'MktDesk',
          event: eventType,
          timestamp: nowIso,
          recipients: emailsList,
          subject: `[MktDesk] ${title}`,
          body: message,
          ticket: ticket
            ? {
                id: ticket.id,
                protocol: ticket.protocol,
                title: ticket.title,
                category: ticket.categoryName,
                priority: ticket.priority,
                status: ticket.status,
                department: ticket.department,
                requesterName: ticket.requesterName,
                requesterEmail: ticket.requesterEmail,
                assignedTechName: ticket.assignedTechName || null
              }
            : null
        };

        let deliveryStatus = 'Registrado (Webhook não configurado)';
        if (false) { // Desativado: configurar envio na Edge Function, não expor secrets no browser.
          try {
            const headers = { 'Content-Type': 'application/json' };
            if (settings.webhookSecret && settings.webhookSecret.trim()) {
              headers['X-MktDesk-Secret'] = settings.webhookSecret.trim();
            }
            const res = await fetch(settings.webhookUrl.trim(), {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
            });
            deliveryStatus = res.ok
              ? `Enviado via Webhook (HTTP ${res.status})`
              : `Falha Webhook (HTTP ${res.status})`;
          } catch (err) {
            deliveryStatus = `Erro de rede Webhook (${err.message || 'CORS/Offline'})`;
          }
        }

        const logEntry = {
          id: generateId('eml'),
          createdAt: nowIso,
          eventType,
          recipients: emailsList.length > 0 ? emailsList : ['teste@webhook.local'],
          subject: `[MktDesk] ${title}`,
          message,
          protocol: ticket ? ticket.protocol : 'SISTEMA',
          deliveryStatus,
          payload
        };
        await persistEmailLogDoc(logEntry);
      }
    },
    [
      currentUser,
      persistEmailLogDoc,
      persistNotificationDoc,
      sendBrowserNativeNotification,
      settings.webhookSecret,
      settings.webhookUrl,
      showFloatingPopup
    ]
  );

  /**
   * --------------------------------------------------------------------------
   * OPERAÇÕES DE NEGÓCIO (CHAMADOS, SAC, APROVAÇÃO, CSAT, EQUIPE)
   * --------------------------------------------------------------------------
   */
  const generateNextProtocol = useCallback(() => {
    if (!tickets || tickets.length === 0) return '#MKT-1001';
    let maxNum = 1000;
    tickets.forEach((t) => {
      const match = String(t.protocol || '').match(/(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!Number.isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    return `#MKT-${maxNum + 1}`;
  }, [tickets]);

  const handleCreateTicket = async (formData) => {
    if (!currentUser) return;
    if (!settings.categories.some(c => c.id === formData.categoryId && c.active !== false)) {
      setDataError('Serviço indisponível. Escolha um serviço ativo.');
      return;
    }
    const categoryObj =
      settings.categories.find((c) => c.id === formData.categoryId && c.active !== false) ||
      settings.categories.find(c => c.active !== false) ||
      DEFAULT_CATEGORIES[0];

    const protocol = generateNextProtocol();
    const nowIso = new Date().toISOString();

    const newTicket = {
      id: generateId('tkt'),
      protocol,
      title: formData.title.trim(),
      categoryId: categoryObj.id,
      categoryName: categoryObj.name,
      slaHours: Number(categoryObj.slaHours || 24),
      priority: formData.priority || 'normal',
      department: formData.department || currentUser.department || 'Comercial & Vendas',
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
          content: `Demanda aberta com protocolo ${protocol} • Categoria: ${categoryObj.name} (SLA: ${categoryObj.slaHours}h).`,
          createdAt: nowIso
        }
      ]
    };

    await persistTicketDoc(newTicket);
    setShowNewTicketModal(false);
    setActiveTicketId(newTicket.id);

    // Notifica toda a equipe de Marketing (Admins + Técnicos ativos)
    const mktTeam = users.filter(
      (u) => u.active !== false && (u.role === 'admin' || u.role === 'tecnico')
    );
    await dispatchNotificationAndWebhook({
      recipientUserIds: mktTeam.map((u) => u.id),
      recipientEmails: mktTeam.map((u) => u.email),
      eventType: 'TICKET_CREATED',
      title: `Nova Demanda ${protocol}`,
      message: `${currentUser.name} (${newTicket.department}) abriu: "${newTicket.title}"`,
      ticket: newTicket,
      popupType: 'info'
    });

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
      await dispatchNotificationAndWebhook({
        recipientUserIds: [tech.id, ticket.requesterId],
        recipientEmails: [tech.email, ticket.requesterEmail],
        eventType: 'TICKET_ASSIGNED',
        title: `${ticket.protocol} Assumido`,
        message: `${tech.name} agora é o responsável pela demanda "${ticket.title}".`,
        ticket: updated,
        popupType: 'info'
      });
    }
  };

  const handlePostMessage = async (ticket, { content, isInternal }) => {
    if (!currentUser || !content.trim()) return;
    const nowIso = new Date().toISOString();
    const isMarketingStaff =
      currentUser.role === 'admin' || currentUser.role === 'tecnico';

    const entry = {
      id: generateId('msg'),
      type: isInternal && isMarketingStaff ? 'internal' : 'public',
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      content: content.trim(),
      createdAt: nowIso
    };

    const updated = {
      ...ticket,
      firstResponseAt:
        !isInternal && isMarketingStaff && !ticket.firstResponseAt
          ? nowIso
          : ticket.firstResponseAt,
      updatedAt: nowIso,
      timeline: [...ticket.timeline, entry]
    };

    await persistTicketDoc(updated);

    if (isInternal && isMarketingStaff) {
      showFloatingPopup({
        title: 'Nota Interna Salva',
        message: `Anotação técnica privada registrada em ${ticket.protocol}.`,
        type: 'warning',
        ticketId: ticket.id,
        withSound: false
      });
      return;
    }

    // Mensagem pública: notifica a outra ponta
    if (currentUser.id === ticket.requesterId) {
      const targets = ticket.assignedTechId
        ? users.filter((u) => u.id === ticket.assignedTechId)
        : users.filter((u) => u.role === 'admin' || u.role === 'tecnico');
      await dispatchNotificationAndWebhook({
        recipientUserIds: targets.map((u) => u.id),
        recipientEmails: targets.map((u) => u.email),
        eventType: 'TICKET_REPLY',
        title: `Nova Mensagem em ${ticket.protocol}`,
        message: `${currentUser.name}: "${content.trim().slice(0, 90)}"`,
        ticket: updated,
        popupType: 'info'
      });
    } else {
      const reqUser = users.find((u) => u.id === ticket.requesterId);
      await dispatchNotificationAndWebhook({
        recipientUserIds: reqUser ? [reqUser.id] : [],
        recipientEmails: [ticket.requesterEmail],
        eventType: 'TICKET_REPLY',
        title: `Resposta do Marketing • ${ticket.protocol}`,
        message: `${currentUser.name}: "${content.trim().slice(0, 90)}"`,
        ticket: updated,
        popupType: 'info'
      });
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
    await dispatchNotificationAndWebhook({
      recipientUserIds: reqUser ? [reqUser.id] : [],
      recipientEmails: [ticket.requesterEmail],
      eventType: 'SAC_PAUSED',
      title: `Ação Necessária (SAC) • ${ticket.protocol}`,
      message: `${currentUser.name} pausou a demanda e aguarda sua informação: "${questionText
        .trim()
        .slice(0, 90)}"`,
      ticket: updated,
      popupType: 'warning'
    });

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
      : users.filter((u) => u.role === 'admin' || u.role === 'tecnico');

    await dispatchNotificationAndWebhook({
      recipientUserIds: targets.map((u) => u.id),
      recipientEmails: targets.map((u) => u.email),
      eventType: 'SAC_UNLOCKED',
      title: `Demanda Destravada • ${ticket.protocol}`,
      message: `${currentUser.name} respondeu a pendência e retomou a produção.`,
      ticket: updated,
      popupType: 'success'
    });

    showFloatingPopup({
      title: `Demanda ${ticket.protocol} Destravada`,
      message: 'Sua resposta foi enviada e o atendimento foi retomado.',
      type: 'success',
      ticketId: ticket.id
    });
  };

  /**
   * Enviar Entrega para Aprovação do Solicitante
   */
  const handleSendDelivery = async (ticket, { deliveryNotes, deliveryLink }) => {
    if (!currentUser || !deliveryNotes.trim()) return;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const pausedDuration =
      ticket.status === 'aguardando_solicitante' && ticket.sacPausedAt
        ? Math.max(0, nowMs - new Date(ticket.sacPausedAt).getTime())
        : 0;

    const updated = {
      ...ticket,
      status: 'em_aprovacao',
      assignedTechId: ticket.assignedTechId || currentUser.id,
      assignedTechName: ticket.assignedTechName || currentUser.name,
      firstResponseAt: ticket.firstResponseAt || nowIso,
      sacPausedAt: null,
      totalPausedMs: Number(ticket.totalPausedMs || 0) + pausedDuration,
      deliveryLink: (deliveryLink || '').trim(),
      updatedAt: nowIso,
      timeline: [
        ...ticket.timeline,
        {
          id: generateId('msg'),
          type: 'delivery',
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: currentUser.role,
          content: deliveryNotes.trim(),
          deliveryLink: (deliveryLink || '').trim(),
          createdAt: nowIso
        }
      ]
    };

    await persistTicketDoc(updated);

    const reqUser = users.find((u) => u.id === ticket.requesterId);
    await dispatchNotificationAndWebhook({
      recipientUserIds: reqUser ? [reqUser.id] : [],
      recipientEmails: [ticket.requesterEmail],
      eventType: 'DELIVERY_READY',
      title: `Entrega Pronta para Aprovação • ${ticket.protocol}`,
      message: `${currentUser.name} enviou o material de "${ticket.title}" para sua validação.`,
      ticket: updated,
      popupType: 'success'
    });

    showFloatingPopup({
      title: `Entrega Enviada • ${ticket.protocol}`,
      message: 'Aguardando aprovação e avaliação CSAT do solicitante.',
      type: 'success',
      ticketId: ticket.id
    });
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
      (u) => u.id === ticket.assignedTechId || u.role === 'admin'
    );
    await dispatchNotificationAndWebhook({
      recipientUserIds: targets.map((u) => u.id),
      recipientEmails: targets.map((u) => u.email),
      eventType: 'TICKET_APPROVED',
      title: `Entrega Aprovada (${rating}★) • ${ticket.protocol}`,
      message: `${currentUser.name} aprovou "${ticket.title}" e avaliou o atendimento.`,
      ticket: updated,
      popupType: 'success'
    });

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
      : users.filter((u) => u.role === 'admin' || u.role === 'tecnico');

    await dispatchNotificationAndWebhook({
      recipientUserIds: targets.map((u) => u.id),
      recipientEmails: targets.map((u) => u.email),
      eventType: 'ADJUSTMENT_REQUESTED',
      title: `Ajustes Solicitados • ${ticket.protocol}`,
      message: `${currentUser.name} pediu ajustes em "${ticket.title}".`,
      ticket: updated,
      popupType: 'warning'
    });

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

    await dispatchNotificationAndWebhook({
      recipientUserIds: reqIds,
      recipientEmails: reqEmails,
      eventType: 'SAC_REMINDER',
      title: `Cobrança de Pendência SAC • ${deptName}`,
      message: `O Marketing aguarda retorno nas demandas (${protocols}) para destravar a produção.`,
      ticket: pausedTickets[0],
      popupType: 'warning'
    });

    showFloatingPopup({
      title: `Cobrança Disparada (${deptName})`,
      message: `Pop-up e alerta de e-mail enviados para ${reqEmails.length} solicitante(s) (${protocols}).`,
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
        ) : <AuthScreen />}
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
          await supabase.auth.signOut();
          setActiveTicketId(null);
          setShowNotificationsDrawer(false);
        }}
        canInstallPWA={Boolean(deferredInstallPrompt) || (isIOSDevice && !isStandalonePWA)}
        onInstallPWA={triggerPWAInstall}
      />

      {/* BARRA DE NAVEGAÇÃO SUPERIOR (DESKTOP) POR PERFIL */}
      {currentUser.role === 'admin' && (
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
                  badge: tickets.filter((t) => t.status !== 'concluido').length
                },
                {
                  id: 'equipe',
                  label: 'Equipe & Usuários',
                  icon: Users,
                  badge: users.length
                },
                {
                  id: 'config',
                  label: 'Configurações, PWA & E-mails',
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
                      t.status !== 'concluido'
                  ).length
                },
                {
                  id: 'geral',
                  label: 'Fila Geral Disponível',
                  count: tickets.filter(
                    (t) => !t.assignedTechId && t.status !== 'concluido'
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
        {/* ======================== PAINEL ADMIN ======================== */}
        {currentUser.role === 'admin' && (
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
                emailLogs={emailLogs}
                users={users}
                tickets={tickets}
                notifications={notifications}
                canInstallPWA={Boolean(deferredInstallPrompt) || (isIOSDevice && !isStandalonePWA)}
                isStandalonePWA={isStandalonePWA}
                onInstallPWA={triggerPWAInstall}
                onSaveSettings={async (updated) => {
                  await persistSettingsDoc(updated);
                  showFloatingPopup({
                    title: 'Configurações Salvas',
                    message: 'Regras de SLA, convites e integração foram atualizadas.',
                    type: 'success'
                  });
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
                    'MktDesk • Teste de Notificação',
                    'As notificações nativas estão ativas.'
                  );
                }}
                onTestWebhook={async () => {
                  await dispatchNotificationAndWebhook({
                    recipientUserIds: [currentUser.id],
                    recipientEmails: [currentUser.email],
                    eventType: 'WEBHOOK_TEST',
                    title: 'Teste de Integração Webhook & E-mail',
                    message: `Disparo de verificação executado por ${currentUser.name}.`,
                    popupType: 'success'
                  });
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
          nextProtocol={generateNextProtocol()}
          onClose={() => setShowNewTicketModal(false)}
          onSubmit={handleCreateTicket}
        />
      )}

      {/* MODAL: DETALHES DO CHAMADO & OPERAÇÃO GLPI */}
      {activeTicket && (
        <TicketDetailModal
          ticket={activeTicket}
          currentUser={currentUser}
          users={users}
          customStages={settings.customStages || []}
          onSetCustomStage={(id) => handleSetCustomStage(activeTicket, id)}
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
function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Marketing');
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
        const {data,error} = await supabase.auth.signUp({
          email:email.trim().toLowerCase(), password,
          options:{data:{name:name.trim(), department, jobTitle:jobTitle.trim()}}
        });
        if (error) throw error;
        setNotice(data.session ? 'Conta criada. Entrando…' : 'Cadastro recebido. Verifique seu e-mail para confirmar a conta. O administrador poderá atribuir sua função.');
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
      <div className="text-center"><div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center"><Sparkles /></div><h1 className="text-2xl font-bold">MktDesk</h1><p className="text-sm text-slate-500">Central de Demandas de Marketing</p></div>
      <div className="flex gap-2 justify-center text-sm">{[['login','Entrar'],['register','Cadastrar'],['reset','Recuperar senha']].map(([value,label])=><button key={value} type="button" onClick={()=>{setMode(value);setNotice('');}} className={'px-3 py-2 rounded-lg '+(mode===value?'bg-indigo-600 text-white':'bg-slate-100')}>{label}</button>)}</div>
      <form onSubmit={submit} className="space-y-3">
        {mode==='register'&&<><input className="w-full border rounded-lg p-3" placeholder="Nome completo" required value={name} onChange={e=>setName(e.target.value)}/><select className="w-full border rounded-lg p-3" value={department} onChange={e=>setDepartment(e.target.value)}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select><input className="w-full border rounded-lg p-3" placeholder="Cargo" required value={jobTitle} onChange={e=>setJobTitle(e.target.value)}/></>}
        <input className="w-full border rounded-lg p-3" type="email" placeholder="E-mail corporativo" required value={email} onChange={e=>setEmail(e.target.value)}/>
        {mode!=='reset'&&<input className="w-full border rounded-lg p-3" type="password" minLength={8} placeholder="Senha (mínimo 8 caracteres)" required value={password} onChange={e=>setPassword(e.target.value)}/>}
        {notice&&<p role="status" className="text-sm text-indigo-800 bg-indigo-50 p-3 rounded-lg">{notice}</p>}
        <button disabled={pending} className="bg-indigo-600 text-white py-3 rounded-lg w-full font-semibold disabled:opacity-50">{pending?'Processando…':mode==='login'?'Entrar':mode==='register'?'Criar conta':'Enviar recuperação'}</button>
      </form>
      <p className="text-xs text-slate-500 text-center">Novas contas recebem o perfil Solicitante. Um administrador pode promover usuários para Técnico ou Admin.</p>
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
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                MktDesk
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                GLPI Marketing
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate hidden sm:block">
              Central Corporativa de Demandas & SLA
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
  if (currentUser.role === 'admin') {
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
  const [period, setPeriod] = useState('30d'); // 7d | 30d | 90d | all
  const [deptFilter, setDeptFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');

  const filteredTickets = useMemo(() => {
    const cutoffMs =
      period === '7d'
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

  // Cálculo dos 5 KPIs Executivos
  const kpis = useMemo(() => {
    const total = filteredTickets.length;
    const concluded = filteredTickets.filter((t) => t.status === 'concluido');
    const throughputRate =
      total > 0 ? Math.round((concluded.length / total) * 100) : 0;

    // Conformidade de SLA
    let withinSlaCount = 0;
    filteredTickets.forEach((t) => {
      const sla = calculateTicketSLA(t, nowTick);
      if (!sla.isBreached) withinSlaCount++;
    });
    const slaCompliance =
      total > 0 ? Math.round((withinSlaCount / total) * 100) : 100;

    // TMA (Tempo Médio de Atendimento ativo) e TMR (Tempo Médio de Primeira Resposta)
    let sumTmaMs = 0;
    let countTma = 0;
    let sumTmrMs = 0;
    let countTmr = 0;

    filteredTickets.forEach((t) => {
      if (t.firstResponseAt) {
        const diff =
          new Date(t.firstResponseAt).getTime() -
          new Date(t.createdAt).getTime();
        if (diff >= 0) {
          sumTmrMs += diff;
          countTmr++;
        }
      }
      if (t.status === 'concluido' && t.completedAt) {
        const sla = calculateTicketSLA(t, nowTick);
        sumTmaMs += sla.activeElapsedMs;
        countTma++;
      }
    });

    const avgTmaMs = countTma > 0 ? sumTmaMs / countTma : 0;
    const avgTmrMs = countTmr > 0 ? sumTmrMs / countTmr : 0;

    // Gargalos SAC (atualmente aguardando solicitante)
    const sacTickets = filteredTickets.filter(
      (t) => t.status === 'aguardando_solicitante'
    );
    let totalSacWaitMs = 0;
    sacTickets.forEach((t) => {
      if (t.sacPausedAt) {
        totalSacWaitMs += Math.max(
          0,
          nowTick - new Date(t.sacPausedAt).getTime()
        );
      }
    });
    const avgSacWaitMs =
      sacTickets.length > 0 ? totalSacWaitMs / sacTickets.length : 0;

    // Satisfação CSAT
    const rated = filteredTickets.filter(
      (t) => typeof t.csatRating === 'number' && t.csatRating > 0
    );
    const avgCsat =
      rated.length > 0
        ? (
            rated.reduce((acc, t) => acc + t.csatRating, 0) / rated.length
          ).toFixed(1)
        : '—';

    return {
      total,
      concludedCount: concluded.length,
      throughputRate,
      slaCompliance,
      withinSlaCount,
      avgTmaMs,
      avgTmrMs,
      sacCount: sacTickets.length,
      avgSacWaitMs,
      avgCsat,
      ratedCount: rated.length
    };
  }, [filteredTickets, nowTick]);

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
      (u) => u.role === 'tecnico' || u.role === 'admin'
    );
    return staff.map((member) => {
      const assigned = filteredTickets.filter(
        (t) => t.assignedTechId === member.id
      );
      const activeQueue = assigned.filter((t) => t.status !== 'concluido');
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

  // Série Temporal SVG (últimos 7 pontos agrupados)
  const timelineSeries = useMemo(() => {
    const days = period === '7d' ? 7 : period === '90d' ? 14 : 10;
    const points = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(nowTick - i * 86400000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const opened = filteredTickets.filter((t) => {
        const ms = new Date(t.createdAt).getTime();
        return ms >= dayStart.getTime() && ms < dayEnd.getTime();
      }).length;

      const closed = filteredTickets.filter((t) => {
        if (!t.completedAt) return false;
        const ms = new Date(t.completedAt).getTime();
        return ms >= dayStart.getTime() && ms < dayEnd.getTime();
      }).length;

      points.push({
        label: formatDateShort(dayStart.toISOString()),
        opened,
        closed
      });
    }
    return points;
  }, [filteredTickets, period, nowTick]);

  // Distribuição Donut por Status
  const statusDistribution = useMemo(() => {
    const keys = [
      'novo',
      'em_atendimento',
      'aguardando_solicitante',
      'em_aprovacao',
      'concluido'
    ];
    const colors = {
      novo: '#0ea5e9',
      em_atendimento: '#4f46e5',
      aguardando_solicitante: '#f59e0b',
      em_aprovacao: '#9333ea',
      concluido: '#10b981'
    };
    return keys.map((k) => ({
      key: k,
      label: STATUS_META[k].shortLabel,
      color: colors[k],
      count: filteredTickets.filter((t) => t.status === k).length
    }));
  }, [filteredTickets]);

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

  // Cálculo dos arcos do Gráfico Donut SVG
  const totalStatusCount = statusDistribution.reduce((s, d) => s + d.count, 0);
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let cumulativeDash = 0;

  // Escala do Gráfico de Evolução Temporal SVG
  const maxSeriesVal = Math.max(
    1,
    ...timelineSeries.map((p) => Math.max(p.opened, p.closed))
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho & Filtros Executivos */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
            Dashboards & Inteligência Operacional (BI)
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Indicadores de vazão, SLA líquido, gargalos SAC e satisfação CSAT em
            tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
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
            {DEPARTMENTS.map((d) => (
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

      {/* 5 KPIs EXECUTIVOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Demandas & Vazão
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {kpis.total}
            </span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full tabular-nums">
              {kpis.concludedCount} concluídas ({kpis.throughputRate}%)
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Conformidade SLA
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-indigo-600 tabular-nums">
              {kpis.slaCompliance}%
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {kpis.withinSlaCount}/{kpis.total} no prazo
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            TMA / TMR Líquido
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {kpis.avgTmaMs > 0 ? formatDuration(kpis.avgTmaMs) : '—'}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              1ª resp: {kpis.avgTmrMs > 0 ? formatDuration(kpis.avgTmrMs) : '—'}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Gargalos SAC
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-amber-600 tabular-nums">
              {kpis.sacCount}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              Espera: {kpis.avgSacWaitMs > 0 ? formatDuration(kpis.avgSacWaitMs) : '0m'}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Satisfação CSAT
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 flex items-center gap-1 tabular-nums">
              {kpis.avgCsat}
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {kpis.ratedCount} avaliações
            </span>
          </div>
        </div>
      </div>

      {/* GRÁFICOS SVG INTERATIVOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico 1: Evolução Temporal */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Evolução Temporal de Demandas
              </h3>
              <p className="text-xs text-slate-500">
                Comparativo diário entre demandas abertas e entregas concluídas
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-indigo-600">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                Abertas
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Concluídas
              </span>
            </div>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="h-52 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-4">
              <FileText className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">
                Nenhuma demanda registrada neste período
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Assim que a primeira demanda (#MKT-1001) for aberta, o gráfico
                será plotado automaticamente.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <svg viewBox="0 0 600 190" className="w-full h-52">
                {[0, 0.5, 1].map((step, i) => {
                  const y = 150 - step * 120;
                  return (
                    <line
                      key={i}
                      x1="36"
                      y1={y}
                      x2="584"
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="4 4"
                    />
                  );
                })}

                {timelineSeries.map((pt, idx) => {
                  const slotWidth = 540 / timelineSeries.length;
                  const xCenter = 40 + idx * slotWidth + slotWidth / 2;
                  const openH = (pt.opened / maxSeriesVal) * 120;
                  const closeH = (pt.closed / maxSeriesVal) * 120;

                  return (
                    <g key={pt.label}>
                      <rect
                        x={xCenter - 12}
                        y={150 - openH}
                        width="10"
                        height={Math.max(2, openH)}
                        rx="3"
                        fill="#4f46e5"
                      >
                        <title>{`${pt.label}: ${pt.opened} aberta(s)`}</title>
                      </rect>
                      <rect
                        x={xCenter + 2}
                        y={150 - closeH}
                        width="10"
                        height={Math.max(2, closeH)}
                        rx="3"
                        fill="#10b981"
                      >
                        <title>{`${pt.label}: ${pt.closed} concluída(s)`}</title>
                      </rect>
                      <text
                        x={xCenter}
                        y="172"
                        textAnchor="middle"
                        fontSize="10"
                        fill="#64748b"
                      >
                        {pt.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Gráfico 2: Donut por Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Distribuição por Status
            </h3>
            <p className="text-xs text-slate-500">
              Visão proporcional da carteira filtrada
            </p>
          </div>

          {totalStatusCount === 0 ? (
            <div className="h-52 my-auto rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-4 mt-4">
              <Clock className="w-7 h-7 text-slate-300 mb-1.5" />
              <p className="text-xs font-semibold text-slate-600">
                Carteira vazia no filtro atual
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center my-3">
              <svg viewBox="0 0 120 120" className="w-36 h-36 -rotate-90">
                {statusDistribution.map((seg) => {
                  if (seg.count === 0) return null;
                  const dash =
                    (seg.count / totalStatusCount) * donutCircumference;
                  const offset = -cumulativeDash;
                  cumulativeDash += dash;
                  return (
                    <circle
                      key={seg.key}
                      cx="60"
                      cy="60"
                      r={donutRadius}
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="16"
                      strokeDasharray={`${dash} ${donutCircumference}`}
                      strokeDashoffset={offset}
                    >
                      <title>{`${seg.label}: ${seg.count}`}</title>
                    </circle>
                  );
                })}
              </svg>
              <div className="w-full space-y-1.5 mt-2">
                {statusDistribution.map((seg) => (
                  <div
                    key={seg.key}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2 text-slate-700 font-medium">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      {seg.label}
                    </span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {seg.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

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
      users.filter((u) => u.role === 'admin' && u.active !== false).length,
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
      targetUser.role === 'admin' &&
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
    if (!nextActive && targetUser.role === 'admin' && activeAdminsCount <= 1) {
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
        ? `Deseja restaurar o acesso de ${targetUser.name} ao MktDesk?`
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
      {/* Banner de Códigos de Convite Rápidos */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            Equipe & Controle de Acessos
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Gerencie perfis, bloqueios ou compartilhe os códigos de convite para
            autocadastro da equipe.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleCopyCode(settings.techInviteCode, 'Técnico')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
          >
            {copiedCode === 'Técnico' ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            Convite Técnico: <code>{settings.techInviteCode}</code>
          </button>

          <button
            type="button"
            onClick={() => handleCopyCode(settings.adminInviteCode, 'Admin')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold transition"
          >
            {copiedCode === 'Admin' ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            Convite Admin: <code>{settings.adminInviteCode}</code>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
          >
            <UserPlus className="w-4 h-4" />
            Cadastrar Usuário
          </button>
        </div>
      </div>

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
                    onChange={(e) => handleRoleChange(u, e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="solicitante">Solicitante</option>
                    <option value="tecnico">Técnico do Marketing</option>
                    <option value="admin">Admin do Marketing</option>
                  </select>

                  <button
                    type="button"
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

      {/* Modal de Cadastro Direto */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-w-lg sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="font-extrabold text-slate-900">
                Cadastrar Novo Usuário
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateDirectUser}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              {formErr && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {formErr}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Departamento
                  </label>
                  <select
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Cargo *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Perfil
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="tecnico">Técnico do Marketing</option>
                    <option value="solicitante">Solicitante</option>
                    <option value="admin">Admin do Marketing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Senha Inicial *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  Salvar Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  emailLogs,
  users,
  tickets,
  notifications,
  canInstallPWA,
  isStandalonePWA,
  onInstallPWA,
  onSaveSettings,
  onTestPopupAndSound,
  onTestWebhook,
  onRestoreBackup,
  onRequestConfirm
}) {
  const [draft, setDraft] = useState(settings);
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
    const next = {id: editingServiceId || `cat-${crypto.randomUUID()}`, name, description: serviceDescription.trim(), slaHours: hours, active: true};
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
    const value = {id: editingStageId || `stage-${crypto.randomUUID()}`, name, baseStatus: stageBase, active: true};
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
      emailLogs,
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
            'O arquivo selecionado não é um backup JSON válido do MktDesk.',
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
      {/* Segurança, Convites & Domínio Corporativo */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Governança, Convites & Integrações
            </h2>
            <p className="text-xs text-slate-500">
              Configure códigos de convite, restrição opcional de domínio e
              disparos automáticos via Webhook.
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Código Convite • Técnico
            </label>
            <input
              type="text"
              value={draft.techInviteCode}
              onChange={(e) =>
                setDraft({ ...draft, techInviteCode: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Código Convite • Admin
            </label>
            <input
              type="text"
              value={draft.adminInviteCode}
              onChange={(e) =>
                setDraft({ ...draft, adminInviteCode: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Domínios Corporativos (Opcional)
            </label>
            <input
              type="text"
              value={draft.allowedDomains}
              onChange={(e) =>
                setDraft({ ...draft, allowedDomains: e.target.value })
              }
              placeholder="Vazio = qualquer domínio (ex: @empresa.com.br)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>

        {/* Webhook de E-mail Real (n8n / Make / Zapier / API) */}
        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              URL do Webhook para Disparo Real de E-mails (n8n / Make / Zapier /
              API)
            </label>
            <input
              type="url"
              value={draft.webhookUrl}
              onChange={(e) =>
                setDraft({ ...draft, webhookUrl: e.target.value })
              }
              placeholder="https://seu-n8n.empresa.com/webhook/mktdesk-email"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Header Secret (X-MktDesk-Secret)
            </label>
            <input
              type="text"
              value={draft.webhookSecret || ''}
              onChange={(e) =>
                setDraft({ ...draft, webhookSecret: e.target.value })
              }
              placeholder="Opcional"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
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

          <button
            type="button"
            onClick={onTestWebhook}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
          >
            <Webhook className="w-4 h-4" />
            Testar Disparo Webhook
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

      {/* Catálogo editável: salvo no registro app_settings, protegido por RLS de admin. */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Gestão de Serviços e SLAs</h3>
          <p className="text-xs text-slate-500">Cadastre serviços e os prazos em horas corridas. Mudanças de prazo afetam novos chamados, não os anteriores.</p>
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
          <label className="text-xs font-semibold">Prazo (horas corridas)<input required min="1" max="8760" type="number" className="block mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={serviceHours} onChange={e=>setServiceHours(e.target.value)}/></label>
          <div className="flex gap-2"><button type="submit" className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-bold">{editingServiceId ? 'Atualizar' : 'Adicionar serviço'}</button>{editingServiceId && <button type="button" onClick={()=>{setEditingServiceId(null);setServiceName('');setServiceDescription('');setServiceHours('24')}} className="text-xs">Cancelar</button>}</div>
        </form>
        <p className="text-xs text-amber-700 font-semibold">Para gravar as alterações no Supabase, clique em “Salvar Configurações” no início desta página.</p>
      </section>
      <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
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

      {/* Caixa de Saída Real de E-mails & Webhooks */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Caixa de Saída de E-mails & Disparos Webhook
            </h3>
            <p className="text-xs text-slate-500">
              Histórico real de notificações automáticas disparadas pelo sistema.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold tabular-nums">
            {emailLogs.length} registros
          </span>
        </div>

        {emailLogs.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center">
            <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">
              Nenhum disparo registrado ainda
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Os alertas de abertura, pausa SAC e entrega aparecerão aqui em
              tempo real.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {emailLogs.map((log) => (
              <div key={log.id} className="py-3 flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-xs text-slate-900">
                    {log.subject}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    {log.deliveryStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{log.message}</p>
                <div className="text-[11px] text-slate-400">
                  Para: {log.recipients.join(', ')} •{' '}
                  {formatDateTime(log.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
          t.assignedTechId === currentUser.id && t.status !== 'concluido'
      );
    }
    if (techQueue === 'geral') {
      return tickets.filter(
        (t) => !t.assignedTechId && t.status !== 'concluido'
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
          u.active !== false && (u.role === 'tecnico' || u.role === 'admin')
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
    'concluido'
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
              placeholder="Protocolo (#MKT-1001), título ou área..."
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
              ? 'O sistema está limpo e pronto para produção. Abra a primeira demanda para gerar o protocolo #MKT-1001.'
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
                  {currentUser.role === 'admin' ? (
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

  const filtered = useMemo(() => {
    if (filter === 'abertos') {
      return myTickets.filter((t) => t.status !== 'concluido');
    }
    if (filter === 'sac') {
      return myTickets.filter((t) => t.status === 'aguardando_solicitante');
    }
    if (filter === 'aprovacao') {
      return myTickets.filter((t) => t.status === 'em_aprovacao');
    }
    if (filter === 'concluidos') {
      return myTickets.filter((t) => t.status === 'concluido');
    }
    return myTickets;
  }, [myTickets, filter]);

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
            count: myTickets.filter((t) => t.status !== 'concluido').length
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
  categories,
  nextProtocol,
  onClose,
  onSubmit
}) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [priority, setPriority] = useState('normal');
  const [department, setDepartment] = useState(
    currentUser.department || 'Comercial & Vendas'
  );
  const [objective, setObjective] = useState('');
  const [description, setDescription] = useState('');
  const [referenceLink, setReferenceLink] = useState('');

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || categories[0],
    [categories, categoryId]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    onSubmit({
      title,
      categoryId,
      priority,
      department,
      objective,
      description,
      referenceLink
    });
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
                    {c.name} ({c.slaHours}h)
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
                  SLA Padrão da Categoria: {selectedCategory.slaHours} horas
                </div>
                <div className="text-[11px] text-indigo-800 mt-0.5">
                  {selectedCategory.description}
                </div>
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
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {DEPARTMENTS.map((d) => (
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Briefing Detalhado & Especificações *
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva textos, formatos, dimensões, objetivos e informações essenciais para execução sem retrabalho..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            Abrir Demanda ({nextProtocol})
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
  ticket,
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
    currentUser.role === 'admin' || currentUser.role === 'tecnico';
  const isRequester = currentUser.id === ticket.requesterId;

  const sla = calculateTicketSLA(ticket, nowTick);
  const stage = customStages.find(x => x.id === ticket.customStageId);
  const st = STATUS_META[ticket.status] || STATUS_META.novo;

  // Estados de interação
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);

  // Modo de ação operacional: 'chat' | 'sac_pause' | 'deliver' | 'adjust'
  const [actionMode, setActionMode] = useState('chat');
  const [sacQuestion, setSacQuestion] = useState('');
  const [sacUnlockReply, setSacUnlockReply] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryLink, setDeliveryLink] = useState(ticket.deliveryLink || '');
  const [csatRating, setCsatRating] = useState(5);
  const [csatComment, setCsatComment] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');

  const marketingStaff = useMemo(
    () =>
      users.filter(
        (u) =>
          u.active !== false && (u.role === 'tecnico' || u.role === 'admin')
      ),
    [users]
  );

  // Filtra notas internas para que NUNCA apareçam ao solicitante
  const visibleTimeline = useMemo(
    () =>
      ticket.timeline.filter(
        (item) => isStaff || item.type !== 'internal'
      ),
    [ticket.timeline, isStaff]
  );

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    await onPostMessage({
      content: replyText,
      isInternal: isStaff && isInternalNote
    });
    setReplyText('');
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
                  Prazo: {ticket.slaHours}h
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

          {isStaff && ticket.status !== 'concluido' && (
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
          {isStaff && ticket.status !== 'concluido' && (
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
                  Enviar Entrega para Aprovação
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
                    onClick={() => {
                      if (!sacQuestion.trim()) return;
                      onPauseForSAC(sacQuestion);
                      setSacQuestion('');
                      setActionMode('chat');
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
                    Enviar Entrega Final para Validação do Solicitante
                  </div>
                  <input
                    type="url"
                    value={deliveryLink}
                    onChange={(e) => setDeliveryLink(e.target.value)}
                    placeholder="Link dos arquivos finais (Drive, Figma, Canva, WeTransfer...)"
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
                    onClick={() => {
                      if (!deliveryNotes.trim()) return;
                      onSendDelivery({ deliveryNotes, deliveryLink });
                      setDeliveryNotes('');
                      setActionMode('chat');
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    Enviar para Aprovação
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
                      {isDelivery && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-200 text-purple-950 text-[10px] font-bold">
                          Entrega Enviada
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
        <form
          onSubmit={handleSendChat}
          className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-white shrink-0 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5 space-y-2"
        >
          {isStaff && (
            <div className="flex items-center gap-2">
              <button
                type="button"
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

          <div className="flex items-center gap-2">
            <input
              type="text"
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
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs transition ${
                isStaff && isInternalNote
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </div>
        </form>
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
            Instalar MktDesk na Tela de Início
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
          Para instalar o <strong>MktDesk</strong> como aplicativo no seu iPhone,
          iPad ou navegador:
        </p>

        <ol className="space-y-3 text-xs text-slate-800">
          <li className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <Share className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>
              1. Toque no ícone de <strong>Compartilhar</strong> na barra do
              Safari (ou menu do navegador).
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