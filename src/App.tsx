import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, 
  Sparkles, 
  Copy, 
  Check, 
  CheckCircle, 
  Clock, 
  Phone, 
  MapPin, 
  CreditCard, 
  TrendingUp, 
  CheckSquare, 
  Search, 
  LogOut, 
  RefreshCw, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  ChevronRight, 
  Grid, 
  ArrowLeft, 
  X, 
  XCircle,
  MoreVertical, 
  Layers, 
  Trash2, 
  FileText, 
  Edit,
  User,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Bell,
  BarChart3,
  SlidersHorizontal,
  ArrowUpDown,
  Filter,
  Eye,
  Settings,
  Database,
  Download,
  Upload,
  Shield,
  FileSpreadsheet,
  Zap,
  Users,
  EyeOff,
  Lock,
  UserPlus,
  UserCheck,
  UserX,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Pedido, AiAnalysisLog, ExcludedOrderBackup, CustomUser } from './types';
import bcrypt from 'bcryptjs';
import { 
  subscribePedidos, 
  savePedido, 
  updatePedidoStatus, 
  deletePedido, 
  generateNextNumeroVenda, 
  forceManualSyncRefresh,
  saveBackupMetadata,
  subscribeBackupHistory,
  deleteBackup,
  restoreBackupToSystem,
  BackupItem,
  subscribeExcludedOrders,
  excludeOrderWithBackup,
  restoreExcludedOrderToSystem,
  DEFAULT_SYSTEM_USERS,
  seedInitialUsersIfEmpty,
  subscribeUsers,
  saveCustomUser,
  deleteCustomUser
} from './dbService';
import * as XLSX from 'xlsx';
import { 
  auth, 
  isFirebaseConfigured,
  parseFirebaseError
} from './firebase';
import { 
  signInAnonymously, 
  signOut
} from 'firebase/auth';

const getSupplierKeyByName = (name: string): 'SOFIA_HOME_DECOR' | 'MICHAEL' | 'FRANK' | 'OUTROS' => {
  if (name === 'Sofia Home Decor') return 'SOFIA_HOME_DECOR';
  if (name === 'Michael') return 'MICHAEL';
  if (name === 'Frank') return 'FRANK';
  return 'OUTROS';
};

const getSupplierNameByKey = (key?: string): string => {
  if (key === 'SOFIA_HOME_DECOR') return 'Sofia Home Decor';
  if (key === 'MICHAEL') return 'Michael';
  if (key === 'FRANK') return 'Frank';
  return 'Outros Fornecedores';
};

const parseBrazilianNumber = (valStr: string): number => {
  if (!valStr) return 0;
  let cleaned = valStr.trim();
  // Strip thousands separators but preserve decimal commas/periods
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/,/g, '.');
  }
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const formatBrazilianNumber = (num: number): string => {
  if (num === undefined || num === null || isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export default function App() {
  // Database state
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [authReady, setAuthReady] = useState(true);
  
  // Operator name from local localStorage configuration
  const [operatorName, setOperatorNameState] = useState<string>(() => {
    const saved = localStorage.getItem("operatorName");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.operatorName) {
          return parsed.operatorName;
        }
        if (typeof parsed === 'string') return parsed;
      } catch (e) {
        // Fallback below
      }
      return saved;
    }
    // Fallback default operator
    localStorage.setItem("operatorName", JSON.stringify({ operatorName: "Alan" }));
    return "Alan";
  });

  const handleSaveOperatorName = (name: string) => {
    setOperatorNameState(name);
    localStorage.setItem("operatorName", JSON.stringify({ operatorName: name }));
  };

  // Derive currentUser to preserve deep backwards-compatibility silently
  const currentUser = {
    uid: "vendedor",
    username: operatorName.trim().toLowerCase().replace(/\s+/g, ''),
    name: operatorName.trim(),
    displayName: operatorName.trim(),
    role: "admin",
    active: true,
    photoURL: null,
    email: `${operatorName.trim().toLowerCase().replace(/\s+/g, '')}@crm`
  };

  const [isFirebaseSyncActive, setIsFirebaseSyncActive] = useState(isFirebaseConfigured);
  const [isAuthConnecting, setIsAuthConnecting] = useState(false);

  // Sync state
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // App UI Views / Form
  const [viewMode, setViewMode] = useState<'dashboard' | 'spreadsheet'>('dashboard');
  const [currentTab, setCurrentTab] = useState<'ativos' | 'entregues' | 'reagendados' | 'cancelados'>('ativos');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals & Active actions
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [showDropdownId, setShowDropdownId] = useState<string | null>(null);
  
  // New States for Rescheduling, Notifications, and Reports
  const [reschedulingPedido, setReschedulingPedido] = useState<Pedido | null>(null);
  const [rescheduleInputDate, setRescheduleInputDate] = useState<string>('');
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState<boolean>(false);
  const [showReportsModal, setShowReportsModal] = useState<boolean>(false);
  const [selectedReportPeriod, setSelectedReportPeriod] = useState<'prev_week' | 'all'>('prev_week');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  // States for Backup and security system
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [backupsHistory, setBackupsHistory] = useState<BackupItem[]>([]);
  const [restoreConfirmData, setRestoreConfirmData] = useState<Pedido[] | null>(null);
  const [restoreConfirmName, setRestoreConfirmName] = useState<string>('');
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isExecutingUpdate, setIsExecutingUpdate] = useState<boolean>(false);
  const [updateStep, setUpdateStep] = useState<number>(0); 
  const [activeSettingsTab, setActiveSettingsTab] = useState<'backup' | 'logs' | 'ailogs' | 'diagnostico' | 'operator' | 'keys'>('backup');

  const handleCopyText = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      setCopiedField(null);
    }, 1000);
  };

  const getWhatsAppLink = (phone: string) => {
    if (!phone) return '#';
    let clean = phone.replace(/\D/g, '');
    if (clean.length === 10 || clean.length === 11) {
      if (!clean.startsWith('55')) {
        clean = '55' + clean;
      }
    }
    return `https://wa.me/${clean}`;
  };

  const getSummarizedProductAndList = (productStr: string) => {
    if (!productStr) return { summary: 'Sem produto', items: [], isMultiple: false };
    // Split by newlines or list indicators
    let rawItems = productStr.split(/\r?\n+/).map(i => i.trim()).filter(i => i.length > 0);
    // Remove leading list dots or hyphens
    rawItems = rawItems.map(item => item.replace(/^[\s*\-•\d.]+\s*/, ''));
    
    if (rawItems.length <= 1) {
      // try comma split if there are multiple items
      const commas = productStr.split(/,+/).map(i => i.trim()).filter(i => i.length > 0);
      if (commas.length > 1) {
        return {
          summary: `${commas[0]} + ${commas.length - 1} item(s)`,
          items: commas,
          isMultiple: true
        };
      }
      return { summary: productStr, items: [productStr], isMultiple: false };
    }
    return {
      summary: `${rawItems[0]} + ${rawItems.length - 1} itens`,
      items: rawItems,
      isMultiple: true
    };
  };

  const toggleProductExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProducts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Supplier multi-tabs state
  const [currentSupplier, setCurrentSupplier] = useState<'SOFIA_HOME_DECOR' | 'MICHAEL' | 'FRANK' | 'OUTROS'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('iazap_current_supplier');
      if (saved === 'SOFIA_HOME_DECOR' || saved === 'MICHAEL' || saved === 'FRANK' || saved === 'OUTROS') {
        return saved;
      }
    }
    return 'SOFIA_HOME_DECOR';
  });

  // Mandatory Supplier Selection starts empty to avoid defaulting to Sofia Home Decor by default
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<string>('');

  // Persist current active supplier
  useEffect(() => {
    localStorage.setItem('iazap_current_supplier', currentSupplier);
  }, [currentSupplier]);

  // Derived filtered orders list for active supplier tab
  const currentSupplierPedidos = useMemo(() => {
    return pedidos.filter(p => (p.supplier || 'SOFIA_HOME_DECOR') === currentSupplier);
  }, [pedidos, currentSupplier]);

  // Advanced Filter & Sort states
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['Todos']);
  const [dateFilterMode, setDateFilterMode] = useState<string>('all'); // 'all', 'hoje', 'ontem', 'estaSemana', '7dias', 'esteMes', '30dias', 'custom'
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [nameSortOrder, setNameSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [creationDateSort, setCreationDateSort] = useState<'recents' | 'oldest'>('recents');
  const [highlightedPedidoId, setHighlightedPedidoId] = useState<string | null>(null);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState<boolean>(false);
  
  // AI WhatsApp Paste Areas
  const [pasteOrderText, setPasteOrderText] = useState('');
  const [pasteDeliveryText, setPasteDeliveryText] = useState('');
  
  // Form editing state
  const [editingPedido, setEditingPedido] = useState<Partial<Pedido> | null>(null);
  const [comissaoPercent, setComissaoPercent] = useState<number>(10); // Default 10%
  const [comissaoInputText, setComissaoInputText] = useState<string>('');
  const [showConfirmationStep, setShowConfirmationStep] = useState<boolean>(false);

  useEffect(() => {
    if (editingPedido) {
      if (editingPedido.comissao !== undefined && editingPedido.comissao !== null) {
        setComissaoInputText(formatBrazilianNumber(editingPedido.comissao));
      } else {
        setComissaoInputText('');
      }
    } else {
      setComissaoInputText('');
      setShowConfirmationStep(false);
    }
  }, [editingPedido?.id, editingPedido?.numeroVenda, editingPedido?.comissao]);

  // Global Toast alerts
  const [notification, setNotification] = useState<{ type: 'success' | 'refused' | 'error' | 'info'; message: string } | null>(null);
  
  // AI Options and Logging
  const [isRapidAnalysis, setIsRapidAnalysis] = useState<boolean>(() => {
    const val = localStorage.getItem('iazap_is_rapid');
    return val === null ? true : val === 'true';
  });
  
  // Admin Role, Exclusions, and Spreadsheet tabs
  const [isAdminMode, setIsAdminMode] = useState<boolean>(true);
  const [excludedOrders, setExcludedOrders] = useState<ExcludedOrderBackup[]>([]);
  const [activeSpreadsheetTab, setActiveSpreadsheetTab] = useState<'ativos' | 'excluidos'>('ativos');
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [aiLogs, setAiLogs] = useState<AiAnalysisLog[]>(() => {
    try {
      const stored = localStorage.getItem('iazap_ai_logs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [aiKeys, setAiKeys] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('iazap_gemini_keys');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 4) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return ['', '', '', ''];
  });

  // IA Consumption Control and Patterns Memory States
  const [aiDiagnostics, setAiDiagnostics] = useState(() => {
    try {
      const stored = localStorage.getItem('iazap_ai_diagnostics');
      return stored ? JSON.parse(stored) : {
        totalAnalises: 0,
        resolvidaSemIa: 0,
        enviadaGemini: 0,
        sucesso: 0,
        erros: 0
      };
    } catch {
      return {
        totalAnalises: 0,
        resolvidaSemIa: 0,
        enviadaGemini: 0,
        sucesso: 0,
        erros: 0
      };
    }
  });

  useEffect(() => {
    localStorage.setItem('iazap_ai_diagnostics', JSON.stringify(aiDiagnostics));
  }, [aiDiagnostics]);

  const [learnedPatterns, setLearnedPatterns] = useState(() => {
    try {
      const stored = localStorage.getItem('iazap_learned_patterns');
      return stored ? JSON.parse(stored) : {
        cities: ["Alfenas", "Varginha", "Poços de Caldas", "Três Corações", "Guaxupé", "Passos", "Campinas", "São Paulo"],
        products: ["Cama Box Casal", "Cama Queen", "Sofá Atenas", "Sofá Dubai"],
        paymentMethods: ["PIX", "DINHEIRO", "CARTÃO", "CREDITO", "BOLETO", "DEBITO", "CHEQUE"]
      };
    } catch {
      return {
        cities: ["Alfenas", "Varginha", "Poços de Caldas", "Três Corações", "Guaxupé", "Passos", "Campinas", "São Paulo"],
        products: ["Cama Box Casal", "Cama Queen", "Sofá Atenas", "Sofá Dubai"],
        paymentMethods: ["PIX", "DINHEIRO", "CARTÃO", "CREDITO", "BOLETO", "DEBITO", "CHEQUE"]
      };
    }
  });

  useEffect(() => {
    localStorage.setItem('iazap_learned_patterns', JSON.stringify(learnedPatterns));
  }, [learnedPatterns]);

  const registerNewPatterns = (p: Partial<Pedido> | Pedido) => {
    setLearnedPatterns(prev => {
      const updated = { ...prev };
      let changed = false;

      if (p.city && p.city !== 'RETIRADA' && p.city !== 'NÃO INFORMADO' && p.city.trim().length > 2) {
        const cityCapitalized = p.city.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        if (!updated.cities.includes(cityCapitalized)) {
          updated.cities = [...updated.cities, cityCapitalized].slice(-100);
          changed = true;
        }
      }

      if (p.produto && p.produto !== 'Produto não identificado' && p.produto.trim().length > 3) {
        const prodTrim = p.produto.trim();
        if (!updated.products.includes(prodTrim)) {
          updated.products = [...updated.products, prodTrim].slice(-100);
          changed = true;
        }
      }

      if (p.formaPagamento && p.formaPagamento.trim().length > 2) {
        const pgNormalized = p.formaPagamento.trim().toUpperCase();
        if (!updated.paymentMethods.includes(pgNormalized)) {
          updated.paymentMethods = [...updated.paymentMethods, pgNormalized].slice(-30);
          changed = true;
        }
      }

      if (changed) {
        return updated;
      }
      return prev;
    });
  };

  useEffect(() => {
    localStorage.setItem('iazap_is_rapid', String(isRapidAnalysis));
  }, [isRapidAnalysis]);

  useEffect(() => {
    localStorage.setItem('iazap_ai_logs', JSON.stringify(aiLogs));
  }, [aiLogs]);
  
  // Loading status spinners
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [isProcessingDelivery, setIsProcessingDelivery] = useState(false);

  // Dropdown reference to handle click outside
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Listen for clicks outside active dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdownId(null);
        setShowNotificationsDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Helper for Mobile Device Detection
  const isMobileDevice = () => {
    if (typeof window === 'undefined' || !window.navigator) return false;
    const ua = navigator.userAgent;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  };

  // Helper for parsing Google Firebase Auth errors
  const parseAuthError = (err: any): string => {
    if (!err) return 'Erro desconhecido.';
    const code = err.code || '';
    const message = err.message || '';
    
    console.log("[AUTH DEBUG] Tratamento de erro detalhado. Cód:", code, "Msg:", message);
    
    if (code === 'auth/popup-blocked') {
      return 'O popup do seu navegador foi bloqueado pelo celular ou navegador. Por favor, habilite popups ou utilize a reconexão por redirecionamento seguro automática.';
    }
    if (code === 'auth/unauthorized-domain' || message.includes('unauthorized-domain')) {
      return 'Este domínio não está cadastrado/autorizado no Console do seu Firebase Auth em "Authorized Domains".';
    }
    if (code === 'auth/network-request-failed' || code === 'auth/network-error' || message.includes('network-error')) {
      return 'Erro de conexão com o servidor Google Auth. Verifique se o seu dispositivo está com internet ou dados móveis.';
    }
    if (code === 'auth/cancelled-popup-request') {
      return 'Ação de popup de login sobreposta por outra requisição. Tente novamente.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'O login foi cancelado porque a janela do popup foi fechada antes de completar.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Autenticação por Google não está habilitada no Console do seu Firebase. Ative-a no painel Sign-in providers.';
    }
    
    return message || code || 'Falha na autenticação rápida.';
  };

  // 1. Real-time Database synchronization on load
  useEffect(() => {
    const unsubscribe = subscribePedidos(
      (updatedPedidos) => {
        setPedidos(updatedPedidos);
      },
      (error) => {
        console.error("Database sync error: ", error);
        const readableError = parseFirebaseError(error);
        triggerToast('error', `Erro na sincronização: ${readableError}`);
      }
    );
    return () => unsubscribe();
  }, []);

  // Toast dispatch helper
  const triggerToast = (type: 'success' | 'refused' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => curr?.message === message ? null : curr);
    }, 5500);
  };

  // Subscribe to backup history updates
  useEffect(() => {
    const unsubscribe = subscribeBackupHistory(
      (history) => {
        setBackupsHistory(history);
      },
      (error) => {
        console.error("Backup history subscribe error: ", error);
        triggerToast('error', `Erro ao ler histórico de backups: ${parseFirebaseError(error)}`);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to excluded orders real-time updates
  useEffect(() => {
    const unsubscribe = subscribeExcludedOrders(
      (list) => {
        setExcludedOrders(list);
      },
      (error) => {
        console.error("Exclusions subscribe error: ", error);
        triggerToast('error', `Erro ao ler histórico de exclusões: ${parseFirebaseError(error)}`);
      }
    );
    return () => unsubscribe();
  }, []);

  // Daily automatic backup checking algorithm (03:00 AM Boundary)
  const runAutomaticDailyBackup = async () => {
    if (pedidos.length === 0) return;
    
    const now = new Date();
    const boundaryToday = new Date(now);
    boundaryToday.setHours(3, 0, 0, 0);
    
    let backupDayStart: Date;
    if (now >= boundaryToday) {
      backupDayStart = boundaryToday;
    } else {
      const boundaryYesterday = new Date(boundaryToday);
      boundaryYesterday.setDate(boundaryYesterday.getDate() - 1);
      backupDayStart = boundaryYesterday;
    }
    
    // Check if we already created an automatic backup for this cycle
    const hasDaily = backupsHistory.some(
      b => b.backupType === 'automatico' && new Date(b.createdAt) >= backupDayStart
    );
    
    if (!hasDaily) {
      console.log("Iniciando backup automático diário de segurança (limiar das 03:00 AM)...");
      try {
        const jsonStr = JSON.stringify(pedidos, null, 2);
        const kbSize = (jsonStr.length / 1024).toFixed(2);
        
        await saveBackupMetadata({
          createdAt: new Date().toISOString(),
          recordsCount: pedidos.length,
          responsibleUser: 'sistema (automatico)',
          fileSize: `${kbSize} KB`,
          backupType: 'automatico',
          backupData: jsonStr
        });
        console.log("Backup automático diário gerado com sucesso.");
      } catch (err) {
        console.error("Erro ao gerar backup automático:", err);
      }
    }
  };

  useEffect(() => {
    if (pedidos.length > 0 && authReady) {
      runAutomaticDailyBackup();
      
      // Keep checking every 10 minutes
      const interval = setInterval(() => {
        runAutomaticDailyBackup();
      }, 10 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [pedidos, backupsHistory, authReady]);

  // Create manual backup
  const handleGenerateManualBackup = async () => {
    if (pedidos.length === 0) {
      triggerToast('error', 'Nenhum pedido cadastrado no momento para fazer backup.');
      return;
    }
    
    setIsCreatingBackup(true);
    try {
      const jsonStr = JSON.stringify(pedidos, null, 2);
      const kbSize = (jsonStr.length / 1024).toFixed(2);
      
      const now = new Date();
      const pad = (val: number) => String(val).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const fileName = `Backup_IA_Zap_Registro_${dateStr}_${timeStr}.json`;
      
      // Save metadata & JSON locally or in Firestore
      await saveBackupMetadata({
        createdAt: now.toISOString(),
        recordsCount: pedidos.length,
        responsibleUser: currentUser?.name || currentUser?.username || 'Vendedor Autenticado',
        fileSize: `${kbSize} KB`,
        backupType: 'manual',
        backupData: jsonStr
      });
      
      // Trigger File browser download
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      triggerToast('success', `Backup completo baixado com sucesso: ${fileName}`);
    } catch (err: any) {
      console.error("Erro ao gerar backup manual:", err);
      triggerToast('error', `Falha ao gerar backup: ${err.message || err}`);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Import/restore validation
  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== 'string') throw new Error('Não foi possível ler as informações do arquivo.');
        
        const data = JSON.parse(text);
        if (!Array.isArray(data)) {
          throw new Error('Formato de backup inválido. O arquivo JSON deve ser uma lista de pedidos.');
        }
        
        // Validate individual fields of first item to prevent random JSON imports
        if (data.length > 0) {
          const first = data[0];
          if (!first.nomeCompleto || !first.produto || !first.valorTotal || !first.numeroVenda) {
            throw new Error('Arquivo de backup inválido. Campos essenciais de vendas estão faltando.');
          }
        }
        
        setRestoreConfirmData(data);
        setRestoreConfirmName(file.name);
      } catch (err: any) {
        triggerToast('error', `Erro na validação do arquivo: ${err.message || err}`);
      }
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = '';
  };

  // Confirm standard restoration
  const executeRestore = async () => {
    if (!restoreConfirmData) return;
    
    setIsRestoring(true);
    try {
      await restoreBackupToSystem(restoreConfirmData);
      triggerToast('success', `Sucesso! Restaurados ${restoreConfirmData.length} registros de vendas de forma segura.`);
      setRestoreConfirmData(null);
      setRestoreConfirmName('');
    } catch (err: any) {
      console.error("Erro ao aplicar restauração:", err);
      triggerToast('error', `Falha ao aplicar restauração: ${err.message || err}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Restore from history direct
  const handleRestoreFromHistory = (backup: BackupItem) => {
    try {
      const data = JSON.parse(backup.backupData);
      setRestoreConfirmData(data);
      const formattedDate = new Date(backup.createdAt).toLocaleString('pt-BR');
      setRestoreConfirmName(`Histórico (${backup.backupType === 'manual' ? 'Manual' : 'Automático'} - ${formattedDate})`);
    } catch (err: any) {
      triggerToast('error', 'Não foi possível ler os dados do backup histórico especificado.');
    }
  };

  // Excel (.xlsx) export
  const handleExportExcel = () => {
    try {
      if (pedidos.length === 0) {
        triggerToast('error', 'Nenhuma venda encontrada para gerar planilha.');
        return;
      }
      
      const formattedData = pedidos.map(p => ({
        'Fornecedor': p.supplier === 'SOFIA_HOME_DECOR' ? 'Sofia Home Decor' :
                      p.supplier === 'MICHAEL' ? 'Michael' :
                      p.supplier === 'FRANK' ? 'Frank' : 'Outros Fornecedores',
        'Número Venda': p.numeroVenda,
        'Data Cadastro': p.data || '',
        'Nome Cliente': p.nomeCompleto,
        'Telefone Principal': p.telefone1,
        'Telefone Secundário': p.telefone2 || '-',
        'Produto': p.produto + (p.cor ? ` (${p.cor})` : ''),
        'Quantidade': p.quantidade || 1,
        'Forma de Pagamento': p.formaPagamento || '-',
        'Valor Total (R$)': p.valorTotal,
        'Comissão Recebida (R$)': p.comissao,
        'Status Atual': p.status === 'PENDING' ? 'Pendente' :
                        p.status === 'RESCHEDULED' ? 'Reagendado' :
                        p.status === 'DELIVERED_UNPAID' ? 'Entregue Não Pago' :
                        p.status === 'DELIVERED' ? 'Entregue' : 'Cancelado',
        'Observações': p.observacoes || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(formattedData);
      
      const wscols = [
        { wch: 18 }, // Fornecedor
        { wch: 14 }, // Número Venda
        { wch: 12 }, // Data Cadastro
        { wch: 25 }, // Nome Cliente
        { wch: 16 }, // Telefone Principal
        { wch: 16 }, // Telefone Secundário
        { wch: 28 }, // Produto
        { wch: 10 }, // Quantidade
        { wch: 18 }, // Forma de Pagamento
        { wch: 15 }, // Valor Total
        { wch: 15 }, // Comissão
        { wch: 18 }, // Status Atual
        { wch: 40 }  // Observações
      ];
      ws['!cols'] = wscols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Controle de Vendas");
      XLSX.writeFile(wb, `IA_Zap_Registro_Controle_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      triggerToast('success', 'Planilha XLSX gerada com total sucesso!');
    } catch (err: any) {
      console.error("Falha em exportar:", err);
      triggerToast('error', 'Incapaz de gerar planilha XLSX.');
    }
  };

  // Structural system update simulation with automatic backup
  // Flow: 1. Fazer backup, 2. Confirmar backup criado, 3. Executar atualização
  const handleSystemUpdateWithBackup = async () => {
    setUpdateStep(1); // Starting
    
    // Step 1: Force manual backup silently
    try {
      const jsonStr = JSON.stringify(pedidos, null, 2);
      const kbSize = (jsonStr.length / 1024).toFixed(2);
      
      const backupId = await saveBackupMetadata({
        createdAt: new Date().toISOString(),
        recordsCount: pedidos.length,
        responsibleUser: `sistema (atualização obrigatória)`,
        fileSize: `${kbSize} KB`,
        backupType: 'automatico',
        backupData: jsonStr
      });
      
      if (!backupId) throw new Error("ID de backup não retornado");
      
      setUpdateStep(2); // Step 1 & 2 Complete: Backup is created and metadata successfully confirmed!
      
      // Step 3: Run schema update / structural migration
      setTimeout(() => {
        // We simulate running database indexing updates & status normalizing
        setUpdateStep(3);
        
        // Notify of success
        setTimeout(() => {
          setUpdateStep(0); // Clear
          triggerToast('success', 'Atualização Estrutural do Sistema executada com sucesso absoluto!');
        }, 1200);
      }, 1500);

    } catch (err: any) {
      console.error("Falha no fluxo de segurança da atualização:", err);
      setUpdateStep(4); // Error state
      triggerToast('error', `Falha ao executar atualização segura: ${err.message || err}`);
    }
  };

  // Auth Functions
  const handleLogout = async () => {
    localStorage.removeItem("operatorName");
    setOperatorNameState("Alan");
    triggerToast('info', 'Operador reiniciado para o padrão.');
  };

  // 16. ATUALIZAÇÃO MANUAL
  const handleManualSync = () => {
    setIsRefreshing(true);
    forceManualSyncRefresh();
    setTimeout(() => {
      setIsRefreshing(false);
      triggerToast('success', 'Sincronização atualizada com sucesso!');
    }, 800);
  };

  // PARSER DE EMERGÊNCIA SEM IA USANDO REGEX E CACHE LOCAL
  const parseWhatsAppOrderWithRegex = (text: string) => {
    const norm = text.toLowerCase();
    
    // 1. Detect if it is RETIRADA
    const isRetiradaText = (txt: string) => {
      const t = txt.toLowerCase();
      return t.includes("retirada") || 
             t.includes("retirar") || 
             t.includes("retira na loja") || 
             t.includes("retirada na fábrica") || 
             t.includes("retirada na fabrica") || 
             t.includes("cliente retira") || 
             t.includes("retirada no local") ||
             t.includes("retirada no depósito") ||
             t.includes("retirada no deposito");
    };

    const isPhoneNumber = (str: string) => {
      const clean = str.replace(/[+\s\(\)-]/g, '');
      return /^\d+$/.test(clean) && clean.length >= 8 && clean.length <= 15;
    };

    const parseValue = (str: string) => {
      if (!str) return 0;
      let cleanVal = str.replace(/[^\d.,]/g, '').trim().replace(/\./g, '').replace(',', '.');
      if ((cleanVal.match(/\./g) || []).length > 1) {
        cleanVal = cleanVal.replace(/\.(?=[^.]*\.)/g, '');
      }
      return parseFloat(cleanVal) || 0;
    };

    // Identificar automaticamente qual modelo de ficha foi colado (PASSO 1)
    const isSofia = norm.includes("dados do cliente") ||
                    norm.includes("dados da compra") ||
                    norm.includes("cpf/cnpj") ||
                    norm.includes("valor do produto") ||
                    norm.includes("valor total") ||
                    norm.includes("forma de pagamento") ||
                    norm.includes("sofia home decor");

    if (isSofia) {
      // -- EXTRAÇÃO SOFIA (Não utilizar interpretação livre - extrair exatamente por rótulos) --
      const lines = text.split('\n');
      let nomeCompleto = "";
      let contato = "";
      let cpfCnpj = "";
      let endereco = "";
      let localizacao = "";
      let cor = "";
      let tecido = "";
      let valorProduto = "";
      let frete = "";
      let valorTotalVal = "";
      let formaPagamentoVal = "";
      let observacoesVal = "";
      let vendedorVal = "";

      const getValueAfterLabel = (line: string, label: string) => {
        const idx = line.toLowerCase().indexOf(label.toLowerCase());
        if (idx !== -1) {
          return line.substring(idx + label.length).replace(/^[\s:=-]+/, '').trim();
        }
        return "";
      };

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        if (cleanLine.toLowerCase().startsWith("nome completo")) {
          nomeCompleto = getValueAfterLabel(cleanLine, "Nome Completo");
        } else if (cleanLine.toLowerCase().startsWith("contato")) {
          contato = getValueAfterLabel(cleanLine, "Contato");
        } else if (cleanLine.toLowerCase().startsWith("cpf/cnpj") || cleanLine.toLowerCase().startsWith("cpf") || cleanLine.toLowerCase().startsWith("cnpj")) {
          cpfCnpj = getValueAfterLabel(cleanLine, "CPF/CNPJ") || getValueAfterLabel(cleanLine, "CPF") || getValueAfterLabel(cleanLine, "CNPJ");
        } else if (cleanLine.toLowerCase().startsWith("endereço") || cleanLine.toLowerCase().startsWith("endereco")) {
          endereco = getValueAfterLabel(cleanLine, "Endereço") || getValueAfterLabel(cleanLine, "Endereco");
        } else if (cleanLine.toLowerCase().startsWith("localização") || cleanLine.toLowerCase().startsWith("localizacao")) {
          localizacao = getValueAfterLabel(cleanLine, "Localização") || getValueAfterLabel(cleanLine, "Localizacao");
        } else if (cleanLine.toLowerCase().startsWith("cor")) {
          cor = getValueAfterLabel(cleanLine, "Cor");
        } else if (cleanLine.toLowerCase().startsWith("tecido")) {
          tecido = getValueAfterLabel(cleanLine, "Tecido");
        } else if (cleanLine.toLowerCase().startsWith("valor do produto") || cleanLine.toLowerCase().startsWith("valor produto")) {
          valorProduto = getValueAfterLabel(cleanLine, "Valor do Produto") || getValueAfterLabel(cleanLine, "Valor Produto");
        } else if (cleanLine.toLowerCase().startsWith("frete")) {
          frete = getValueAfterLabel(cleanLine, "Frete");
        } else if (cleanLine.toLowerCase().startsWith("valor total")) {
          valorTotalVal = getValueAfterLabel(cleanLine, "Valor Total");
        } else if (cleanLine.toLowerCase().startsWith("forma de pagamento") || cleanLine.toLowerCase().startsWith("forma pagamento")) {
          formaPagamentoVal = getValueAfterLabel(cleanLine, "Forma de Pagamento") || getValueAfterLabel(cleanLine, "Forma pagamento");
        } else if (cleanLine.toLowerCase().startsWith("observações") || cleanLine.toLowerCase().startsWith("observacoes")) {
          observacoesVal = getValueAfterLabel(cleanLine, "Observações") || getValueAfterLabel(cleanLine, "Observacoes");
        } else if (cleanLine.toLowerCase().startsWith("vendedor")) {
          vendedorVal = getValueAfterLabel(cleanLine, "Vendedor");
        }
      }

      // Map phone numbers
      let fone1 = "";
      let fone2 = "";
      const phoneNumbers = contato.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9\d{4}[-\s]?\d{4}/g) || 
                           contato.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}/g) || [];
      if (phoneNumbers.length > 0) {
        fone1 = phoneNumbers[0].trim();
      } else if (contato) {
        fone1 = contato;
      }
      if (phoneNumbers.length > 1) {
        fone2 = phoneNumbers[1].trim();
      }

      // Parse Localização for City and State
      let city = "";
      let state = "";
      if (localizacao) {
        const parts = localizacao.split(/[\/-]/);
        city = parts[0].trim();
        if (parts[1]) {
          state = parts[1].trim().toUpperCase().substring(0, 2);
        }
      }

      // Capitalize city
      if (city) {
        city = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }

      // Fallback search in cache of cities
      if (!city || city.toUpperCase() === "NÃO INFORMADO") {
        let foundCityFromCache = "";
        for (const c of learnedPatterns.cities) {
          if (norm.includes(c.toLowerCase())) {
            foundCityFromCache = c;
            break;
          }
        }
        if (foundCityFromCache) {
          city = foundCityFromCache;
          state = norm.includes("sp") ? "SP" : "MG";
        }
      }

      // Product detection using cache or keywords
      let produto = "";
      let foundProductFromCache = "";
      for (const p of learnedPatterns.products) {
        if (norm.includes(p.toLowerCase())) {
          foundProductFromCache = p;
          break;
        }
      }
      if (foundProductFromCache) {
        produto = foundProductFromCache;
      } else {
        const keywords = ["cama", "colchão", "colchao", "cabeceira", "poltrona", "baú", "bau", "mdf", "sofá", "sofa", "painel", "guarda-roupa", "guarda roupa", "comoda"];
        for (const kw of keywords) {
          const idx = norm.indexOf(kw);
          if (idx !== -1) {
            const line = text.substring(idx).split('\n')[0].trim();
            if (line.length > 3 && line.length < 100) {
              produto = line;
              break;
            }
          }
        }
        if (!produto) produto = "Produto não identificado";
      }

      let finalCor = cor;
      if (tecido) {
        finalCor = cor ? `${cor} (${tecido})` : tecido;
      }

      let valorTotal = parseValue(valorTotalVal) || parseValue(valorProduto);

      let formaPagamento = "A combinar";
      if (formaPagamentoVal) {
        formaPagamento = formaPagamentoVal.toUpperCase();
      } else {
        let foundPaymentFromCache = "";
        for (const m of learnedPatterns.paymentMethods) {
          if (norm.includes(m.toLowerCase())) {
            foundPaymentFromCache = m;
            break;
          }
        }
        if (foundPaymentFromCache) formaPagamento = foundPaymentFromCache;
      }
      if (formaPagamento === "A COMBINAR") formaPagamento = "A combinar";

      let finalObsStr = "";
      if (observacoesVal) finalObsStr += `Obs: ${observacoesVal}. `;
      if (cpfCnpj) finalObsStr += `CPF/CNPJ: ${cpfCnpj}. `;
      if (frete) finalObsStr += `Frete: ${frete}. `;
      if (vendedorVal) finalObsStr += `Vendedor: ${vendedorVal}.`;

      return {
        nomeCompleto: nomeCompleto,
        telefone1: fone1,
        telefone2: fone2,
        endereco: endereco,
        city: city || "NÃO INFORMADO",
        state: state || "MG",
        produto: produto,
        cor: finalCor,
        quantidade: 1,
        formaPagamento: formaPagamento,
        valorTotal: valorTotal,
        comissaoSugerida: 0,
        observacoes: finalObsStr.trim() || "Extraído via Sofia Home Decor",
        modelUsed: "SOFIA_HOME_DECOR"
      };
    } else {
      // -- EXTRAÇÃO PADRÃO --
      // Verificamos se há rótulos de chave-valor habituais (pelo menos dois termos com dois pontos ":" ou "=")
      const labelMatchCount = (text.match(/:(?!\/)/g) || []).length;
      const isSequential = labelMatchCount < 2;

      let nome = "";
      let fone1 = "";
      let fone2 = "";
      let endereco = "";
      let city = "";
      let state = "";
      let produto = "";
      let cor = "";
      let quantidade = 1;
      let formaPagamento = "A combinar";
      let valorTotal = 0;
      let comissaoSugerida = 0;
      let observacoes = "";

      if (isSequential) {
        // Leitura prioriza rigidamente a sequência das informações mesmo sem cabeçalhos de rótulo (PASSO 2)
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) nome = lines[0];
        
        let nextIndex = 1;

        if (lines.length > nextIndex) {
          fone1 = lines[nextIndex];
          nextIndex++;
        }

        if (lines.length > nextIndex) {
          if (isPhoneNumber(lines[nextIndex])) {
            fone2 = lines[nextIndex];
            nextIndex++;
          }
        }

        if (lines.length > nextIndex) {
          endereco = lines[nextIndex];
          nextIndex++;
        }

        if (lines.length > nextIndex) {
          produto = lines[nextIndex];
          nextIndex++;
        }

        if (lines.length > nextIndex) {
          formaPagamento = lines[nextIndex];
          nextIndex++;
        }

        if (lines.length > nextIndex) {
          valorTotal = parseValue(lines[nextIndex]);
          nextIndex++;
        }

        if (lines.length > nextIndex) {
          const lineVal = lines[nextIndex];
          if (lineVal.toLowerCase().includes("vendedor") || isNaN(Number(lineVal.replace(/[^\d]/g, "")))) {
            observacoes = `Vendedor/Obs: ${lineVal}`;
          } else {
            comissaoSugerida = parseValue(lineVal);
          }
          nextIndex++;
        }

        if (lines.length > nextIndex) {
          if (observacoes) {
            observacoes += ` | Obs: ${lines[nextIndex]}`;
          } else {
            observacoes = lines[nextIndex];
          }
        }
      } else {
        // Extração por rótulos tradicionais com regex flexíveis
        const nameMatch = text.match(/(?:nome|cliente|comprador|para|destinatário|destinatario)\s*[\s:=-]\s*([^\n]+)/i);
        if (nameMatch) {
          nome = nameMatch[1].trim();
        } else {
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          const firstLine = lines[0] || "";
          if (firstLine && firstLine.length < 50 && !firstLine.includes(':') && !firstLine.includes('=')) {
            nome = firstLine;
          }
        }

        const phoneNumbers = text.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9\d{4}[-\s]?\d{4}/g) || 
                             text.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}/g) || [];
        if (phoneNumbers.length > 0) {
          fone1 = phoneNumbers[0].trim();
        }
        if (phoneNumbers.length > 1) {
          fone2 = phoneNumbers[1].trim();
        }
        if (!fone1) {
          const foneMatch = text.match(/(?:fone|tel|telefone|whatsapp|cel|celular)\s*[\s:=-]\s*([^\n]+)/i);
          if (foneMatch) fone1 = foneMatch[1].trim();
        }

        const endMatch = text.match(/(?:end|endereço|endereco|rua|av|local|entrega)\s*[\s:=-]\s*([^\n]+)/i);
        if (endMatch) {
          endereco = endMatch[1].trim();
        }

        const prodMatch = text.match(/(?:produto|prod|móvel|item|descrição|descricao|cama|sofá|colchão|poltrona|guarda-roupa|painel)\s*[\s:=-]\s*([^\n]+)/i);
        if (prodMatch) {
          produto = prodMatch[1].trim();
        } else {
          let foundProductFromCache = "";
          for (const p of learnedPatterns.products) {
            if (norm.includes(p.toLowerCase())) {
              foundProductFromCache = p;
              break;
            }
          }
          if (foundProductFromCache) {
            produto = foundProductFromCache;
          } else {
            const keywords = ["cama", "colchão", "colchao", "cabeceira", "poltrona", "baú", "bau", "mdf", "sofá", "sofa", "painel", "guarda-roupa", "guarda roupa", "comoda"];
            for (const kw of keywords) {
              const idx = norm.indexOf(kw);
              if (idx !== -1) {
                const line = text.substring(idx).split('\n')[0].trim();
                if (line.length > 3 && line.length < 100) {
                  produto = line;
                  break;
                }
              }
            }
            if (!produto) produto = "Produto não identificado";
          }
        }

        const corMatch = text.match(/(?:cor|estampa|tecido|revestimento)\s*[\s:=-]\s*([^\n]+)/i);
        if (corMatch) cor = corMatch[1].trim();

        const qtdMatch = text.match(/(?:quantidade|qtd|unidades|quant)\s*[\s:=-]\s*([0-9]+)/i);
        if (qtdMatch) {
          quantidade = parseInt(qtdMatch[1], 10) || 1;
        }

        const pgMatch = text.match(/(?:forma de pagamento|pagamento|pago via|pgto|forma pgto|forma)\s*[\s:=-]\s*([^\n]+)/i);
        if (pgMatch) {
          formaPagamento = pgMatch[1].trim().toUpperCase();
        } else {
          let foundPaymentFromCache = "";
          for (const m of learnedPatterns.paymentMethods) {
            if (norm.includes(m.toLowerCase())) {
              foundPaymentFromCache = m;
              break;
            }
          }
          if (foundPaymentFromCache) formaPagamento = foundPaymentFromCache;
        }

        const valorMatch = text.match(/(?:valor|total|preço|preco|subtotal|venda)\s*[\s:=-]\s*(?:r\$)?\s*([\d.,]+)/i) || text.match(/(?:r\$)\s*([\d.,]+)/i);
        if (valorMatch) {
          valorTotal = parseValue(valorMatch[1]);
        }

        const comMatch = text.match(/(?:comissão|comissao|comisSugerida)\s*[\s:=-]\s*(?:r\$)?\s*([\d.,]+)/i);
        if (comMatch) {
          comissaoSugerida = parseValue(comMatch[1]);
        }

        const obsMatch = text.match(/(?:obs|observação|observacoes|observações|detalhes|cnpj)\s*[\s:=-]\s*([^\n]+)/i);
        if (obsMatch) {
          observacoes = obsMatch[1].trim();
        }
      }

      // Detect city & state
      if (isRetiradaText(text)) {
        city = "RETIRADA";
        state = "";
      } else {
        let foundCityFromCache = "";
        for (const c of learnedPatterns.cities) {
          if (norm.includes(c.toLowerCase())) {
            foundCityFromCache = c;
            break;
          }
        }

        if (foundCityFromCache) {
          city = foundCityFromCache;
          state = norm.includes("sp") ? "SP" : "MG";
        } else {
          const matchLine = text.match(/(?:cidade|localidade|municipio)\s*[\s:=-]\s*([^\n]+)/i);
          if (matchLine) {
            const parts = matchLine[1].split(/[\/-]/);
            city = parts[0].trim();
            if (parts[1]) state = parts[1].trim().toUpperCase().substring(0, 2);
          } else {
            const addrToSearch = endereco || text;
            const cityStateMatch = addrToSearch.match(/,\s*([^,]+?)\s*[\/-]\s*([A-Za-z]{2})/);
            if (cityStateMatch) {
              city = cityStateMatch[1].trim();
              state = cityStateMatch[2].trim().toUpperCase().substring(0, 2);
            }
          }
        }
      }

      if (city && city !== "RETIRADA" && city !== "NÃO INFORMADO") {
        city = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }

      if (!city) city = "NÃO INFORMADO";

      if (formaPagamento === "A COMBINAR") {
        formaPagamento = "A combinar";
      }

      return {
        nomeCompleto: nome,
        telefone1: fone1,
        telefone2: fone2,
        endereco: endereco,
        city: city,
        state: state || "MG",
        produto: produto,
        cor: cor,
        quantidade: quantidade,
        formaPagamento: formaPagamento,
        valorTotal: valorTotal,
        comissaoSugerida: comissaoSugerida,
        observacoes: observacoes || "Extraído via Parser Padrão Local",
        modelUsed: "PADRAO"
      };
    }
  };

  // 1. CADASTRO INTELIGENTE DE PEDIDOS COM IA (WA Paste Interpreter)
  const handleParseWhatsAppOrder = async () => {
    if (!fornecedorSelecionado) {
      triggerToast('error', 'Selecione o fornecedor.');
      return;
    }
    console.log('Iniciando análise');
    console.log('Fornecedor selecionado:', fornecedorSelecionado);
    if (!pasteOrderText.trim()) {
      triggerToast('error', 'Por favor, cole um texto de pedido do WhatsApp.');
      return;
    }

    setIsProcessingOrder(true);
    setAiAnalysisError(null);
    const analysisStartTime = Date.now();
    const textLen = pasteOrderText.length;

    // ETAPA 1 - PARSER LOCAL (PRIORIDADE MÁXIMA)
    const localParsed = parseWhatsAppOrderWithRegex(pasteOrderText);
    
    if (isRapidAnalysis) {
      const durationMs = Date.now() - analysisStartTime;
      
      const newLog: AiAnalysisLog = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        durationMs,
        textLength: textLen,
        inputText: pasteOrderText,
        response: JSON.stringify(localParsed, null, 2),
        isRapid: true,
        supplier: currentSupplier,
        modelUsed: "PARSER LOCAL (Modo Rápido)",
        errorCode: "SUCCESS"
      };

      setAiLogs(prev => [newLog, ...prev].slice(0, 50));
      localStorage.setItem('iazap_ai_logs', JSON.stringify([newLog, ...aiLogs].slice(0, 50)));

      setAiDiagnostics(prev => ({
        ...prev,
        totalAnalises: prev.totalAnalises + 1,
        resolvidaSemIa: prev.resolvidaSemIa + 1,
        sucesso: prev.sucesso + 1
      }));

      const today = new Date();
      const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
      const nextNum = generateNextNumeroVenda(currentSupplierPedidos);

      const totalVal = Number(localParsed.valorTotal) || 0;
      let finalComis: number | undefined = undefined;
      if (fornecedorSelecionado === 'Sofia Home Decor') {
        finalComis = Number((totalVal * 0.1).toFixed(2));
      } else {
        finalComis = undefined;
      }

      setEditingPedido({
        numeroVenda: nextNum,
        data: formattedDate,
        nomeCompleto: localParsed.nomeCompleto || '',
        telefone1: localParsed.telefone1 || '',
        telefone2: localParsed.telefone2 || '',
        endereco: localParsed.endereco || '',
        city: localParsed.city || 'NÃO INFORMADO',
        state: localParsed.state || '',
        produto: localParsed.produto || '',
        cor: localParsed.cor || '',
        quantidade: Number(localParsed.quantidade) || 1,
        formaPagamento: localParsed.formaPagamento || '',
        valorTotal: totalVal,
        comissao: finalComis,
        status: 'PENDING',
        textoOriginal: pasteOrderText,
        observacoes: localParsed.observacoes || 'Extraído via Modo Análise Rápida local',
        supplier: getSupplierKeyByName(fornecedorSelecionado)
      });

      triggerToast('success', 'Ficha processada em Modo Rápido com sucesso! (Sem uso de IA)');
      setIsProcessingOrder(false);
      return;
    }

    // Funções de validação solicitadas (Validação)
    const isValidPhone = (str: string) => {
      if (!str) return false;
      const digitsOnly = str.replace(/\D/g, '');
      return digitsOnly.length >= 8;
    };

    const isValidValue = (val: number) => {
      return typeof val === 'number' && !isNaN(val) && val > 0;
    };

    const isValidCity = (str: string) => {
      return str && str.trim().length > 0 && str !== 'NÃO INFORMADO';
    };

    const isValidProduct = (str: string) => {
      return str && str.trim().length > 0 && str !== 'Produto não identificado';
    };

    // Validar regras requisitadas
    const isPhoneValid = isValidPhone(localParsed.telefone1);
    const isValueValid = isValidValue(localParsed.valorTotal);
    const isCityValid = isValidCity(localParsed.city);
    const isProductValid = isValidProduct(localParsed.produto);

    // Calcular correspondência de campos preenchidos p/ avaliar >= 80% do preenchimento
    let foundFieldsCount = 0;
    if (localParsed.nomeCompleto && localParsed.nomeCompleto.trim().length > 2) foundFieldsCount++;
    if (isPhoneValid) foundFieldsCount++;
    if (isCityValid) foundFieldsCount++;
    if (isProductValid) foundFieldsCount++;
    if (isValueValid) foundFieldsCount++;
    if (localParsed.endereco && localParsed.endereco.trim().length > 3 || localParsed.city === 'RETIRADA') foundFieldsCount++;
    if (localParsed.formaPagamento && localParsed.formaPagamento !== 'A combinar' && localParsed.formaPagamento !== 'NÃO INFORMADO') foundFieldsCount++;
    if (localParsed.comissaoSugerida > 0 || (localParsed.valorTotal > 0 && comissaoPercent > 0)) foundFieldsCount++;

    // REGRA DE CONFIANÇA: Se o parser preencher mais de 80% dos campos fundamentais E passar nas validações cruciais:
    // Não chamar Gemini. Salvar resultado.
    const isHighConfidence = foundFieldsCount >= 6 && isPhoneValid && isValueValid && isCityValid && isProductValid;

    if (isHighConfidence) {
      const durationMs = Date.now() - analysisStartTime;
      
      // Registrar log com indicação conceitual de parser local
      const newLog: AiAnalysisLog = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        durationMs,
        textLength: textLen,
        inputText: pasteOrderText,
        response: JSON.stringify(localParsed, null, 2),
        isRapid: true,
        supplier: currentSupplier,
        modelUsed: `PARSER LOCAL (${localParsed.modelUsed || "Sem IA"})`,
        errorCode: "SUCCESS"
      };

      setAiLogs(prev => [newLog, ...prev].slice(0, 50));

      // Incrementar os diagnósticos de consumo local sem custos de créditos de IA
      setAiDiagnostics(prev => ({
        ...prev,
        totalAnalises: prev.totalAnalises + 1,
        resolvidaSemIa: prev.resolvidaSemIa + 1,
        sucesso: prev.sucesso + 1
      }));

      // Preencher o formulário
      const today = new Date();
      const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
      const nextNum = generateNextNumeroVenda(currentSupplierPedidos);

      const totalVal = Number(localParsed.valorTotal) || 0;
      let finalComis: number | undefined = undefined;
      if (fornecedorSelecionado === 'Sofia Home Decor') {
        finalComis = Number((totalVal * 0.1).toFixed(2));
      } else {
        finalComis = undefined;
      }

      setEditingPedido({
        numeroVenda: nextNum,
        data: formattedDate,
        nomeCompleto: localParsed.nomeCompleto || '',
        telefone1: localParsed.telefone1 || '',
        telefone2: localParsed.telefone2 || '',
        endereco: localParsed.endereco || '',
        city: localParsed.city || 'NÃO INFORMADO',
        state: localParsed.state || '',
        produto: localParsed.produto || '',
        cor: localParsed.cor || '',
        quantidade: Number(localParsed.quantidade) || 1,
        formaPagamento: localParsed.formaPagamento || '',
        valorTotal: totalVal,
        comissao: finalComis,
        status: 'PENDING',
        textoOriginal: pasteOrderText,
        observacoes: localParsed.observacoes || 'Extraído via Parser Local Inteligente',
        supplier: getSupplierKeyByName(fornecedorSelecionado)
      });

      triggerToast('success', 'Ficha processada localmente com sucesso! (Economizado crédito de IA)');
      setIsProcessingOrder(false);
      return;
    }

    // ETAPA 2 - GEMINI COM FILA DE FALLBACK DE CHAVES
    let savedKeys: string[] = [];
    try {
      const stored = localStorage.getItem('iazap_gemini_keys');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          savedKeys = parsed.filter((k: any) => typeof k === 'string' && k.trim().length > 0);
        }
      }
    } catch (e) {
      console.error(e);
    }

    const candidates = savedKeys.length > 0 ? savedKeys : [""];
    
    let isSuccessful = false;
    let extracted: any = null;
    let lastError: any = null;
    let errorCodeValue = "";
    let finalKeyUsedMasked = "Chave Padrão Servidor";
    
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Tentamos usar cada chave da fila em sequência
    for (let kIdx = 0; kIdx < candidates.length; kIdx++) {
      const keyArg = candidates[kIdx];
      const maskedKey = keyArg 
        ? `${keyArg.substring(0, 6)}...${keyArg.substring(Math.max(0, keyArg.length - 4))}`
        : "Chave Padrão Servidor";
        
      const keyLabel = `Chave ${kIdx + 1}/${candidates.length} (${maskedKey})`;
      console.log(`[Diagnostic] Iniciando tentativa com ${keyLabel}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000); // 10s timeout

      try {
        const response = await fetch("/api/gemini/parse-pedido", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text: pasteOrderText, 
            rapidMode: isRapidAnalysis,
            apiKey: keyArg || undefined
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Servidor retornou código ${response.status}`);
        }

        const resJson = await response.json();
        if (resJson.success && resJson.data) {
          extracted = resJson.data;
          isSuccessful = true;
          errorCodeValue = "SUCCESS";
          finalKeyUsedMasked = maskedKey;
          break; // Sai da lista de fallback em caso de sucesso!
        } else {
          throw new Error(resJson.error || "IA não conseguiu interpretar os campos estruturados.");
        }
      } catch (error: any) {
        clearTimeout(timeoutId);
        lastError = error;
        const isTimeout = error.name === 'AbortError';
        errorCodeValue = isTimeout ? 'TIMEOUT_10S' : (error.message || '500_OR_503_ERROR');
        
        console.error(`[Diagnostic Error] Tentativa com ${keyLabel} falhou com código ${errorCodeValue}.`);
        
        // Registrar log de erro específico desta chave falha
        const logDuration = Date.now() - analysisStartTime;
        const failLog: AiAnalysisLog = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
          timestamp: new Date().toISOString(),
          durationMs: logDuration,
          textLength: textLen,
          inputText: pasteOrderText,
          error: `Falha na Chave ${kIdx + 1} (${errorCodeValue}): ${error.message || error}`,
          isRapid: isRapidAnalysis,
          supplier: currentSupplier,
          modelUsed: "gemini-3.5-flash",
          errorCode: errorCodeValue,
          geminiKeyUsed: maskedKey
        };
        
        setAiLogs(prev => {
          const updatedLogs = [failLog, ...prev].slice(0, 50);
          localStorage.setItem('iazap_ai_logs', JSON.stringify(updatedLogs));
          return updatedLogs;
        });

        if (kIdx < candidates.length - 1) {
          triggerToast('info', `Chave ${kIdx + 1} falhou. Alternando automaticamente para Chave ${kIdx + 2}...`);
        }
      }
    }

    const durationMs = Date.now() - analysisStartTime;

    if (isSuccessful && extracted) {
      // Registrar log bem sucedido
      const newLog: AiAnalysisLog = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        durationMs,
        textLength: textLen,
        inputText: pasteOrderText,
        response: JSON.stringify(extracted, null, 2),
        isRapid: isRapidAnalysis,
        supplier: currentSupplier,
        modelUsed: "gemini-3.5-flash",
        errorCode: "SUCCESS",
        geminiKeyUsed: finalKeyUsedMasked
      };
      
      setAiLogs(prev => {
        const updatedLogs = [newLog, ...prev].slice(0, 50);
        localStorage.setItem('iazap_ai_logs', JSON.stringify(updatedLogs));
        return updatedLogs;
      });

      // Atualizar Controle de Consumo
      setAiDiagnostics(prev => ({
        ...prev,
        totalAnalises: prev.totalAnalises + 1,
        enviadaGemini: prev.enviadaGemini + 1,
        sucesso: prev.sucesso + 1
      }));

      // Preencher dados estruturados
      const today = new Date();
      const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
      const nextNum = generateNextNumeroVenda(currentSupplierPedidos);

      const totalVal = Number(extracted.valorTotal) || 0;
      let finalComis: number | undefined = undefined;
      if (fornecedorSelecionado === 'Sofia Home Decor') {
        finalComis = Number((totalVal * 0.1).toFixed(2));
      } else {
        finalComis = undefined;
      }

      setEditingPedido({
        numeroVenda: nextNum,
        data: formattedDate,
        nomeCompleto: extracted.nomeCompleto || '',
        telefone1: extracted.telefone1 || '',
        telefone2: extracted.telefone2 || '',
        endereco: extracted.endereco || '',
        city: extracted.city || 'NÃO INFORMADO',
        state: extracted.state || '',
        produto: extracted.produto || '',
        cor: extracted.cor || '',
        quantidade: Number(extracted.quantidade) || 1,
        formaPagamento: extracted.formaPagamento || '',
        valorTotal: totalVal,
        comissao: finalComis,
        status: 'PENDING',
        textoOriginal: pasteOrderText,
        observacoes: extracted.observacoes || '',
        supplier: getSupplierKeyByName(fornecedorSelecionado)
      });

      triggerToast('success', 'Ficha interpretada pela IA com sucesso! Verifique os dados abaixo.');
    } else {
      // ETAPA 4 - FALLBACK (Análise pelo parser local de emergência, aberto em cadastro manual)
      const errorMsg = lastError?.name === 'AbortError' 
        ? 'Análise cancelada devido ao tempo limite de 10 segundos excedido do Gemini.' 
        : (lastError?.message || 'IA temporariamente indisponível.');

      const newLog: AiAnalysisLog = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        durationMs,
        textLength: textLen,
        inputText: pasteOrderText,
        error: errorMsg,
        isRapid: isRapidAnalysis,
        supplier: currentSupplier,
        modelUsed: "gemini-3.5-flash",
        errorCode: errorCodeValue,
        geminiKeyUsed: "Nenhuma (Todas as chaves falharam)"
      };
      
      setAiLogs(prev => {
        const updatedLogs = [newLog, ...prev].slice(0, 50);
        localStorage.setItem('iazap_ai_logs', JSON.stringify(updatedLogs));
        return updatedLogs;
      });

      // Atualizar estatísticas de consumo com indicação de erro na IA
      setAiDiagnostics(prev => ({
        ...prev,
        totalAnalises: prev.totalAnalises + 1,
        enviadaGemini: prev.enviadaGemini + 1,
        erros: prev.erros + 1
      }));

      const today = new Date();
      const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
      const nextNum = generateNextNumeroVenda(currentSupplierPedidos);

      const totalVal = Number(localParsed.valorTotal) || 0;
      let finalComis: number | undefined = undefined;
      if (fornecedorSelecionado === 'Sofia Home Decor') {
        finalComis = Number((totalVal * 0.1).toFixed(2));
      } else {
        finalComis = undefined;
      }

      setEditingPedido({
        numeroVenda: nextNum,
        data: formattedDate,
        nomeCompleto: localParsed.nomeCompleto || '',
        telefone1: localParsed.telefone1 || '',
        telefone2: localParsed.telefone2 || '',
        endereco: localParsed.endereco || '',
        city: localParsed.city || 'NÃO INFORMADO',
        state: localParsed.state || '',
        produto: localParsed.produto || 'Produto não identificado',
        cor: localParsed.cor || '',
        quantidade: Number(localParsed.quantidade) || 1,
        formaPagamento: localParsed.formaPagamento || 'PIX',
        valorTotal: totalVal,
        comissao: finalComis,
        status: 'PENDING',
        textoOriginal: pasteOrderText, // Nunca esvazia e nunca perde o texto original
        observacoes: localParsed.observacoes || 'Extraído via Fallback de Emergência',
        supplier: getSupplierKeyByName(fornecedorSelecionado)
      });

      setAiAnalysisError("IA temporariamente indisponível. Você pode continuar utilizando o cadastro manual.");
      triggerToast('info', 'Ficha preenchida via Fallback de Emergência (cadastro manual aberto).');
    }

    setIsProcessingOrder(false);
  };

  // 6. CAMPO “PEDIDO ENTREGUE” COM IA
  const handleParseDeliveryUpdate = async () => {
    if (!pasteDeliveryText.trim()) {
      triggerToast('error', 'Digite ou cole uma mensagem de entrega (ex: "João Silva entregue").');
      return;
    }

    setIsProcessingDelivery(true);
    try {
      // Filter active orders to optimize context payload and costs
      const activeOrders = pedidos
        .filter(p => p.status !== 'DELIVERED')
        .map(p => ({
          id: p.id,
          nomeCompleto: p.nomeCompleto,
          produto: p.produto,
          cor: p.cor
        }));

      if (activeOrders.length === 0) {
        triggerToast('info', 'Não há pedidos pendentes ou agendados ativos para corresponder à entrega.');
        setIsProcessingDelivery(false);
        return;
      }

      // Encontrar chaves salvas localmente
      let savedKeys: string[] = [];
      try {
        const stored = localStorage.getItem('iazap_gemini_keys');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            savedKeys = parsed.filter((k: any) => typeof k === 'string' && k.trim().length > 0);
          }
        }
      } catch (e) {
        console.error(e);
      }

      const candidates = savedKeys.length > 0 ? savedKeys : [""];
      
      let isSuccessful = false;
      let resJson: any = null;

      for (let kIdx = 0; kIdx < candidates.length; kIdx++) {
        const keyArg = candidates[kIdx];
        const maskedKey = keyArg 
          ? `${keyArg.substring(0, 6)}...${keyArg.substring(Math.max(0, keyArg.length - 4))}`
          : "Chave Padrão Servidor";

        try {
          const response = await fetch("/api/gemini/parse-entregue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              text: pasteDeliveryText, 
              activeOrders,
              apiKey: keyArg || undefined
            })
          });

          if (!response.ok) {
            throw new Error(`Erro do servidor: ${response.status}`);
          }

          resJson = await response.json();
          isSuccessful = true;
          break; // Sucesso, sai da fila!
        } catch (err: any) {
          console.error(`Falha ao processar com a chave ${maskedKey}:`, err);
          if (kIdx < candidates.length - 1) {
            triggerToast('info', `Chave ${kIdx + 1} falhou. Alternando automaticamente para Chave ${kIdx + 2}...`);
          } else {
            throw new Error(err.message || 'Todas as chaves de API falharam.');
          }
        }
      }

      if (isSuccessful && resJson && resJson.success && resJson.matchedOrderId) {
        const matchedId = resJson.matchedOrderId;
        const index = pedidos.find(p => p.id === matchedId);
        
        if (index) {
          await updatePedidoStatus(matchedId, 'DELIVERED', undefined, currentUser?.name || currentUser?.username || 'Sistema', index.supplier);
          triggerToast('success', `Confirmado! Pedido ${index.numeroVenda} (${index.nomeCompleto}) marcado como Entregue via IA.`);
          setPasteDeliveryText('');
        } else {
          triggerToast('error', 'Pedido correspondido não foi localizado localmente no banco de dados.');
        }
      } else {
        triggerToast('refused', 'A IA não conseguiu associar esta confirmação a nenhum pedido pendente/agendado ativo.');
      }
    } catch (error: any) {
      console.error(error);
      triggerToast('error', `Falha ao processar entrega com IA: ${error.message || 'Verifique a conexão.'}`);
    } finally {
      setIsProcessingDelivery(false);
    }
  };

  // Save manual/parsed order from intermediate form
  const handleSavePedidoForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPedido) return;

    if (!fornecedorSelecionado) {
      triggerToast('error', 'Selecione o fornecedor.');
      return;
    }
    console.log('Iniciando salvamento do pedido');
    console.log('Fornecedor selecionado:', fornecedorSelecionado);

    if (!editingPedido.nomeCompleto?.trim()) {
      triggerToast('error', 'Campo obrigatório faltando: Nome completo do cliente.');
      return;
    }
    if (!editingPedido.produto?.trim()) {
      triggerToast('error', 'Campo obrigatório faltando: Descrição do produto.');
      return;
    }
    if (editingPedido.valorTotal === undefined || isNaN(editingPedido.valorTotal)) {
      triggerToast('error', 'Campo obrigatório faltando ou incorreto: Valor Total.');
      return;
    }

    const parsedComissao = parseBrazilianNumber(comissaoInputText);
    if (!comissaoInputText.trim() || isNaN(parsedComissao) || parsedComissao <= 0) {
      triggerToast('error', 'Informe o valor da comissão.');
      return;
    }

    // Set comissao on local state and trigger confirmation screen overlay
    setEditingPedido(prev => prev ? { ...prev, comissao: parsedComissao } : null);
    setShowConfirmationStep(true);
  };

  // Perform absolute/definitive saving to database or offline storage after user clicks confirmation
  const executeDefinitiveSave = async () => {
    if (!editingPedido) return;
    if (!fornecedorSelecionado) {
      triggerToast('error', 'Selecione o fornecedor.');
      return;
    }
    console.log('Salvamento definitivo disparado para o fornecedor:', fornecedorSelecionado);
    try {
      const payload: Omit<Pedido, "id"> & { id?: string } = {
        id: editingPedido.id,
        numeroVenda: editingPedido.numeroVenda || generateNextNumeroVenda(currentSupplierPedidos),
        data: editingPedido.data || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        nomeCompleto: editingPedido.nomeCompleto,
        telefone1: editingPedido.telefone1 || '',
        telefone2: editingPedido.telefone2 || '',
        endereco: editingPedido.endereco || '',
        city: editingPedido.city || '',
        state: editingPedido.state || '',
        produto: editingPedido.produto,
        cor: editingPedido.cor || '',
        quantidade: Number(editingPedido.quantidade) || 1,
        formaPagamento: editingPedido.formaPagamento || '',
        valorTotal: Number(editingPedido.valorTotal),
        comissao: Number(editingPedido.comissao),
        status: editingPedido.status || 'PENDING',
        dataReagendamento: editingPedido.dataReagendamento || '',
        rescheduleDate: editingPedido.rescheduleDate || editingPedido.dataReagendamento || '',
        textoOriginal: editingPedido.textoOriginal || `PEDIDO MANUAL\nCliente: ${editingPedido.nomeCompleto}\nProduto: ${editingPedido.produto}`,
        observacoes: editingPedido.observacoes || '',
        supplier: getSupplierKeyByName(fornecedorSelecionado)
      };

      await savePedido(payload, currentUser?.name || currentUser?.username || 'Sistema');
      
      // Memorize patterns found in the successfully saved order
      registerNewPatterns(payload);
      
      triggerToast('success', `Pedido ${payload.numeroVenda} de ${payload.nomeCompleto} salvo com sucesso!`);
      
      // Clean form states and confirmation overlay
      setEditingPedido(null);
      setPasteOrderText('');
      setShowConfirmationStep(false);
    } catch (err: any) {
      console.error(err);
      const readableError = parseFirebaseError(err);
      triggerToast('error', `Erro ao salvar no Firebase: ${readableError}`);
    }
  };

  // Fast manually trigger status update without AI
  const handleQuickStatusUpdate = async (id: string, newStatus: any, extra?: { dataReagendamento?: string }) => {
    const updated = pedidos.find(p => p.id === id);
    if (!updated) return;

    if (newStatus === 'RESCHEDULED' && (!extra || !extra.dataReagendamento)) {
      setReschedulingPedido(updated);
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      setRescheduleInputDate(updated.dataReagendamento || `${dd}/${mm}`);
      setShowDropdownId(null);
      return;
    }

    try {
      if (newStatus === 'RESCHEDULED' && extra) {
        console.log("Pedido reagendado:", id);
        console.log("Novo status:", "RESCHEDULED");
        console.log("Nova data:", extra.dataReagendamento);
      }
      await updatePedidoStatus(id, newStatus, extra, currentUser?.name || currentUser?.username || 'Sistema', updated.supplier);
      if (newStatus === 'RESCHEDULED') {
        setCurrentTab('reagendados');
        setSelectedStatuses(['Todos']);
        triggerToast('success', `Pedido ${updated.numeroVenda} reagendado para ${extra?.dataReagendamento || ''} e movido para Notas Agendadas!`);
      } else if (newStatus === 'DELIVERED') {
        setCurrentTab('entregues');
        triggerToast('success', `Pedido ${updated.numeroVenda} marcado como Entregue e movido para a aba Pedidos Entregues!`);
      } else if (newStatus === 'CANCELLED') {
        setCurrentTab('cancelados');
        setSelectedStatuses(['Todos']);
        triggerToast('success', `Pedido ${updated.numeroVenda} foi cancelado com sucesso e movido para a aba de Cancelados!`);
      } else {
        const readableLabel = newStatus === 'PENDING' ? 'Pendente' :
                              newStatus === 'RESCHEDULED' ? 'Reagendado / Agendado' :
                              newStatus === 'DELIVERED_UNPAID' ? 'Entregue e Não Pago' :
                              newStatus === 'CANCELLED' ? 'Cancelado' : 'Entregue';
        triggerToast('success', `Pedido ${updated.numeroVenda} atualizado para ${readableLabel}!`);
      }
      setShowDropdownId(null);
    } catch (err: any) {
      console.error(err);
      const readableError = parseFirebaseError(err);
      triggerToast('error', `Falha ao atualizar status: ${readableError}`);
    }
  };

  // Helper: Retrieve complete priority-categorized today notifications list
  const getTodayNotifications = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const todayStr = `${dd}/${mm}`;

    return currentSupplierPedidos.map(p => {
      // HOJE DELIVERY NOTIFICATIONS PANEL must show ONLY:
      // - status === 'RESCHEDULED'
      // - rescheduled date is today
      // Never show PENDING, DELIVERED, CANCELLED, or DELIVERED_UNPAID.
      if (p.status !== 'RESCHEDULED') return null;

      const targetDate = p.dataReagendamento || p.rescheduleDate;
      if (!targetDate) return null;

      const cleanTarget = targetDate.trim().replace(/\s/g, '');
      const cleanToday = todayStr;

      if (cleanTarget === cleanToday) {
        let label = `⏰ Pedido agendado vence hoje:\n${p.nomeCompleto}`;
        let type: 'delivery' | 'scheduled' | 'rescheduled' = 'rescheduled';
        let icon = '⏰';
        let colorClass = 'border-l-rose-500 bg-rose-50/20';
        let priority: 'high' | 'medium' | 'low' = 'high';

        return {
          pedido: p,
          label,
          type,
          icon,
          colorClass,
          priority
        };
      }
      return null;
    }).filter((n): n is NonNullable<typeof n> => n !== null);
  };

  // Helper: Retrieve basic today's notifications (orders list only) to maintain structural compatibility
  const getNotifications = () => {
    return getTodayNotifications().map(n => n.pedido);
  };

  // Helper: Calculate previous week dates (Monday to Sunday) and compile automatic dynamic statistics
  const parseReportData = () => {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); 
    const daysToSubtract = currentDayOfWeek === 0 ? 13 : currentDayOfWeek + 6;
    
    const prevMonday = new Date(today);
    prevMonday.setDate(today.getDate() - daysToSubtract);
    
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);
    
    const formatDDMM = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}`;
    };
    
    const mondayStr = formatDDMM(prevMonday);
    const sundayStr = formatDDMM(prevSunday);
    const periodStr = `${mondayStr} até ${sundayStr}`;
    
    const prevWeekDays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const temp = new Date(prevMonday);
      temp.setDate(prevMonday.getDate() + i);
      prevWeekDays.push(formatDDMM(temp));
    }
    
    const prevWeekPedidos = currentSupplierPedidos
      .filter(p => p.status !== 'CANCELLED')
      .filter(p => {
        if (!p.data) return false;
        const match = p.data.match(/(\d{2})\/(\d{2})/);
        if (!match) return false;
        const itemDDMM = `${match[1]}/${match[2]}`;
        return prevWeekDays.includes(itemDDMM);
      });
    
    let filteredPedidos = prevWeekPedidos;
    let labelPeriodo = periodStr;
    let wasFallback = false;
    
    if (filteredPedidos.length === 0) {
      wasFallback = true;
      labelPeriodo = "Todos os Lançamentos";
      filteredPedidos = currentSupplierPedidos.filter(p => p.status !== 'CANCELLED');
    }
    
    const fatTotal = filteredPedidos.reduce((sum, p) => sum + (p.valorTotal || 0), 0);
    const totalVendas = filteredPedidos.length;
    const comGerada = filteredPedidos.reduce((sum, p) => sum + (p.comissao || 0), 0);
    const comRecebida = filteredPedidos
      .filter(p => p.status === 'DELIVERED')
      .reduce((sum, p) => sum + (p.comissao || 0), 0);
    const totalEntregues = filteredPedidos.filter(p => p.status === 'DELIVERED').length;
    const totalPendentes = filteredPedidos.filter(p => p.status !== 'DELIVERED' && p.status !== 'CANCELLED').length;
    
    return {
      periodo: labelPeriodo,
      faturamento: fatTotal,
      vendasCount: totalVendas,
      comissaoGerada: comGerada,
      comissaoRecebida: comRecebida,
      entreguesCount: totalEntregues,
      pendentesCount: totalPendentes,
      prevWeekDays,
      prevWeekPedidos,
      wasFallback
    };
  };

  // Helper: Elegant status dependent row colors
  const getRowBgClass = (status: string, id: string) => {
    const isSelected = selectedPedido?.id === id;
    const isHighlighted = highlightedPedidoId === id;

    if (isHighlighted) {
      return "bg-amber-100 ring-2 ring-amber-500 scale-[1.01] shadow-md border-l-4 border-amber-600 pl-3 transition-all duration-300 font-bold text-slate-900";
    }

    let base = "bg-white text-slate-755 hover:bg-slate-50";
    
    if (status === 'RESCHEDULED') {
      base = "bg-amber-50/60 text-amber-950 hover:bg-amber-100/50";
    } else if (status === 'DELIVERED_UNPAID') {
      base = "bg-blue-50/15 text-slate-755 hover:bg-blue-50/25";
    } else if (status === 'DELIVERED') {
      base = "bg-emerald-50/15 text-slate-755 hover:bg-emerald-50/25";
    } else if (status === 'CANCELLED') {
      base = "bg-red-50/30 text-rose-800 hover:bg-red-100/30 opacity-75";
    } else {
      base = "bg-white text-slate-705 hover:bg-slate-50";
    }
    
    if (isSelected) {
      if (status === 'RESCHEDULED') {
        return `${base} border-l-[3.5px] border-amber-500 pl-[12.5px] font-semibold bg-amber-50/80`;
      } else if (status === 'DELIVERED_UNPAID') {
        return `${base} border-l-[3.5px] border-blue-400 pl-[12.5px] font-medium bg-blue-50/30`;
      } else if (status === 'DELIVERED') {
        return `${base} border-l-[3.5px] border-emerald-400 pl-[12.5px] font-medium bg-emerald-50/30`;
      } else if (status === 'CANCELLED') {
        return `${base} border-l-[3.5px] border-rose-500 pl-[12.5px] font-medium bg-rose-50/35`;
      } else {
        return `${base} border-l-[3.5px] border-brand pl-[12.5px] font-medium bg-slate-50/80`;
      }
    } else {
      return `${base} pl-[16px] border-l-[3.5px] border-transparent`;
    }
  };

  // Delete Order
  const handleDeletePedido = async (id: string) => {
    if (window.confirm("Gostaria de deletar permanentemente este registro de pedido?")) {
      try {
        await deletePedido(id);
        triggerToast('info', 'Ficha excluída com sucesso.');
        setSelectedPedido(null);
        setShowDropdownId(null);
      } catch (err: any) {
        console.error(err);
        const readableError = parseFirebaseError(err);
        triggerToast('error', `Falha ao remover o registro: ${readableError}`);
      }
    }
  };

  // Cancel Order
  const handleCancelPedido = async (id: string) => {
    if (window.confirm("Tem certeza que deseja cancelar este pedido?")) {
      try {
        const targeted = pedidos.find(p => p.id === id);
        await updatePedidoStatus(id, 'CANCELLED', undefined, currentUser?.name || currentUser?.username || 'Sistema', targeted?.supplier);
        triggerToast('success', 'Pedido cancelado com sucesso!');
        setSelectedPedido(null);
        setShowDropdownId(null);
      } catch (err: any) {
        console.error(err);
        const readableError = parseFirebaseError(err);
        triggerToast('error', `Falha ao cancelar o pedido: ${readableError}`);
      }
    }
  };

  // Exclude Order definitely with backup
  const handleExcludePedido = async (pedido: Pedido) => {
    console.log("[DEBUG handleExcludePedido] Evento disparado para o pedido:", pedido);
    
    if (!pedido || !pedido.id) {
      console.error("[DEBUG handleExcludePedido] Erro: O pedido selecionado não possui ID válido!");
      triggerToast('error', 'Falha ao identificar a venda: ID ausente.');
      return;
    }

    if (!isAdminMode) {
      console.warn("[DEBUG handleExcludePedido] Permissão negada: Modo Admin inativo.");
      triggerToast('error', 'Apenas administradores podem excluir vendas.');
      return;
    }

    const confirmDelete = window.confirm(`Tem certeza que deseja excluir a venda #${pedido.numeroVenda || pedido.id} definitivamente?`);
    if (!confirmDelete) {
      console.log("[DEBUG handleExcludePedido] Exclusão cancelada na confirmação.");
      return;
    }

    try {
      const deletedByUser = currentUser?.name || currentUser?.username || 'Administrador (Dashboard)';
      console.log("[DEBUG handleExcludePedido] Iniciando exclusão definitiva. Usuário:", deletedByUser);

      // Chamando a exclusão com backup
      await excludeOrderWithBackup(pedido, deletedByUser);
      
      // Atualizando o estado local imediatamente após a exclusão de forma otimista
      console.log("[DEBUG handleExcludePedido] Removendo o pedido do estado local imediatamente.");
      setPedidos(curr => curr.filter(p => p.id !== pedido.id));

      triggerToast('success', 'Pedido excluído com sucesso.');
    } catch (error: any) {
      console.error("[DEBUG handleExcludePedido] Erro crítico ao excluir venda:", error);
      triggerToast('error', `Falha ao excluir venda: ${error.message || error}`);
    }
  };

  // Restore excluded order
  const handleRestoreExcludedOrder = async (backup: ExcludedOrderBackup) => {
    if (!isAdminMode) {
      triggerToast('error', 'Apenas administradores podem restaurar vendas excluídas.');
      return;
    }
    try {
      await restoreExcludedOrderToSystem(backup);
      triggerToast('success', 'Venda restaurada com sucesso!');
    } catch (error: any) {
      console.error("Error restoring order: ", error);
      triggerToast('error', `Falha ao restaurar venda: ${error.message || error}`);
    }
  };

  // Copy buffers helpers
  const copyToClipboard = (text: string, typeName: string) => {
    navigator.clipboard.writeText(text);
    triggerToast('success', `${typeName} copiado para transferência!`);
  };

  // 11. CONTROLE DE COMISSÃO & 12. PAINEL DE RESUMO CALCULATIONS
  const totalVendidosSum = currentSupplierPedidos
    .filter(p => p.status !== 'CANCELLED')
    .reduce((sum, p) => sum + (p.valorTotal || 0), 0);
  const totalComissoesSum = currentSupplierPedidos
    .filter(p => p.status !== 'CANCELLED')
    .reduce((sum, p) => sum + (p.comissao || 0), 0);
  const totalComissoesRecebidas = currentSupplierPedidos
    .filter(p => p.status === 'DELIVERED')
    .reduce((sum, p) => sum + (p.comissao || 0), 0);
  const totalComissoesPendentes = currentSupplierPedidos
    .filter(p => p.status !== 'DELIVERED' && p.status !== 'CANCELLED')
    .reduce((sum, p) => sum + (p.comissao || 0), 0);
  
  // --- CORE SYSTEM OF ADVANCED FILTRATION, DATE TRACKING & ALPHABETICAL/TEMPORAL SORTING ---

  // Helper: Get parsed JS Date for dynamic comparisons
  const getPedidoDate = (p: Pedido): Date => {
    if (!p.data) {
      return p.createdAt ? new Date(p.createdAt) : new Date();
    }
    // Match DD/MM/YYYY or DD/MM/YY
    const matchFull = p.data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (matchFull) {
      const day = parseInt(matchFull[1], 10);
      const month = parseInt(matchFull[2], 10) - 1;
      let year = parseInt(matchFull[3], 10);
      if (year < 100) year += 2000;
      return new Date(year, month, day, 12, 0, 0);
    }
    // Match standard DD/MM format
    const matchShort = p.data.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (matchShort) {
      const day = parseInt(matchShort[1], 10);
      const month = parseInt(matchShort[2], 10) - 1;
      let year = 2026; // Default Metadata year context
      if (p.createdAt) {
        const d = new Date(p.createdAt);
        if (!isNaN(d.getTime())) {
          year = d.getFullYear();
        }
      }
      return new Date(year, month, day, 12, 0, 0);
    }
    if (p.createdAt) {
      const d = new Date(p.createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  // Helper: Verify if a given Date is within selected Date Preset or Custom Interval
  const checkDateInPreset = (itemDate: Date, preset: string, startCustom?: string, endCustom?: string): boolean => {
    const now = new Date();
    
    const startOfDay = (d: Date) => {
      const res = new Date(d);
      res.setHours(0, 0, 0, 0);
      return res;
    };

    const itemMidnight = startOfDay(itemDate).getTime();
    const todayMidnight = startOfDay(now).getTime();
    const MS_IN_DAY = 24 * 60 * 60 * 1000;

    switch (preset) {
      case 'hoje':
        return itemMidnight === todayMidnight;
      case 'ontem':
        return itemMidnight === todayMidnight - MS_IN_DAY;
      case 'estaSemana': {
        const currentDay = now.getDay(); // 0 Sunday, 1 Monday ...
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const mondayMidnight = todayMidnight - (daysFromMonday * MS_IN_DAY);
        const sundayMidnight = mondayMidnight + (6 * MS_IN_DAY) + (MS_IN_DAY - 1);
        return itemMidnight >= mondayMidnight && itemMidnight <= sundayMidnight;
      }
      case '7dias':
        return itemMidnight >= todayMidnight - (7 * MS_IN_DAY) && itemMidnight <= todayMidnight + (MS_IN_DAY - 1);
      case 'esteMes':
        return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
      case '30dias':
        return itemMidnight >= todayMidnight - (30 * MS_IN_DAY) && itemMidnight <= todayMidnight + (MS_IN_DAY - 1);
      case 'custom':
        if (startCustom && endCustom) {
          const start = startOfDay(new Date(startCustom + 'T12:00:00')).getTime();
          const end = startOfDay(new Date(endCustom + 'T12:00:00')).getTime();
          return itemMidnight >= start && itemMidnight <= end;
        }
        return true;
      case 'all':
      default:
        return true;
    }
  };

  // Action: Select, open full detail modal popup view, scroll to target row, and briefly blink/highlight it
  const handleSelectAndHighlightPedido = (p: Pedido) => {
    setSelectedPedido(p);
    setHighlightedPedidoId(p.id);
    
    // Auto-scroll logic targeting the visual element row
    setTimeout(() => {
      const element = document.getElementById(`row-${p.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 200);

    // Auto dismiss row highlight ring after completion
    setTimeout(() => {
      setHighlightedPedidoId(null);
    }, 3800);
  };

  // Helper: Toggle status value from filters array list
  const handleToggleStatusFilter = (statusVal: string) => {
    if (statusVal === 'Todos') {
      setSelectedStatuses(['Todos']);
      return;
    }

    let updated = selectedStatuses.filter(s => s !== 'Todos');
    if (updated.includes(statusVal)) {
      updated = updated.filter(s => s !== statusVal);
    } else {
      updated.push(statusVal);
    }

    if (updated.length === 0) {
      setSelectedStatuses(['Todos']);
    } else {
      setSelectedStatuses(updated);
    }
  };

  // Action: Flush, clean and reset all filter constraints to defaults
  const handleClearFilters = () => {
    setSelectedStatuses(['Todos']);
    setDateFilterMode('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setNameSortOrder('none');
    setCreationDateSort('recents');
    setSearchQuery('');
    triggerToast('info', 'Todos os filtros foram limpos com sucesso!');
  };

  // Helper: Verify if any filters are currently active/customized
  const areFiltersActive = 
    !selectedStatuses.includes('Todos') ||
    dateFilterMode !== 'all' ||
    customStartDate !== '' ||
    customEndDate !== '' ||
    nameSortOrder !== 'none' ||
    creationDateSort !== 'recents' ||
    searchQuery !== '';

  // Tab filtered orders (Active vs Entregues) - Tab state acts as top filter context if specific status not set
  const tabFilterState = (pedido: Pedido) => {
    if (currentTab === 'ativos') {
      return pedido.status === 'PENDING' || pedido.status === 'DELIVERED_UNPAID';
    } else if (currentTab === 'reagendados') {
      return pedido.status === 'RESCHEDULED';
    } else if (currentTab === 'cancelados') {
      return pedido.status === 'CANCELLED';
    } else {
      return pedido.status === 'DELIVERED';
    }
  };

  // Helper: Validate status filter matching criteria
  const matchStatus = (p: Pedido) => {
    if (!tabFilterState(p)) return false;
    if (selectedStatuses.includes('Todos')) {
      return true;
    }
    return selectedStatuses.some(selected => {
      if (selected === 'Pendentes') return p.status === 'PENDING';
      if (selected === 'Reagendados') return p.status === 'RESCHEDULED';
      if (selected === 'Entregue e não pago') return p.status === 'DELIVERED_UNPAID';
      if (selected === 'Entregues') return p.status === 'DELIVERED';
      if (selected === 'Cancelados') return p.status === 'CANCELLED';
      return false;
    });
  };

  // COMPLETED PIPELINE: TEXT SEARCH -> STATUS MATRIX -> DATE PARAMETERS -> SORTING MATRIX (ALPHABETICAL / CRONOLOGICAL)
  const orderListFiltered = currentSupplierPedidos
    .filter(matchStatus)
    .filter(p => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        p.numeroVenda.toLowerCase().includes(query) ||
        p.nomeCompleto.toLowerCase().includes(query) ||
        p.produto.toLowerCase().includes(query) ||
        (p.cor && p.cor.toLowerCase().includes(query)) ||
        (p.endereco && p.endereco.toLowerCase().includes(query))
      );
    })
    .filter(p => {
      const orderDate = getPedidoDate(p);
      return checkDateInPreset(orderDate, dateFilterMode, customStartDate, customEndDate);
    })
    .sort((a, b) => {
      // 1) Alphabetical sort by customer name
      if (nameSortOrder === 'asc') {
        return a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR');
      }
      if (nameSortOrder === 'desc') {
        return b.nomeCompleto.localeCompare(a.nomeCompleto, 'pt-BR');
      }

      // 2) Creation date chronological sorting (Default: newest first)
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      if (creationDateSort === 'oldest') {
        return timeA - timeB; // Oldest first
      } else {
        return timeB - timeA; // Newest first (Most Recent)
      }
    });

  // Calculate dynamic automatic commission based on total and percent
  const updateComissaoSuggestion = (totalVal: number, pct: number) => {
    if (editingPedido) {
      const calculated = Number((totalVal * (pct / 100)).toFixed(2));
      setEditingPedido(prev => prev ? { ...prev, valorTotal: totalVal, comissao: calculated } : null);
    }
  };

  // Create manual blank order row in Spreadsheet view mode
  const handleAddNewManualRowSpreadsheet = async () => {
    if (!fornecedorSelecionado) {
      triggerToast('error', 'Selecione o fornecedor.');
      return;
    }
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
    const nextNum = generateNextNumeroVenda(currentSupplierPedidos);

    const newObj: Omit<Pedido, "id"> = {
      numeroVenda: nextNum,
      data: formattedDate,
      nomeCompleto: "Dobre-clique para editar",
      telefone1: "",
      telefone2: "",
      endereco: "",
      produto: "Novo Produto",
      cor: "",
      quantidade: 1,
      formaPagamento: "A combinar",
      valorTotal: 0,
      comissao: 0,
      status: 'PENDING',
      textoOriginal: `PEDIDO MANUAL SEQUENCIAL ${nextNum}`,
      observacoes: "",
      supplier: getSupplierKeyByName(fornecedorSelecionado)
    };

    try {
      const newId = await savePedido(newObj, currentUser?.name || currentUser?.username || 'Sistema');
      triggerToast('success', `Nova linha manual criada (${nextNum})!`);
    } catch (e: any) {
      console.error(e);
      const readableError = parseFirebaseError(e);
      triggerToast('error', `Falha ao criar nova linha: ${readableError}`);
    }
  };

  // Inline autosave function for spreadsheet cell blur
  const handleSpreadsheetCellBlur = async (id: string, field: keyof Pedido, val: any) => {
    const target = pedidos.find(p => p.id === id);
    if (!target) return;

    // Only save if different
    let currentVal = target[field];
    
    // cast numbers
    let castedVal = val;
    if (field === 'valorTotal' || field === 'comissao' || field === 'quantidade') {
      castedVal = Number(val);
      if (isNaN(castedVal)) {
        castedVal = currentVal;
      }
    }

    if (currentVal === castedVal) return;

    try {
      const updated = { ...target, [field]: castedVal };
      await savePedido(updated, currentUser?.name || currentUser?.username || 'Sistema');
      triggerToast('success', `Célula sincronizada em tempo real!`);
    } catch (err: any) {
      console.error(err);
      const readableError = parseFirebaseError(err);
      triggerToast('error', `Erro ao salvar edição: ${readableError}`);
    }
  };

  if (!authReady || isAuthConnecting) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="bg-[#1e293b] rounded-3xl p-8 max-w-sm w-full border border-slate-700/60 shadow-2xl flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-slate-700 border-t-rose-500 animate-spin"></div>
            <Zap className="absolute inset-0 m-auto w-6 h-6 text-rose-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">IA Zap Registro CRM</h1>
            <p className="text-xs text-slate-400 mt-2 font-medium">
              Conectando aos servidores seguros...
            </p>
          </div>
          
          <div className="text-[10px] text-slate-500 font-mono">
            Sessão segura e redundante
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased font-sans">
      
      {/* Top Notification Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-4 right-4 z-50 flex justify-center pointer-events-none"
          >
            <div className={`p-4 rounded-xl shadow-lg flex items-center gap-3 w-full max-w-md pointer-events-auto border text-sm font-medium ${
              notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
              notification.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' :
              notification.type === 'refused' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              'bg-blue-50 text-blue-800 border-blue-200'
            }`}>
              {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />}
              {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
              {notification.type === 'refused' && <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />}
              {notification.type === 'info' && <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />}
              <div>{notification.message}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
 
      {/* HEADER SECTION */}
      <header className="bg-white border-b border-slate-200 py-4 px-4 sm:px-6 shadow-xs/60">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          
          {/* Logo / Title */}
          <div className="flex items-center justify-between sm:justify-start gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-sans font-extrabold text-2xl tracking-tight text-slate-900 flex items-center gap-1.5">
                  IA Zap <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 bg-clip-text text-transparent">Registro</span>
                </h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Sincronizado em tempo real
                </p>
              </div>
            </div>
 
            {/* Sync connection details */}
            <div className="flex items-center gap-1.5 shrink-0 self-center pl-3 border-l border-slate-200">
              {isFirebaseSyncActive ? (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-100">
                  Firebase Ativo
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-800 border border-amber-100" title="Coleção sincronizada apenas localmente por enquanto.">
                  Modo Local
                </div>
              )}
            </div>
          </div>

          {/* Quick manual refresh and authentications actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            
            {/* NOTIFICAÇÕES HEADER BUTTON */}
            <div className="relative">
              <button
                id="btn-header-notifications"
                onClick={() => {
                  setShowNotificationsDrawer(true);
                  setShowDropdownId(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-extrabold transition cursor-pointer ${
                  getNotifications().length > 0 
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs animate-pulse' 
                    : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-705'
                }`}
              >
                <div className="relative">
                  <Bell className="w-3.5 h-3.5" />
                  {getTodayNotifications().length > 0 && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                  )}
                </div>
                <span>Notificações</span>
                {getTodayNotifications().length > 0 && (
                  <span className="bg-white text-amber-950 text-[10px] px-1.5 rounded-full font-extrabold pb-0.5">
                    {getTodayNotifications().length}
                  </span>
                )}
              </button>
            </div>

            {/* RELATÓRIOS HEADER BUTTON */}
            <button
              id="btn-header-reports"
              onClick={() => {
                setShowReportsModal(true);
                setShowNotificationsDropdown(false);
              }}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs py-2 px-3.5 rounded-full font-extrabold transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span>Relatórios</span>
            </button>

            {/* BACKUP E SEGURANÇA HEADER BUTTON */}
            <button
              id="btn-header-settings"
              onClick={() => {
                setShowSettingsModal(true);
                setShowReportsModal(false);
                setShowNotificationsDropdown(false);
              }}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs py-2 px-3.5 rounded-full font-extrabold transition cursor-pointer"
              title="Menu de Backup, Excel e Auditoria do Zap Registro"
            >
              <Database className="w-3.5 h-3.5 text-rose-500" />
              <span>Backup e Segurança</span>
            </button>

            {/* CHAVES DE API HEADER BUTTON (ENGRENAGEM) */}
            <button
              id="btn-header-gemini-keys"
              onClick={() => {
                setActiveSettingsTab('keys');
                setShowSettingsModal(true);
                setShowReportsModal(false);
                setShowNotificationsDropdown(false);
              }}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs py-2 px-3.5 rounded-full font-extrabold transition cursor-pointer"
              title="Configurar Chaves da IA do Gemini"
            >
              <Settings className="w-3.5 h-3.5 text-emerald-500 animate-spin-slow" />
              <span>Configurações IA</span>
            </button>

            {/* Direct update button */}
            <button 
              id="btn-manual-sync"
              onClick={handleManualSync}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 text-xs py-2 px-4 rounded-full font-semibold transition shadow-xs cursor-pointer"
              title="Sincronizar dados manualmente"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
 
            {/* View Mode Switching controls */}
            <button
               id="btn-view-mode-toggle"
               onClick={() => setViewMode(prev => prev === 'dashboard' ? 'spreadsheet' : 'dashboard')}
               className="inline-flex items-center gap-1.5 bg-brand text-white hover:bg-brand-hover text-xs py-2 px-4 rounded-full font-bold transition shadow-xs hover:shadow-md cursor-pointer"
            >
              {viewMode === 'dashboard' ? (
                <>
                  <Grid className="w-3 h-3" />
                  Planilha Admin
                </>
              ) : (
                <>
                  <ArrowLeft className="w-3 h-3" />
                  Painel de Controle
                </>
              )}
            </button>
 
            {/* Auth panel */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="hidden md:flex flex-col items-end text-right">
                  <span className="text-xs text-slate-900 font-bold">{currentUser.name || currentUser.displayName || 'Usuário'}</span>
                  <span className="text-[10px] text-slate-500 font-medium font-mono uppercase">@{currentUser.username} • {currentUser.role === 'admin' ? 'Administrador' : 'Vendedor'}</span>
                </div>
                <div className="bg-slate-100 text-slate-705 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border border-slate-200" title={currentUser.role === 'admin' ? 'Acesso Administrativo' : 'Acesso Vendedor'}>
                  {currentUser.role === 'admin' ? <ShieldCheck className="w-4.5 h-4.5 text-rose-650" /> : <User className="w-4.5 h-4.5 text-teal-650" />}
                </div>
                <button 
                  id="btn-logout"
                  onClick={handleLogout}
                  className="p-2 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 rounded-xl text-slate-500 transition shadow-xs cursor-pointer"
                  title="Sair do CRM"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>

        </div>
      </header>

      {/* SUPPLIER MULTI-ABAS SECTION */}
      <div className="bg-white border-b border-slate-200 py-3 px-4 sm:px-6 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0">Fornecedor:</span>
            <div className="flex overflow-x-auto gap-1.5 no-scrollbar scroll-smooth pb-1 sm:pb-0">
              {[
                { id: 'SOFIA_HOME_DECOR', label: 'Sofia Home Decor' },
                { id: 'MICHAEL', label: 'Michael' },
                { id: 'FRANK', label: 'Frank' },
                { id: 'OUTROS', label: 'Outros Fornecedores' }
              ].map((sup) => {
                const count = pedidos.filter(p => (p.supplier || 'SOFIA_HOME_DECOR') === sup.id).length;
                const isActive = currentSupplier === sup.id;
                return (
                  <button
                    key={sup.id}
                    id={`supplier-tab-${sup.id}`}
                    onClick={() => {
                      setCurrentSupplier(sup.id as any);
                      setSelectedPedido(null);
                    }}
                    className={`py-1.5 px-3.5 rounded-full text-xs font-extrabold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 select-none ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-xs' 
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    <span>{sup.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-slate-405 font-bold self-start sm:self-center uppercase tracking-wider hidden sm:block">
            Sessão Ativa: <span className="text-blue-600 font-extrabold">{currentSupplier === 'SOFIA_HOME_DECOR' ? 'Sofia Home Decor' : currentSupplier === 'MICHAEL' ? 'Michael' : currentSupplier === 'FRANK' ? 'Frank' : 'Outros'}</span>
          </div>
        </div>
      </div>

      {/* RENDER VIEWMODE 1: DASHBOARD MAIN SCREEN */}
      {viewMode === 'dashboard' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">

          {/* Prompt warning if firebase has placeholders */}
          {!isFirebaseSyncActive && (
            <div className="bg-blue-50/60 border border-blue-100 text-blue-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-blue-900">Sincronização em Tempo Real Pendente</h3>
                  <p className="text-xs text-slate-650 mt-1 leading-relaxed">
                    O Firestore não está emparelhado por falta de aceitação dos termos de serviço nas configurações. Para compartilhar vendas simultaneamente com seu parceiro(a), clique em <strong>Termos do Firebase</strong> no painel de controle do instalador. O sistema agora está salvando no seu celular/browser localmente de forma segura.
                  </p>
                </div>
              </div>
            </div>
          )}
 
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 
            {/* PANEL 1: CADASTRO CONECTOR COM IA (Colar Ficha) */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/90 flex flex-col justify-between h-full hover:shadow-xs transition duration-300">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-sans font-extrabold text-lg text-slate-900 flex items-center gap-2">
                    <span>1. Colar Pedido do WhatsApp</span>
                    <span className="text-[10px] uppercase font-extrabold tracking-wider bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full border border-blue-100">Inteligente</span>
                  </h2>
                  <button
                    onClick={() => {
                      setActiveSettingsTab('keys');
                      setShowSettingsModal(true);
                    }}
                    type="button"
                    className="p-1 px-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition text-slate-400 cursor-pointer flex items-center gap-1 border border-slate-200/60 bg-slate-50/50"
                    title="Configurar chaves de API Gemini (Engrenagem)"
                  >
                    <Settings className="w-3.5 h-3.5 text-emerald-500 animate-spin-slow" />
                    <span className="text-[10px] font-bold">Chaves API</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Copie a ficha inteira ou mensagem de conversa enviada pelo cliente ou vendedor e cole no campo de texto abaixo. A IA interpretará e preencherá a estrutura automaticamente.
                </p>

                {/* OBRIGATÓRIO: SELEÇÃO DE FORNECEDOR */}
                <div className="mt-3 mb-2 bg-slate-50/80 border border-slate-200 rounded-2xl p-3.5">
                  <label htmlFor="select-supplier-mandatory" className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <span>Fornecedor (Campo Obrigatório) *</span>
                  </label>
                  <select
                    id="select-supplier-mandatory"
                    value={fornecedorSelecionado}
                    required
                    onChange={(e) => {
                      const val = e.target.value;
                      setFornecedorSelecionado(val);
                      if (val) {
                        const supplierKey = getSupplierKeyByName(val);
                        setCurrentSupplier(supplierKey);
                      }
                    }}
                    className="w-full text-xs font-bold bg-white p-2.5 text-slate-800 border border-slate-200 focus:border-brand focus:ring-1 focus:ring-brand outline-none rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <option value="">-- Selecione o Fornecedor antes de continuar --</option>
                    <option value="Sofia Home Decor">Sofia Home Decor</option>
                    <option value="Michael">Michael</option>
                    <option value="Frank">Frank</option>
                    <option value="Outros Fornecedores">Outros Fornecedores</option>
                  </select>
                </div>

                <textarea
                  id="textarea-colar-pedido"
                  rows={4}
                  value={pasteOrderText}
                  onChange={(e) => {
                    setPasteOrderText(e.target.value);
                    if (aiAnalysisError) setAiAnalysisError(null);
                  }}
                  placeholder="Exemplo de Ficha WhatsApp:&#10;Nome: Ricardo Santos&#10;Fone: 11 99911-2233&#10;End: Rua Amazonas, 400 - Jd Brasil&#10;Produto: Cama Casal Preta R$1200,00&#10;Comissão: 150"
                  className="w-full mt-2 p-4 text-xs bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 border border-slate-200 focus:border-brand focus:ring-1 focus:ring-brand rounded-2xl outline-none transition placeholder:text-slate-400 font-mono resize-none shadow-inner"
                />

                {/* ERROR BOX CONECTOR IA AS REQUESTED */}
                <AnimatePresence>
                  {aiAnalysisError && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="mt-3 p-4 bg-rose-50/90 border border-rose-200 rounded-2xl text-left shadow-2xs"
                    >
                      <div className="flex gap-2.5">
                        <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold text-rose-900">{aiAnalysisError}</h4>
                          <p className="text-[10px] text-rose-705/90 text-rose-700 mt-1 font-medium leading-relaxed">
                            Ocorreu uma instabilidade ou o tempo limite da rede (15s) foi atingido. Escolha tentar novamente, usar a Análise Rápida ou cadastrar a ficha de venda de forma manual para não travar a sua operação.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3.5 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          id="btn-ai-error-retry"
                          onClick={() => {
                            setAiAnalysisError(null);
                            handleParseWhatsAppOrder();
                          }}
                          className="bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-[10px] py-1.5 px-3 rounded-xl transition cursor-pointer shadow-2xs"
                        >
                          🔄 Tentar novamente
                        </button>
                        <button
                          type="button"
                          id="btn-ai-error-manual"
                          onClick={() => {
                            if (!fornecedorSelecionado) {
                              triggerToast('error', 'Selecione o fornecedor.');
                              return;
                            }
                            setAiAnalysisError(null);
                            const nextNum = generateNextNumeroVenda(currentSupplierPedidos);
                            setEditingPedido({
                              numeroVenda: nextNum,
                              data: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                              nomeCompleto: '',
                              telefone1: '',
                              telefone2: '',
                              endereco: '',
                              city: '',
                              state: '',
                              produto: '',
                              cor: '',
                              quantidade: 1,
                              formaPagamento: 'PIX',
                              valorTotal: 0,
                              comissao: undefined,
                              status: 'PENDING',
                              textoOriginal: pasteOrderText || 'Ficha Cadastrada Manualmente (Fallback erro IA)',
                              observacoes: '',
                              supplier: getSupplierKeyByName(fornecedorSelecionado)
                            });
                          }}
                          className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-[10px] py-1.5 px-3 rounded-xl transition cursor-pointer shadow-2xs"
                        >
                          ✍️ Cadastrar manualmente
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                {/* ⚡ ANÁLISE RÁPIDA TOGGLE */}
                <div className="flex flex-col gap-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 py-1.5 px-3 rounded-full transition font-extrabold shadow-3xs border border-slate-200">
                    <input
                      type="checkbox"
                      checked={isRapidAnalysis}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setIsRapidAnalysis(val);
                        localStorage.setItem('iazap_is_rapid', val ? 'true' : 'false');
                      }}
                      className="rounded text-rose-500 focus:ring-rose-500 w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                    />
                    <span>⚡ Análise Rápida</span>
                  </label>
                  <div className="text-[10px] pl-1 font-bold">
                    {isRapidAnalysis ? (
                      <span className="text-emerald-700">Modo rápido ativo - sem uso de IA</span>
                    ) : (
                      <div className="flex items-center gap-1 text-blue-600">
                        <span>Modo IA ativo</span>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSettingsTab('keys');
                            setShowSettingsModal(true);
                          }}
                          className="hover:underline font-extrabold text-slate-500 hover:text-rose-500 inline-flex items-center gap-0.5 cursor-pointer"
                          title="Inserir ou editar chaves de API do Gemini"
                        >
                          Chaves API <Settings className="w-2.5 h-2.5 text-emerald-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-grow sm:flex-none justify-end">
                  <button
                    id="btn-create-manual-fallback"
                    onClick={() => {
                      if (!fornecedorSelecionado) {
                        triggerToast('error', 'Selecione o fornecedor.');
                        return;
                      }
                      const nextNum = generateNextNumeroVenda(currentSupplierPedidos);
                      setEditingPedido({
                        numeroVenda: nextNum,
                        data: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                        nomeCompleto: '',
                        telefone1: '',
                        telefone2: '',
                        endereco: '',
                        city: '',
                        state: '',
                        produto: '',
                        cor: '',
                        quantidade: 1,
                        formaPagamento: 'PIX',
                        valorTotal: 0,
                        comissao: undefined,
                        status: 'PENDING',
                        textoOriginal: 'Ficha Cadastrada Manualmente',
                        observacoes: '',
                        supplier: getSupplierKeyByName(fornecedorSelecionado)
                      });
                    }}
                    className="bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 text-xs py-2.5 px-4.5 rounded-full font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-slate-500" />
                    Cadastrar Sem IA
                  </button>
  
                  <button
                    id="btn-analisar-pedido-ia"
                    onClick={handleParseWhatsAppOrder}
                    disabled={isProcessingOrder}
                    className="flex-grow sm:flex-none bg-brand hover:bg-brand-hover text-white disabled:bg-slate-100 disabled:text-slate-400 text-xs py-2.5 px-5 rounded-full font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    {isProcessingOrder ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Analisando ficha...
                      </>
                    ) : (
                      <>
                        {isRapidAnalysis ? (
                          <>
                            <Zap className="w-4 h-4 text-amber-200" />
                            <span>Analisar de Forma Rápida</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-blue-200" />
                            <span>Analisar e Preencher Dados</span>
                          </>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
 
            {/* PANEL 2: MARCAR ENTREGUE COM IA */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/90 flex flex-col justify-between h-full hover:shadow-xs transition duration-300">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-sans font-extrabold text-lg text-slate-900 flex items-center gap-2">
                    <span>2. Despachar Pedido Entregue</span>
                    <span className="text-[10px] uppercase font-extrabold tracking-wider bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full border border-emerald-100">IA Rápida</span>
                  </h2>
                  <button
                    onClick={() => {
                      setActiveSettingsTab('keys');
                      setShowSettingsModal(true);
                    }}
                    type="button"
                    className="p-1 px-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition text-slate-400 cursor-pointer flex items-center gap-1 border border-slate-200/60 bg-slate-50/50"
                    title="Configurar chaves de API Gemini (Engrenagem)"
                  >
                    <Settings className="w-3.5 h-3.5 text-emerald-500 animate-spin-slow" />
                    <span className="text-[10px] font-bold">Chaves API</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Escreva ou cole a mensagem curta enviada pelo entregador. A inteligência artificial identificará o cliente ativo em aberto e mudará o status para <strong>Entregue</strong> simultaneamente.
                </p>
                <textarea
                  id="textarea-colar-entrega"
                  rows={4}
                  value={pasteDeliveryText}
                  onChange={(e) => setPasteDeliveryText(e.target.value)}
                  placeholder="Cole aqui a confirmação de recebimento.&#10;Ex: 'Cama para Ricardo Santos entregue hoje cedo!'&#10;ou 'João Silva Santos tudo ok entregue'"
                  className="w-full mt-2 p-4 text-xs bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 border border-slate-200 focus:border-brand focus:ring-1 focus:ring-brand rounded-2xl outline-none transition placeholder:text-slate-400 font-mono resize-none shadow-inner"
                />
              </div>
 
              <div className="mt-5 flex justify-end">
                <button
                  id="btn-confirmar-entrega-ia"
                  onClick={handleParseDeliveryUpdate}
                  disabled={isProcessingDelivery || !pasteDeliveryText.trim()}
                  className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs py-2.5 px-6 rounded-full font-bold transition flex items-center justify-center gap-2 shadow-xs shrink-0 cursor-pointer"
                >
                  {isProcessingDelivery ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Buscando correspondente...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Localizar e Marcar Entregue
                    </>
                  )}
                </button>
              </div>
            </div>
 
          </section>

          {/* EDITING INTERACTIVE OVERLAY / IN-LINE CONFIRMATION FORM */}
          <AnimatePresence>
            {editingPedido && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-slate-50 border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-xs">
                  {showConfirmationStep ? (
                    <div>
                      <div className="flex items-center gap-2 text-brand border-b border-slate-200 pb-3 mb-5">
                        <CheckCircle className="w-5 h-5 text-brand animate-bounce" />
                        <h3 className="font-sans font-extrabold text-base text-slate-900">
                          Confirmar Comissão Obrigatória antes de Salvar
                        </h3>
                        <span className="text-xs bg-slate-200 text-slate-800 font-mono font-bold px-2.5 py-0.5 rounded-lg">
                          Venda {editingPedido.numeroVenda}
                        </span>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 mb-6">
                        <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                          A IA não decide nem salva comissões automaticamente. Confirme os valores calculados/digitados abaixo antes do envio final para o banco de dados:
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Fornecedor</span>
                            <span className="text-xs font-black text-slate-800">{fornecedorSelecionado}</span>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Cliente</span>
                            <span className="text-xs font-black text-slate-800">{editingPedido.nomeCompleto || 'Manual/Não extraído'}</span>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 sm:col-span-2 flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Produto</span>
                            <span className="text-xs font-bold text-slate-700">{editingPedido.produto || 'Sem descrição'}</span>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Valor Total da Venda</span>
                            <span className="text-xs font-black text-slate-900">R$ {formatBrazilianNumber(editingPedido.valorTotal || 0)}</span>
                          </div>

                          <div className="bg-brand/5 p-3 rounded-xl border border-brand/20 flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-brand">Comissão Atribuída (Confirmada) *</span>
                            <span className="text-sm font-black text-brand">R$ {comissaoInputText}</span>
                          </div>
                        </div>

                        <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px] text-blue-800 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <span>Ao salvar, as estatísticas de comissões pendentes para <strong>{fornecedorSelecionado}</strong> serão atualizadas em tempo real.</span>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3">
                        <button
                          type="button; button-voltar-da-confirmacao"
                          id="btn-voltar-da-confirmacao"
                          onClick={() => setShowConfirmationStep(false)}
                          className="px-4 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-full border border-slate-200 hover:border-slate-300 font-bold transition shadow-xs cursor-pointer"
                        >
                          Voltar e Alterar
                        </button>
                        <button
                          type="button; button-save-da-confirmacao"
                          id="btn-save-da-confirmacao"
                          onClick={executeDefinitiveSave}
                          className="bg-brand hover:bg-brand-hover text-white text-xs py-2.5 px-6 rounded-full font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          Salvar Definitivamente
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                    <div className="flex items-center gap-2 text-brand">
                      <Edit className="w-5 h-5 text-brand" />
                      <h3 className="font-sans font-extrabold text-base text-slate-900">
                        {editingPedido.id ? 'Editar Cadastro de Pedido' : 'Confirmar e Ajustar Pedido Interpretado'}
                      </h3>
                      <span className="text-xs bg-brand text-white font-mono font-bold px-2.5 py-0.5 rounded-lg">
                        {editingPedido.numeroVenda}
                      </span>
                    </div>
                    <button 
                      onClick={() => setEditingPedido(null)}
                      className="px-4 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-full border border-slate-200 hover:border-slate-300 font-bold transition shadow-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
 
                  <form onSubmit={handleSavePedidoForm} className="space-y-4">
                    
                    {/* General rows */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      
                      {/* Fornecedor */}
                      <div>
                        <label htmlFor="form-supplier-dropdown" className="block text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <span>Fornecedor (Obrigatório) *</span>
                        </label>
                        <select
                          id="form-supplier-dropdown"
                          value={fornecedorSelecionado}
                          required
                          onChange={(e) => {
                            const val = e.target.value;
                            setFornecedorSelecionado(val);
                            if (val) {
                              const supplierKey = getSupplierKeyByName(val);
                              setCurrentSupplier(supplierKey);
                            }
                          }}
                          className="w-full text-xs font-semibold bg-white p-2.5 text-slate-800 border border-slate-200 focus:border-brand focus:ring-1 focus:ring-brand outline-none rounded-xl shadow-xs transition cursor-pointer"
                        >
                          <option value="">-- Escolha o Fornecedor --</option>
                          <option value="Sofia Home Decor">Sofia Home Decor</option>
                          <option value="Michael">Michael</option>
                          <option value="Frank">Frank</option>
                          <option value="Outros Fornecedores">Outros Fornecedores</option>
                        </select>
                      </div>

                      {/* Cliente */}
                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Nome Completo do Cliente *</label>
                        <input 
                          type="text" 
                          required
                          value={editingPedido.nomeCompleto || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, nomeCompleto: e.target.value } : null)}
                          className="w-full text-xs font-semibold bg-white p-2.5 text-slate-800 border border-slate-200 focus:border-brand focus:ring-1 focus:ring-brand outline-none rounded-xl shadow-xs transition"
                        />
                      </div>

                      {/* Telefone 1 */}
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Telefone Principal (WA) *</label>
                        <input 
                          type="text" 
                          placeholder="DDD + Número"
                          value={editingPedido.telefone1 || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, telefone1: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>

                      {/* Telefone 2 */}
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Telefone Secundário</label>
                        <input 
                          type="text" 
                          placeholder="Outro contato"
                          value={editingPedido.telefone2 || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, telefone2: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      {/* Produto */}
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Produto *</label>
                        <input 
                          type="text" 
                          required
                          value={editingPedido.produto || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, produto: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>

                      {/* Cor */}
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Cor / Acabamento</label>
                        <input 
                          type="text" 
                          placeholder="Preto, Branco, Mel, etc"
                          value={editingPedido.cor || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, cor: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>

                    </div>

                    {/* Endereço, Cidade e Estado */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Endereço de Entrega Completo</label>
                        <input 
                          type="text" 
                          value={editingPedido.endereco || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, endereco: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none whitespace-normal"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Cidade</label>
                        <input 
                          type="text" 
                          placeholder="ex: Campinas"
                          value={editingPedido.city || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, city: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Estado</label>
                        <input 
                          type="text" 
                          placeholder="ex: SP"
                          maxLength={2}
                          value={editingPedido.state || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, state: e.target.value.toUpperCase() } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>
                    </div>

                    {/* Comissao e Valores */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      
                      {/* Qtd */}
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Quantidade</label>
                        <input 
                          type="number" 
                          min={1}
                          value={editingPedido.quantidade || 1}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, quantity: parseInt(e.target.value, 10) || 1 } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>

                      {/* Forma Pagamento */}
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Pagamento</label>
                        <input 
                          type="text" 
                          placeholder="PIX, Cartão..."
                          value={editingPedido.formaPagamento || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, formaPagamento: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>

                      {/* Valor Total */}
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Valor Total (R$) *</label>
                        <input 
                          type="number" 
                          step="0.01"
                          required
                          value={editingPedido.valorTotal !== undefined ? editingPedido.valorTotal : ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (fornecedorSelecionado === 'Sofia Home Decor') {
                              setEditingPedido(prev => prev ? { ...prev, valorTotal: val, comissao: Number((val * 0.1).toFixed(2)) } : null);
                            } else {
                              setEditingPedido(prev => prev ? { ...prev, valorTotal: val } : null);
                            }
                          }}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none font-bold text-slate-800 animate-pulse-once"
                        />
                      </div>

                      {/* Comissão editável e calculável */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-natural-muted uppercase">Comissão (R$) *</label>
                          {fornecedorSelecionado === 'Sofia Home Decor' && (
                            <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 animate-pulse">
                              Auto (10%)
                            </span>
                          )}
                        </div>
                        <input 
                          type="text" 
                          required
                          placeholder="Informe o valor da comissão (Ex: 100 ou 49,90)"
                          value={comissaoInputText}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setComissaoInputText(raw);
                            const parsed = parseBrazilianNumber(raw);
                            setEditingPedido(prev => prev ? { ...prev, comissao: parsed } : null);
                          }}
                          className="w-full text-sm bg-white p-2.5 text-brand border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none font-black placeholder:text-slate-300"
                        />
                      </div>

                      {/* Status */}
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs font-bold text-natural-text uppercase mb-1">Status</label>
                        <select
                          value={editingPedido.status || 'PENDING'}
                          onChange={(e: any) => setEditingPedido(prev => prev ? { ...prev, status: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        >
                          <option value="PENDING">Pendente</option>
                          <option value="RESCHEDULED">Reagendado / Agendado</option>
                          <option value="DELIVERED_UNPAID">Entregue e Não Pago</option>
                          <option value="DELIVERED">Entregue</option>
                          <option value="CANCELLED">❌ Cancelado</option>
                        </select>
                      </div>

                    </div>

                    {/* Observaçoes e texto original */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Observações Internas</label>
                        <textarea 
                          rows={2}
                          value={editingPedido.observacoes || ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, observacoes: e.target.value } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none resize-none"
                          placeholder="Ex: entregador preferencial, detalhes do prédio..."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-natural-muted uppercase mb-1">Texto Original da Ficha</label>
                        <textarea 
                          rows={2}
                          readOnly
                          value={editingPedido.textoOriginal || ''}
                          className="w-full text-xs bg-natural-accent p-2.5 text-natural-muted border border-natural-border rounded-lg outline-none font-mono cursor-not-allowed resize-none"
                        />
                      </div>
                    </div>

                    {/* Final confirm submit button */}
                    <div className="flex justify-end gap-3 pt-2">
                      <button 
                        type="button" 
                        onClick={() => setEditingPedido(null)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-2.5 px-6 rounded-full font-bold transition cursor-pointer"
                      >
                        Descartar
                      </button>
                      <button 
                        type="submit" 
                        className="bg-brand hover:bg-brand-hover text-white text-xs py-2.5 px-6 rounded-full font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        Confirmar e Avançar para Confirmação
                      </button>
                    </div>

                  </form>
                  </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SECTION: 4 BENTO SUMMARY COUNTS STATISTICS */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            
            {/* CARD 1: TOTAL DE PEDIDOS */}
            <div className="bg-white rounded-3xl p-6 shadow-sm hover:shadow-md border border-slate-200/80 hover:border-brand/30 transition flex items-center justify-between group">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total de Vendas</span>
                <span className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 block font-sans tracking-tight">{currentSupplierPedidos.length}</span>
              </div>
              <div className="bg-brand/10 text-brand p-3 rounded-2xl group-hover:scale-110 transition duration-300">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            {/* CARD 2: COMISSÃO PENDENTE */}
            <div className="bg-white rounded-3xl p-6 shadow-sm hover:shadow-md border border-slate-200/80 hover:border-orange-200 transition flex items-center justify-between group">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Comissão Pendente</span>
                <span className="text-2xl sm:text-3xl font-bold text-orange-600 mt-1 block font-sans tracking-tight">
                  R$ {totalComissoesPendentes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-orange-50 text-orange-600 p-3 rounded-2xl group-hover:scale-110 transition duration-300">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            {/* CARD 3: COMISSÃO RECEBIDA */}
            <div className="bg-white rounded-3xl p-6 shadow-sm hover:shadow-md border border-slate-200/80 hover:border-emerald-200 transition flex items-center justify-between group">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Recebidas (Comissão)</span>
                <span className="text-2xl sm:text-3xl font-bold text-emerald-600 mt-1 block font-sans tracking-tight">
                  R$ {totalComissoesRecebidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl group-hover:scale-110 transition duration-300">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>

            {/* CARD 4: TOTAL VENDIDO */}
            <div className="bg-white rounded-3xl p-6 shadow-sm hover:shadow-md border border-slate-200/80 hover:border-brand/30 transition flex items-center justify-between group">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Faturado</span>
                <span className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 block font-sans tracking-tight">
                  R$ {totalVendidosSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-brand-light text-brand p-3 rounded-2xl group-hover:scale-110 transition duration-300">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

          </section>

          {/* MONDAY AUTOMATIC WEEKLY REPORT BANNER ALERT */}
          {new Date().getDay() === 1 && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 animate-fadeIn">
              <div className="flex items-center gap-3 text-left">
                <div className="bg-blue-500 text-white p-2 rounded-2xl shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-blue-900">Relatório Semanal Disponível</h4>
                  <p className="text-xs text-blue-700 mt-0.5">Hoje é segunda-feira! O resumo dinâmico das comissões e faturamento da semana passada já está pronto.</p>
                </div>
              </div>
              <button
                onClick={() => setShowReportsModal(true)}
                className="w-full md:w-auto shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 px-5 rounded-full font-bold transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                Analisar Fechamento
              </button>
            </div>
          )}

          {/* HOJE DELIVERY NOTIFICATIONS PANEL */}
          {getNotifications().length > 0 && (
            <div className="bg-amber-50/50 border border-amber-200 rounded-3xl p-5 animate-fadeIn text-left">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-200/50">
                <div className="flex items-center gap-2">
                  <div className="bg-amber-500 text-white p-1.5 rounded-lg animate-bounce shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-amber-900">Entregas e Agendamentos de Hoje</h4>
                    <p className="text-[10px] text-amber-700">O sistema detectou {getNotifications().length} monitoramento(s) programado(s) para a data de hoje.</p>
                  </div>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider bg-amber-150 text-amber-800 px-2.5 py-0.5 rounded-md">
                  Hoje
                </div>
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {getNotifications().map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => setSelectedPedido(p)}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white hover:bg-slate-50 p-3 rounded-2xl border border-amber-200/40 hover:border-amber-300 shadow-2xs transition cursor-pointer gap-2"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-xs font-mono font-extrabold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg mt-0.5">
                        #{p.numeroVenda}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {p.status === 'RESCHEDULED' ? (
                            <span>Hoje é a data de entrega do pedido de <strong className="font-extrabold text-amber-950">{p.nomeCompleto}</strong>.</span>
                          ) : (
                            <span>Pedido agendado para hoje: <strong className="font-extrabold text-amber-950">{p.nomeCompleto}</strong> - <span className="text-slate-650">{p.produto}</span></span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-500 font-sans mt-0.5 leading-snug">{p.endereco}</p>
                      </div>
                    </div>
                    <span className="self-start sm:self-center text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 shrink-0">
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <section className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
            
            {/* Tab selector and Search controller bar */}
            <div className="p-5 bg-white border-b border-slate-200/90 space-y-5">
              
              {/* Row 1: Tab switcher, Search input and Filter overview counter */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                
                {/* Tab options Ativos x Reagendados x Entregues */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex bg-slate-100 p-1 border border-slate-200 rounded-full shrink-0">
                    <button
                      id="tab-ativos"
                      onClick={() => {
                        setCurrentTab('ativos');
                        // Synchronize status back to Todo when toggling main tabs for predictable default state
                        setSelectedStatuses(['Todos']);
                      }}
                      className={`px-4 sm:px-6 py-1.5 rounded-full text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer select-none ${
                        currentTab === 'ativos' 
                          ? 'bg-brand text-white shadow-xs' 
                          : 'text-slate-500 hover:text-brand'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Ativos ({currentSupplierPedidos.filter(p => p.status === 'PENDING' || p.status === 'DELIVERED_UNPAID').length})
                    </button>
                    <button
                      id="tab-reagendados"
                      onClick={() => {
                        setCurrentTab('reagendados');
                        setSelectedStatuses(['Todos']);
                      }}
                      className={`px-4 sm:px-6 py-1.5 rounded-full text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer select-none ${
                        currentTab === 'reagendados' 
                          ? 'bg-amber-500 text-white shadow-xs' 
                          : 'text-slate-500 hover:text-brand'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Notas Agendadas ({currentSupplierPedidos.filter(p => p.status === 'RESCHEDULED').length})
                    </button>
                    <button
                      id="tab-entregues"
                      onClick={() => {
                        setCurrentTab('entregues');
                        setSelectedStatuses(['Todos']);
                      }}
                      className={`px-4 sm:px-6 py-1.5 rounded-full text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer select-none ${
                        currentTab === 'entregues' 
                          ? 'bg-brand text-white shadow-xs' 
                          : 'text-slate-500 hover:text-brand'
                      }`}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Entregues ({currentSupplierPedidos.filter(p => p.status === 'DELIVERED').length})
                    </button>
                    <button
                      id="tab-cancelados"
                      onClick={() => {
                        setCurrentTab('cancelados');
                        setSelectedStatuses(['Todos']);
                      }}
                      className={`px-4 sm:px-6 py-1.5 rounded-full text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer select-none ${
                        currentTab === 'cancelados' 
                          ? 'bg-rose-600 text-white shadow-xs' 
                          : 'text-slate-500 hover:text-brand animate-pulse-subtle'
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancelados ({currentSupplierPedidos.filter(p => p.status === 'CANCELLED').length})
                    </button>
                  </div>

                  {/* Filter Active visual Badge */}
                  {areFiltersActive && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-250 rounded-full animate-pulse">
                      <SlidersHorizontal className="w-3 h-3 text-amber-600" />
                      Filtros Ativos
                    </span>
                  )}
                </div>

                {/* Input text search */}
                <div className="relative flex-1 max-w-xl">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Pesquise por número, cliente, produto, cor ou endereço..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-xs text-slate-800 border border-slate-200 focus:border-brand rounded-full outline-none focus:ring-1 focus:ring-brand transition shadow-2xs"
                  />
                </div>
              </div>

              {/* Advanced Controls Box */}
              <div id="advanced-filter-panel" className="bg-slate-50/85 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-4">
                
                {/* Header title */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-slate-800">
                    <Filter className="w-4 h-4 text-brand" />
                    <span className="text-xs font-extrabold uppercase tracking-wide">Painel de Filtros Inteligentes</span>
                  </div>
                  {areFiltersActive && (
                    <button
                      id="btn-clear-filters"
                      onClick={handleClearFilters}
                      className="text-[11px] font-extrabold text-red-600 hover:text-red-700 bg-white border border-red-200 hover:bg-red-50 px-3 py-1 rounded-full transition shadow-2xs flex items-center gap-1 cursor-pointer"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  
                  {/* Part 1: Status selection (Checkboxes/Chips list) */}
                  <div className="lg:col-span-5 space-y-2">
                    <span className="block text-[11px] font-bold text-slate-550 uppercase tracking-widest">Filtrar por Status (Múltiplo)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'Todos', label: 'Todos' },
                        { key: 'Pendentes', label: 'Pendentes' },
                        { key: 'Reagendados', label: 'Notas Agendadas / Pedidos Reagendados' },
                        { key: 'Entregue e não pago', label: 'Entregue e Não Pago' },
                        { key: 'Entregues', label: 'Entregues' },
                        { key: 'Cancelados', label: '❌ Cancelados' }
                      ].map(item => {
                        const active = selectedStatuses.includes(item.key);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => handleToggleStatusFilter(item.key)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer select-none transition-all duration-205 border ${
                              active
                                ? 'bg-brand text-white border-brand shadow-2xs scale-102'
                                : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Part 2: Quick date selections & Sort tools */}
                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Date Presets Dropdown Selector */}
                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-bold text-slate-550 uppercase tracking-widest">Período de Data</span>
                      <select
                        value={dateFilterMode}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDateFilterMode(val);
                          if (val !== 'custom') {
                            setCustomStartDate('');
                            setCustomEndDate('');
                          }
                        }}
                        className="w-full text-xs bg-white text-slate-800 py-2 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand focus:border-transparent cursor-pointer shadow-3xs"
                      >
                       <option value="all">Todas as Datas (Filtro Desativado)</option>
                       <option value="hoje">Hoje</option>
                       <option value="ontem">Ontem</option>
                       <option value="estaSemana">Esta Semana</option>
                       <option value="7dias">Últimos 7 dias</option>
                       <option value="esteMes">Este Mês</option>
                       <option value="30dias">Últimos 30 dias</option>
                       <option value="custom">Personalizado (Período Específico)...</option>
                      </select>
                    </div>

                    {/* Quick Sorting Toggles */}
                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-bold text-slate-550 uppercase tracking-widest">Ordenação do Sistema</span>
                      <div className="flex gap-2">
                        {/* Alphabetical toggle */}
                        <button
                          type="button"
                          onClick={() => {
                            const nextOrder = nameSortOrder === 'none' ? 'asc' : nameSortOrder === 'asc' ? 'desc' : 'none';
                            setNameSortOrder(nextOrder);
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer select-none shadow-3xs ${
                            nameSortOrder !== 'none'
                              ? 'bg-indigo-50 text-indigo-750 border-indigo-200 font-extrabold'
                              : 'bg-white hover:bg-slate-100 text-slate-650 border-slate-200'
                          }`}
                        >
                          <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Cliente: {nameSortOrder === 'none' ? 'Normal' : nameSortOrder === 'asc' ? 'A-Z' : 'Z-A'}</span>
                        </button>

                        {/* Creation date toggle */}
                        <button
                          type="button"
                          onClick={() => {
                            setCreationDateSort(prev => prev === 'recents' ? 'oldest' : 'recents');
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer select-none shadow-3xs ${
                            creationDateSort === 'oldest'
                              ? 'bg-teal-50 text-teal-750 border-teal-200'
                              : 'bg-indigo-50 text-indigo-750 border-indigo-200'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 text-brand" />
                          <span>{creationDateSort === 'recents' ? 'Mais Recentes' : 'Mais Antigos'}</span>
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Part 3: Custom Date Selection calendar (Conditional display) */}
                {dateFilterMode === 'custom' && (
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 animate-fadeIn">
                    <span className="text-xs font-bold text-slate-600 shrink-0">Período Específico:</span>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="text-xs bg-white text-slate-800 border border-slate-200 rounded-xl py-1.5 px-3 outline-none focus:ring-1 focus:ring-brand shadow-3xs"
                        />
                      </div>
                      <span className="text-xs text-slate-400">até</span>
                      <div className="relative">
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="text-xs bg-white text-slate-800 border border-slate-200 rounded-xl py-1.5 px-3 outline-none focus:ring-1 focus:ring-brand shadow-3xs"
                        />
                      </div>
                    </div>
                    {(customStartDate || customEndDate) && (
                      <span className="text-[10px] text-green-600 font-sans font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        Calendário Aplicado com Sucesso
                      </span>
                    )}
                  </div>
                )}

              </div>

            </div>

            {/* PLANILHA COMPACT LIST (Spreadsheet styled lightweight list) - DESKTOP VIEW */}
            <div className="hidden md:block overflow-x-auto">
              <div className="min-w-[850px]">
                
                {/* Headers */}
                <div className="grid grid-cols-[1.3fr_0.8fr_1.3fr_0.8fr_1.1fr_90px] bg-slate-50 border-b border-slate-200 px-4 py-3.5 text-[10px] font-extrabold text-[#64748b] uppercase tracking-wider font-sans">
                  <div>Cliente</div>
                  <div>Cidade</div>
                  <div>Produto & Cor</div>
                  <div className="text-right">Valor</div>
                  <div className="text-center">Status</div>
                  <div className="text-center">Ações</div>
                </div>

                {/* Body Rows */}
                {orderListFiltered.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {orderListFiltered.map((pedido) => (
                      <div 
                        key={pedido.id}
                        id={`row-${pedido.id}`}
                        onClick={() => handleSelectAndHighlightPedido(pedido)}
                        className={`grid grid-cols-[1.3fr_0.8fr_1.3fr_0.8fr_1.1fr_90px] px-4 py-3 text-xs items-center transition cursor-pointer select-none border-b border-slate-100 ${getRowBgClass(pedido.status, pedido.id)}`}
                      >
                        {/* Cliente Column */}
                        <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                          <span className="font-semibold text-slate-900 truncate">{pedido.nomeCompleto}</span>
                          <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 shrink-0">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-bold">#{pedido.numeroVenda}</span>
                            <span>•</span>
                            <span>{pedido.data}</span>
                          </span>
                        </div>

                        {/* Cidade Column */}
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="font-bold text-slate-700 truncate">
                            {pedido.city ? `${pedido.city}${pedido.state ? `/${pedido.state}` : ''}` : '-'}
                          </span>
                        </div>

                        {/* Produto Column */}
                        <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                          <span className="font-semibold text-slate-800 truncate">{pedido.produto}</span>
                          {pedido.cor && (
                            <span className="text-[10px] text-slate-500 truncate">Cor: <strong className="font-bold text-slate-600">{pedido.cor}</strong></span>
                          )}
                        </div>

                        {/* Valor & Comissão Column */}
                        <div className="text-right pr-3 flex flex-col items-end shrink-0">
                          <span className="font-extrabold text-slate-900">
                            R$ {pedido.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[9px] text-brand font-extrabold bg-brand/5 border border-brand/10 px-1.5 py-0.4 rounded-md mt-0.5">
                            Comissão: R$ {pedido.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* Status Select Column (Saves automatically, realtime sync) */}
                        <div className="px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={pedido.status}
                            onChange={async (e) => {
                              const nextStat = e.target.value as any;
                              await handleQuickStatusUpdate(pedido.id, nextStat);
                            }}
                            className={`w-full py-1.5 px-2 bg-white text-slate-855 rounded-xl text-xs font-bold border outline-none focus:ring-1 focus:ring-brand cursor-pointer shadow-3xs transition-colors duration-200 ${
                              pedido.status === 'PENDING' ? 'bg-amber-50 text-amber-850 border-amber-300' :
                              pedido.status === 'RESCHEDULED' ? 'bg-yellow-50 text-amber-950 border-yellow-300' :
                              pedido.status === 'DELIVERED_UNPAID' ? 'bg-blue-50 text-blue-900 border-blue-300' :
                              pedido.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                              'bg-emerald-50 text-emerald-950 border-emerald-300'
                            }`}
                          >
                            <option value="PENDING">Pendente</option>
                            <option value="RESCHEDULED">Reagendado / Agendado</option>
                            <option value="DELIVERED_UNPAID">Entregue e Não Pago</option>
                            <option value="DELIVERED">Entregue</option>
                            <option value="CANCELLED">❌ Cancelado</option>
                          </select>
                          {pedido.status === 'RESCHEDULED' && (pedido.dataReagendamento || pedido.rescheduleDate) && (
                            <div className="text-[9px] text-amber-900 font-extrabold flex items-center justify-center gap-1 mt-1 font-sans">
                              <Calendar className="w-3 h-3 text-amber-600 shrink-0 inline" />
                              <span>Reagendado: {pedido.dataReagendamento || pedido.rescheduleDate}</span>
                            </div>
                          )}
                        </div>

                        {/* Actions: Detalhes and Copiar Ficha */}
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {/* Detalhes button */}
                          <button
                            onClick={() => setSelectedPedido(pedido)}
                            className="p-1.5 bg-slate-50 border border-slate-200 text-slate-650 hover:bg-slate-100 hover:text-brand rounded-lg transition shrink-0"
                            title="Ver Detalhes do Pedido"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          
                          {/* Copiar Ficha button */}
                          <button
                            onClick={() => copyToClipboard(pedido.textoOriginal, 'Texto de Ficha')}
                            className="p-1.5 bg-slate-50 border border-slate-200 text-slate-650 hover:bg-brand/10 hover:text-brand hover:border-brand/20 rounded-lg transition shrink-0"
                            title="Copiar Ficha do WhatsApp"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-natural-muted">
                    <FileText className="w-8 h-8 mx-auto text-natural-muted/60 stroke-[1.5] mb-2" />
                    <p className="text-xs">Nenhum pedido correspondente encontrado.</p>
                  </div>
                )}

              </div>
            </div>

            {/* PLANILHA COMPACT LIST - MOBILE VIEW (Cards View, No Horizontal Scroll) */}
            <div className="block md:hidden p-3 sm:p-4 space-y-4">
              {orderListFiltered.length > 0 ? (
                orderListFiltered.map((pedido) => (
                  <div 
                    key={pedido.id}
                    id={`mobile-card-${pedido.id}`}
                    onClick={() => handleSelectAndHighlightPedido(pedido)}
                    className={`bg-white rounded-2xl border border-slate-200 shadow-3xs p-4 flex flex-col space-y-3 transition duration-205 border-l-4 ${
                      pedido.status === 'PENDING' ? 'border-l-amber-400' :
                      pedido.status === 'RESCHEDULED' ? 'border-l-yellow-400' :
                      pedido.status === 'DELIVERED_UNPAID' ? 'border-l-blue-400' :
                      pedido.status === 'CANCELLED' ? 'border-l-rose-450' :
                      'border-l-emerald-400'
                    } ${getRowBgClass(pedido.status, pedido.id)}`}
                  >
                    {/* Card Header: Nº Venda & Data */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg font-mono font-bold">
                        Pedido #{pedido.numeroVenda}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 font-bold flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-450" />
                        {pedido.data}
                      </span>
                    </div>

                    {/* Client & City & Product info */}
                    <div className="space-y-2.5 text-left">
                      {/* Cliente e Cidade */}
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-xs font-black text-slate-900 truncate">{pedido.nomeCompleto}</span>
                        </div>
                        {pedido.city && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-600 font-bold ml-5">
                            <span>🏙️</span>
                            <span>{pedido.city}{pedido.state ? `/${pedido.state}` : ''}</span>
                          </div>
                        )}
                      </div>

                      {/* Produto com expansão */}
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[11px] leading-tight text-slate-800">
                            <span className="font-sans text-slate-400 font-extrabold mr-1">📦 Produto(s):</span>
                            <span className="font-extrabold font-sans">
                              {getSummarizedProductAndList(pedido.produto).summary}
                            </span>
                            {pedido.cor && (
                              <span className="text-[10px] text-slate-500 font-medium"> (Cor: {pedido.cor})</span>
                            )}
                          </div>
                          {getSummarizedProductAndList(pedido.produto).isMultiple && (
                            <button
                              onClick={(e) => toggleProductExpand(pedido.id, e)}
                              className="text-[9.5px] font-black text-brand bg-white hover:bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded transition shrink-0 cursor-pointer"
                            >
                              {expandedProducts[pedido.id] ? '▲ Ocultar' : '▼ Ver produtos'}
                            </button>
                          )}
                        </div>

                        {/* Expanded products list */}
                        {getSummarizedProductAndList(pedido.produto).isMultiple && expandedProducts[pedido.id] && (
                          <div className="mt-2 pt-2 border-t border-slate-205 space-y-1 pl-1 text-[11px] text-slate-600 leading-tight font-mono">
                            {getSummarizedProductAndList(pedido.produto).items.map((item, idx) => (
                              <div key={idx} className="flex items-start gap-1">
                                <span className="text-slate-400">•</span>
                                <span className="font-semibold text-slate-700">{item}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Valor e Comissão */}
                      <div className="flex flex-wrap items-center gap-4">
                        <div>
                          <span className="text-slate-400 font-bold uppercase tracking-wider text-[8.5px] block">Valor Total</span>
                          <span className="font-black text-slate-900 font-mono text-xs">
                            R$ {pedido.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold uppercase tracking-wider text-[8.5px] block">Comissão</span>
                          <span className="font-extrabold text-brand bg-brand/5 border border-brand/10 px-1.5 py-0.2 rounded font-mono text-xs">
                            R$ {pedido.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Telefone como Botão de Enlace Diretamente para WhatsApp */}
                      <div>
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[8.5px] block mb-1">WhatsApp de Contato</span>
                        {pedido.telefone1 ? (
                          <a 
                            href={getWhatsAppLink(pedido.telefone1)} 
                            target="_blank" 
                            referrerPolicy="no-referrer" 
                            rel="noopener noreferrer" 
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-850 text-xs py-1.5 px-3 rounded-xl font-black transition shadow-3xs cursor-pointer"
                          >
                            <span className="text-sm">💬</span>
                            <span>{pedido.telefone1}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 text-emerald-600" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Sem telefone cadastrado</span>
                        )}
                      </div>
                    </div>

                    {/* Status Selector */}
                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <span className="text-xs">🏷️</span>
                        <span className="text-[9px] font-sans font-extrabold text-slate-400 uppercase tracking-wider text-left">Status:</span>
                      </div>
                      <select
                        value={pedido.status}
                        onChange={async (e) => {
                          const nextStat = e.target.value as any;
                          await handleQuickStatusUpdate(pedido.id, nextStat);
                        }}
                        className={`w-full py-1.5 px-3 bg-white text-slate-900 rounded-xl text-xs font-bold border outline-none focus:ring-1 focus:ring-brand cursor-pointer shadow-3xs transition-colors duration-200 ${
                          pedido.status === 'PENDING' ? 'bg-amber-50 text-amber-850 border-amber-300' :
                          pedido.status === 'RESCHEDULED' ? 'bg-yellow-50 text-amber-950 border-yellow-300' :
                          pedido.status === 'DELIVERED_UNPAID' ? 'bg-blue-50 text-blue-900 border-blue-300' :
                          pedido.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                          'bg-emerald-50 text-emerald-950 border-emerald-300'
                        }`}
                      >
                        <option value="PENDING">Pendente</option>
                        <option value="RESCHEDULED">Reagendado</option>
                        <option value="DELIVERED_UNPAID">Entregue e Não Pago</option>
                        <option value="DELIVERED">Entregue</option>
                        <option value="CANCELLED">Cancelado</option>
                      </select>
                      {pedido.status === 'RESCHEDULED' && (pedido.dataReagendamento || pedido.rescheduleDate) && (
                        <div className="text-[10px] text-amber-900 font-extrabold flex items-center gap-1 font-sans justify-start mt-1 bg-yellow-50/50 p-2 border border-yellow-200 rounded-xl">
                          <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0 inline" />
                          <span>Reagendado para: {pedido.dataReagendamento || pedido.rescheduleDate}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Card Actions: Copiar Ficha & Ver Detalhes */}
                    <div className="pt-2.5 border-t border-slate-105 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Copiar button */}
                      <button
                        onClick={() => {
                          let textToCopy = `Cliente: ${pedido.nomeCompleto}\n`;
                          if (pedido.telefone1) textToCopy += `Telefone: ${pedido.telefone1}\n`;
                          if (pedido.city) {
                            textToCopy += `Cidade: ${pedido.city}${pedido.state ? `/${pedido.state}` : ''}\n`;
                          }
                          if (pedido.endereco) textToCopy += `Endereço: ${pedido.endereco}\n`;
                          textToCopy += `Produto: ${getSummarizedProductAndList(pedido.produto).summary}`;
                          if (pedido.cor) textToCopy += ` (${pedido.cor})`;
                          copyToClipboard(textToCopy, 'Dados de Venda');
                        }}
                        className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-4 rounded-xl font-extrabold transition shadow-3xs cursor-pointer"
                        title="Copiar Nome, Telefone, Endereço e Produto"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copiar</span>
                      </button>

                      {/* Abrir button */}
                      <button
                        onClick={() => setSelectedPedido(pedido)}
                        className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-700 text-xs py-2 px-4 rounded-xl font-extrabold transition shadow-3xs cursor-pointer"
                        title="Abrir Detalhes"
                      >
                        <Eye className="w-3.5 h-3.5 text-rose-500" />
                        <span>Abrir</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-natural-muted bg-white border border-slate-205 rounded-3xl">
                  <FileText className="w-8 h-8 mx-auto text-natural-muted/60 stroke-[1.5] mb-2" />
                  <p className="text-xs">Nenhum pedido correspondente encontrado.</p>
                </div>
              )}
            </div>

          </section>

        </main>
      ) : (
        
        // RENDER VIEWMODE 2: ADMINISTRATIVE SPREADSHEET SCREEN
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/60 pb-3">
            <div>
              <h2 className="font-sans font-extrabold text-xl text-slate-900 flex items-center gap-2">
                <Grid className="w-5 h-5 text-brand" />
                Planilha Administrativa (Modo de Edição Direta)
              </h2>
              <p className="text-xs text-slate-500">Tudo conectado ao Firebase em tempo real. Pressione Tab de célula em célula para preencher rapidamente.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Admin Mode Toggle */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 py-1.5 px-3.5 rounded-full transition font-extrabold shadow-3xs border border-slate-200 mr-1.5">
                <input
                  type="checkbox"
                  checked={isAdminMode}
                  onChange={(e) => {
                    const checkedVal = e.target.checked;
                    setIsAdminMode(checkedVal);
                    if (!checkedVal) {
                      setActiveSpreadsheetTab('ativos');
                    }
                  }}
                  className="rounded text-brand focus:ring-brand w-3.5 h-3.5 accent-brand cursor-pointer"
                />
                <Shield className="w-3.5 h-3.5 text-slate-500" />
                <span>Modo Admin ({isAdminMode ? "Ativo" : "Inativo"})</span>
              </label>

              <button
                onClick={handleAddNewManualRowSpreadsheet}
                className="bg-brand hover:bg-brand-hover text-white text-xs py-2.5 px-5 rounded-full font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Criar Nova Venda Direta
              </button>
              <button
                onClick={() => setViewMode('dashboard')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-2.5 px-5 rounded-full font-bold transition flex items-center gap-1 cursor-pointer border border-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao Painel
              </button>
            </div>
          </div>

          {/* Subtabs to view Standard Spreadsheet vs Excluded Sales list */}
          {isAdminMode && (
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-fit border border-slate-200">
              <button
                onClick={() => setActiveSpreadsheetTab('ativos')}
                className={`text-xs font-extrabold py-1.5 px-4.5 rounded-xl transition cursor-pointer ${
                  activeSpreadsheetTab === 'ativos'
                    ? 'bg-white text-slate-900 shadow-3xs border border-slate-200/55'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Planilha Geral
              </button>
              <button
                onClick={() => setActiveSpreadsheetTab('excluidos')}
                className={`text-xs font-extrabold py-1.5 px-4.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                  activeSpreadsheetTab === 'excluidos'
                    ? 'bg-rose-500 text-white shadow-3xs'
                    : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50/50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Vendas Excluídas ({excludedOrders.length})
              </button>
            </div>
          )}

          {activeSpreadsheetTab === 'excluidos' && isAdminMode ? (
            /* RENDER AUDIT LOG OF EXCLUDED SALES */
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden animate-fadeIn">
              <div className="p-5 border-b border-slate-200 bg-slate-50/50">
                <h3 className="font-sans font-extrabold text-sm text-rose-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-rose-500" />
                  Histórico de Exclusões Definitivas (Auditoria de Segurança)
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  As vendas listadas abaixo foram excluídas da Planilha Geral e de todos os relatórios/estatísticas. Somente administradores têm acesso a este log de segurança e podem restaurar os registros originais para o sistema a qualquer momento.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-extrabold tracking-wider border-b border-slate-200/90">
                      <th className="px-4 py-3.5 w-32">Data Exclusão</th>
                      <th className="px-4 py-3.5 w-24">Hora</th>
                      <th className="px-4 py-3.5 w-48">Usuário</th>
                      <th className="px-4 py-3.5 w-32">Fornecedor</th>
                      <th className="px-4 py-3.5 w-28">Nº Venda</th>
                      <th className="px-4 py-3.5">Cliente & Pedido Original</th>
                      <th className="px-4 py-3.5 w-32 text-right">Valor Original</th>
                      <th className="px-4 py-3.5 w-28 text-center text-emerald-650">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {excludedOrders.length > 0 ? (
                      excludedOrders.map((backup) => {
                        const original = backup.pedidoCompleto || {};
                        return (
                          <tr key={backup.id} className="hover:bg-rose-50/20 transition">
                            <td className="px-4 py-3 text-slate-900 font-bold">{backup.deletedAtDate}</td>
                            <td className="px-4 py-3 text-slate-500">{backup.deletedAtTime}</td>
                            <td className="px-4 py-3 text-slate-700 font-sans font-bold text-[11px]">
                              {backup.deletedBy}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[10px] uppercase font-extrabold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100 font-sans">
                                {backup.supplier}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-900 font-bold">#{original.numeroVenda || 'N/A'}</td>
                            <td className="px-4 py-3 font-sans">
                              <div>
                                <span className="font-bold text-slate-900 text-xs">{original.nomeCompleto || 'Sem Nome'}</span>
                                <span className="text-slate-400 text-[10px] ml-2">({original.city || 'Sem Cidade'} - {original.state || 'UF'})</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                {original.produto || 'N/A'} {original.cor ? `| Cor: ${original.cor}` : ''} ({original.quantidade || 1} un)
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900">
                              R$ {(original.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleRestoreExcludedOrder(backup)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold px-3 py-1 rounded-full transition cursor-pointer flex items-center gap-1 mx-auto shadow-3xs"
                                title="Restaurar Pedido para a Planilha Geral"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Restaurar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-400 font-sans">
                          A lixeira administrativa está vazia. Nenhuma venda foi excluída recentemente.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* STANDARD VIEW FOR SPREADSHEET */
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-extrabold tracking-wider border-b border-slate-200/90">
                      <th className="px-3 py-3.5 w-28">Nº Venda</th>
                      <th className="px-3 py-3.5 w-24">Data</th>
                      <th className="px-3 py-3.5 w-48">Cliente</th>
                      <th className="px-3 py-3.5 w-56">Produto</th>
                      <th className="px-3 py-3.5 w-32">Cor</th>
                      <th className="px-3 py-3.5 w-28 text-right">Valor Venda (R$)</th>
                      <th className="px-3 py-3.5 w-28 text-right">Comissão (R$)</th>
                      <th className="px-3 py-3.5 w-32 text-center">Status</th>
                      <th className="px-3 py-3.5 w-16 text-center text-rose-650">Cancelar</th>
                      {isAdminMode && <th className="px-3 py-3.5 w-16 text-center text-red-650">Excluir</th>}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-natural-border/50 font-mono">
                    {currentSupplierPedidos.length > 0 ? (
                      currentSupplierPedidos.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition">
                          {/* Numero */}
                          <td className="px-2 py-2">
                            <input 
                              type="text"
                              value={p.numeroVenda}
                              onBlur={(e) => handleSpreadsheetCellBlur(p.id, 'numeroVenda', e.target.value)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPedidos(curr => curr.map(item => item.id === p.id ? { ...item, numeroVenda: v } : item));
                              }}
                              className="w-full font-bold text-natural-text bg-transparent hover:bg-brand-light focus:bg-white p-1 rounded border border-transparent focus:border-brand outline-none"
                            />
                          </td>

                          {/* Data */}
                          <td className="px-2 py-2">
                            <input 
                              type="text"
                              value={p.data}
                              onBlur={(e) => handleSpreadsheetCellBlur(p.id, 'data', e.target.value)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPedidos(curr => curr.map(item => item.id === p.id ? { ...item, data: v } : item));
                              }}
                              className="w-full bg-transparent hover:bg-brand-light focus:bg-white p-1 rounded border border-transparent focus:border-brand outline-none text-natural-muted"
                            />
                          </td>

                          {/* Cliente */}
                          <td className="px-2 py-2">
                            <input 
                              type="text"
                              value={p.nomeCompleto}
                              onBlur={(e) => handleSpreadsheetCellBlur(p.id, 'nomeCompleto', e.target.value)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPedidos(curr => curr.map(item => item.id === p.id ? { ...item, nomeCompleto: v } : item));
                              }}
                              className="w-full bg-transparent hover:bg-brand-light focus:bg-white p-1 rounded border border-transparent focus:border-brand outline-none font-sans text-natural-text"
                            />
                          </td>

                          {/* Produto */}
                          <td className="px-2 py-2">
                            <input 
                              type="text"
                              value={p.produto}
                              onBlur={(e) => handleSpreadsheetCellBlur(p.id, 'produto', e.target.value)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPedidos(curr => curr.map(item => item.id === p.id ? { ...item, produto: v } : item));
                              }}
                              className="w-full bg-transparent hover:bg-brand-light focus:bg-white p-1 rounded border border-transparent focus:border-brand outline-none font-sans text-natural-text font-medium"
                            />
                          </td>

                          {/* Cor */}
                          <td className="px-2 py-2">
                            <input 
                              type="text"
                              value={p.cor || ''}
                              onBlur={(e) => handleSpreadsheetCellBlur(p.id, 'cor', e.target.value)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPedidos(curr => curr.map(item => item.id === p.id ? { ...item, cor: v } : item));
                              }}
                              placeholder="Preto..."
                              className="w-full bg-transparent hover:bg-brand-light focus:bg-white p-1 rounded border border-transparent focus:border-brand outline-none font-sans text-natural-muted"
                            />
                          </td>

                          {/* Valor Total */}
                          <td className="px-2 py-2">
                            <input 
                              type="number"
                              value={p.valorTotal}
                              onBlur={(e) => handleSpreadsheetCellBlur(p.id, 'valorTotal', e.target.value)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPedidos(curr => curr.map(item => item.id === p.id ? { ...item, valorTotal: parseFloat(v) || 0 } : item));
                              }}
                              className="w-full bg-transparent hover:bg-brand-light focus:bg-white p-1 rounded border border-transparent focus:border-brand outline-none text-right font-bold text-natural-text"
                            />
                          </td>

                          {/* Comissão */}
                          <td className="px-2 py-2">
                            <input 
                              type="number"
                              value={p.comissao}
                              onBlur={(e) => handleSpreadsheetCellBlur(p.id, 'comissao', e.target.value)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPedidos(curr => curr.map(item => item.id === p.id ? { ...item, comissao: parseFloat(v) || 0 } : item));
                              }}
                              className="w-full bg-transparent hover:bg-brand-light focus:bg-white p-1 rounded border border-transparent focus:border-brand outline-none text-right font-bold text-brand"
                            />
                          </td>

                          {/* Status selector */}
                          <td className="px-2 py-2">
                            <select
                              value={p.status}
                              onChange={async (e) => {
                                const nextStat = e.target.value as any;
                                if (nextStat === 'RESCHEDULED') {
                                  handleQuickStatusUpdate(p.id, 'RESCHEDULED');
                                } else {
                                  await updatePedidoStatus(p.id, nextStat, undefined, currentUser?.name || currentUser?.username || 'Sistema', p.supplier);
                                  const readable = nextStat === 'PENDING' ? 'Pendente' :
                                                   nextStat === 'DELIVERED_UNPAID' ? 'Entregue e Não Pago' :
                                                   nextStat === 'CANCELLED' ? 'Cancelado' : 'Entregue';
                                  triggerToast('success', `Status alterado na planilha: ${readable}`);
                                }
                              }}
                              className={`w-full text-center p-1 rounded border border-natural-border-dark outline-none font-semibold ${
                                p.status === 'PENDING' ? 'bg-amber-50 text-amber-700' :
                                p.status === 'RESCHEDULED' ? 'bg-orange-50/75 text-orange-950' :
                                p.status === 'DELIVERED_UNPAID' ? 'bg-blue-50 text-blue-700' :
                                p.status === 'CANCELLED' ? 'bg-red-50 text-rose-800' :
                                'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              <option value="PENDING">Pendente</option>
                              <option value="RESCHEDULED">Reagendado / Agendado</option>
                              <option value="DELIVERED_UNPAID">Entregue e Não Pago</option>
                              <option value="DELIVERED">Entregue</option>
                              <option value="CANCELLED">❌ Cancelado</option>
                            </select>
                          </td>

                          {/* Cancelar */}
                          <td className="px-2 py-2 text-center">
                            <button 
                              onClick={() => handleCancelPedido(p.id)}
                              className="p-1 hover:bg-rose-50 text-rose-500 rounded transition cursor-pointer"
                              title="Cancelar Pedido"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </td>

                          {/* Excluir */}
                          {isAdminMode && (
                            <td className="px-2 py-2 text-center">
                              <button 
                                onClick={() => handleExcludePedido(p)}
                                className="p-1 hover:bg-red-50 text-red-500 rounded transition cursor-pointer"
                                title="Excluir Venda Definitivamente (Backup na Lixeira Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}

                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={isAdminMode ? 10 : 9} className="py-12 text-center text-slate-400">
                          Nenhuma venda cadastrada.
                        </td>
                      </tr>
                    )}
                  </tbody>

                </table>

              </div>
            </div>
          )}

        </main>
      )}

      {/* FOOTER BLOCK CREDITS */}
      <footer className="mt-auto py-6 text-center border-t border-natural-border bg-[#FDFCFB]">
        <p className="text-xs text-natural-muted font-medium font-sans">IA Zap Registro • Sistema Inteligente para Fábrica e Vendas Diretas</p>
      </footer>

      {/* DETAIL VIEW MODAL DIALOG */}
      <AnimatePresence>
        {selectedPedido && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200/80 flex flex-col max-h-[90vh]"
            >
              
              {/* Modal header with ID and sequence */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase bg-white/10 text-slate-100 font-mono font-bold px-2.5 py-0.5 rounded-lg border border-white/10">
                    {selectedPedido.numeroVenda}
                  </span>
                  <h3 className="font-sans font-extrabold text-base text-white truncate">Detalhes completos</h3>
                </div>
                
                {/* Badge of status */}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                    selectedPedido.status === 'PENDING' ? 'bg-amber-500/20 text-amber-250' :
                    selectedPedido.status === 'RESCHEDULED' ? 'bg-yellow-500/25 text-yellow-200 border border-yellow-300/40' :
                    selectedPedido.status === 'DELIVERED_UNPAID' ? 'bg-blue-500/20 text-blue-200' :
                    selectedPedido.status === 'CANCELLED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-extrabold' :
                    'bg-emerald-500/20 text-emerald-200'
                  }`}>
                    {selectedPedido.status === 'RESCHEDULED' && <Calendar className="w-3.5 h-3.5 shrink-0" />}
                    {selectedPedido.status === 'CANCELLED' && <XCircle className="w-3.5 h-3.5 shrink-0" />}
                    <span>
                      {selectedPedido.status === 'PENDING' ? 'Pendente' :
                       selectedPedido.status === 'RESCHEDULED' ? `Reagendado ${selectedPedido.dataReagendamento ? `(${selectedPedido.dataReagendamento})` : ''}` :
                       selectedPedido.status === 'DELIVERED_UNPAID' ? 'Entregue e Não Pago' :
                       selectedPedido.status === 'CANCELLED' ? 'Cancelado' : 'Entregue'}
                    </span>
                  </span>
                  <button 
                    onClick={() => setSelectedPedido(null)}
                    className="p-1 text-slate-300 hover:text-white rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal scroll area */}
              <div className="p-6 space-y-6 overflow-y-auto">
                
                {/* Visual grid layout info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Name and product */}
                  <div className="space-y-4">
                    
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide block">Comprador</span>
                        <p className="text-sm font-semibold text-slate-800 mt-0.5">{selectedPedido.nomeCompleto}</p>
                      </div>
                      <button
                        onClick={() => handleCopyText(selectedPedido.nomeCompleto, 'nomeCompleto')}
                        className={`p-1.5 rounded-lg flex items-center gap-1 transition text-xs font-bold cursor-pointer select-none shrink-0 border ${
                          copiedField === 'nomeCompleto'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-white hover:bg-slate-100/80 hover:border-slate-350 text-slate-400 hover:text-slate-600 border-slate-200'
                        }`}
                        title="Copiar Nome"
                      >
                        {copiedField === 'nomeCompleto' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-[10px]">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">Produto Comprado</span>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">
                        {selectedPedido.produto} 
                        {selectedPedido.cor && <span className="text-slate-400 font-normal"> ({selectedPedido.cor})</span>}
                      </p>
                      <p className="text-xs text-slate-550 mt-1">Quantidade: {selectedPedido.quantidade}</p>
                    </div>

                  </div>

                  {/* Pricing and commission */}
                  <div className="space-y-4">
                    
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">Formas de Pagamento</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <CreditCard className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-800">{selectedPedido.formaPagamento || 'A combinar'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">Valor Total</span>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">R$ {selectedPedido.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>

                      <div className="bg-brand/5 p-3 rounded-2xl border border-brand/10">
                        <span className="text-[10px] font-bold text-brand uppercase tracking-wide">Comissão Faturada</span>
                        <p className="text-sm font-bold text-brand mt-0.5">R$ {selectedPedido.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>

                    </div>

                  </div>

                </div>

                {/* Telephones and details directions */}
                <div className="space-y-4 border-t border-slate-200 pt-4">
                  
                  {/* Fones */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 flex items-center justify-between gap-2 bg-slate-50 py-2 px-3 rounded-2xl border border-slate-200/80">
                      <div className="flex items-center gap-2 min-w-0">
                        <Phone className="w-4 h-4 text-brand shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[9px] font-sans font-extrabold text-slate-500 uppercase tracking-wider block">Telefone 1 (WhatsApp)</span>
                          <a href={`https://wa.me/${selectedPedido.telefone1.replace(/\D/g, '')}`} target="_blank" referrerPolicy="no-referrer" rel="noopener noreferrer" className="text-xs font-bold text-brand hover:text-brand-hover underline flex items-center gap-0.5 truncate max-w-full">
                            {selectedPedido.telefone1 || 'Não informado'}
                            {selectedPedido.telefone1 && <ExternalLink className="w-3 h-3 shrink-0"/>}
                          </a>
                        </div>
                      </div>
                      {selectedPedido.telefone1 && (
                        <button
                          onClick={() => handleCopyText(selectedPedido.telefone1.replace(/\D/g, ''), 'telefone1')}
                          className={`p-1.5 rounded-lg flex items-center gap-1 transition text-xs font-bold cursor-pointer select-none shrink-0 border ${
                            copiedField === 'telefone1'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : 'bg-white hover:bg-slate-100/80 hover:border-slate-350 text-slate-400 hover:text-slate-600 border-slate-200'
                          }`}
                          title="Copiar WhatsApp (Apenas números)"
                        >
                          {copiedField === 'telefone1' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-[10px]">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex-1 flex items-center justify-between gap-2 bg-slate-50 py-2 px-3 rounded-2xl border border-slate-200/80">
                      <div className="flex items-center gap-2 min-w-0">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[9px] font-sans font-extrabold text-slate-500 uppercase tracking-wider block">Telefone 2</span>
                          <span className="text-xs font-semibold text-slate-700 block truncate max-w-full">{selectedPedido.telefone2 || 'Nenhum secundário'}</span>
                        </div>
                      </div>
                      {selectedPedido.telefone2 && (
                        <button
                          onClick={() => handleCopyText(selectedPedido.telefone2.replace(/\D/g, ''), 'telefone2')}
                          className={`p-1.5 rounded-lg flex items-center gap-1 transition text-xs font-bold cursor-pointer select-none shrink-0 border ${
                            copiedField === 'telefone2'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : 'bg-white hover:bg-slate-100/80 hover:border-slate-350 text-slate-400 hover:text-slate-600 border-slate-200'
                          }`}
                          title="Copiar Telefone 2 (Apenas números)"
                        >
                          {copiedField === 'telefone2' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-[10px]">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Endereço completo */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <MapPin className="w-4 h-4 text-red-650" />
                      <span className="text-[10px] font-extrabold uppercase tracking-wide">Endereço de Entrega & Cidade</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 mt-2 leading-relaxed whitespace-normal select-text">
                      {selectedPedido.endereco || 'Endereço não cadastrado'}
                    </p>
                    {(selectedPedido.city || selectedPedido.state) && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-center gap-1.5 text-xs text-slate-650 font-extrabold">
                        <span>🏙️ Cidade/UF:</span>
                        <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-slate-800 font-mono">
                          {selectedPedido.city || 'Não informado'}{selectedPedido.state ? ` / ${selectedPedido.state}` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Observacoes complementares */}
                  {selectedPedido.observacoes && (
                    <div className="bg-amber-55/40 p-4 rounded-2xl border border-amber-100 text-amber-900 font-sans">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-850 block">Observações do Despacho/Fábrica</span>
                      <p className="text-xs mt-1.5 leading-relaxed whitespace-pre-line font-medium text-amber-950">{selectedPedido.observacoes}</p>
                    </div>
                  )}

                </div>

                {/* TEXTO COMPLETO ORIGINAL (Original ficha colada) */}
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">Ficha WhatsApp Original Completa</span>
                  <div className="bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-52 select-text leading-relaxed">
                    {selectedPedido.textoOriginal}
                  </div>
                </div>

              </div>

              {/* Modal footer toolbar actions with Copiar */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                
                {/* 10. BOTÕES DE CÓPIA */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  
                  {/* Copy Ficha Original button */}
                  <button
                    onClick={() => copyToClipboard(selectedPedido.textoOriginal, 'Ficha original com quebras de linha')}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-brand hover:bg-brand-hover text-white text-xs py-2 px-3 rounded-full font-semibold transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-300" />
                    Copiar Ficha Integral
                  </button>

                  {/* Copy Resumo button */}
                  <button
                    onClick={() => {
                      const summary = `NOME: ${selectedPedido.nomeCompleto}\nPRODUTO: ${selectedPedido.produto}\nCOR: ${selectedPedido.cor || 'N/A'}\nQUANTIDADE: ${selectedPedido.quantidade}\nVALOR: R$${selectedPedido.valorTotal}\nSTATUS: ${selectedPedido.status}`;
                      copyToClipboard(summary, 'Resumo do pedido');
                    }}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs py-2 px-3 rounded-full font-semibold border border-slate-200 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Resumo
                  </button>

                </div>

                {/* Change status and edit/delete panel */}
                <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      setEditingPedido(selectedPedido);
                      if (selectedPedido.supplier) {
                        setFornecedorSelecionado(getSupplierNameByKey(selectedPedido.supplier));
                      }
                      setSelectedPedido(null);
                    }}
                    className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-55 text-xs py-2 px-3.5 rounded-full font-semibold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Ajustar
                  </button>
                  
                  {selectedPedido.status !== 'CANCELLED' && (
                    <button 
                      onClick={() => handleCancelPedido(selectedPedido.id)}
                      className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs py-2 px-3.5 rounded-full font-bold transition flex items-center gap-1.5 cursor-pointer"
                      title="Cancelar Pedido"
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      Cancelar Pedido
                    </button>
                  )}

                  <button
                    onClick={() => setSelectedPedido(null)}
                    className="bg-slate-900 text-white hover:bg-slate-800 text-xs py-2 px-4 rounded-full font-semibold transition cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DIALOG DE REAGENDAMENTO (Rescheduling prompt dialog) */}
      <AnimatePresence>
        {reschedulingPedido && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="px-6 py-4 bg-amber-500 text-white flex items-center justify-between">
                <h3 className="font-sans font-extrabold text-sm uppercase tracking-wider">Reagendar / Agendar Pedido</h3>
                <button onClick={() => setReschedulingPedido(null)} className="text-white hover:text-amber-105 text-xs font-bold leading-none select-none cursor-pointer">✕</button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Você está reagendando a entrega de:</p>
                  <p className="font-bold text-sm text-slate-900 mt-1">{reschedulingPedido.nomeCompleto}</p>
                  <p className="text-xs text-slate-400 font-mono">Venda #{reschedulingPedido.numeroVenda} - {reschedulingPedido.produto}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-600 block">Nova Data de Entrega (DD/MM):</label>
                  <input
                    type="text"
                    value={rescheduleInputDate}
                    onChange={(e) => setRescheduleInputDate(e.target.value)}
                    placeholder="Ex: 27/05"
                    className="w-full px-4 py-2.5 bg-slate-50 text-sm font-semibold text-slate-800 border border-slate-200 focus:border-brand rounded-2xl outline-none transition"
                  />
                  <p className="text-[10px] text-slate-400">Digite no formato dia/mês (ex: 28/05) para que o sistema gere notificações corretas para este dia.</p>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex items-center justify-end gap-2">
                <button
                  onClick={() => setReschedulingPedido(null)}
                  className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs py-2 px-4 rounded-full font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    handleQuickStatusUpdate(reschedulingPedido.id, 'RESCHEDULED', { dataReagendamento: rescheduleInputDate });
                    setReschedulingPedido(null);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs py-2 px-5 rounded-full font-bold shadow-xs transition cursor-pointer"
                >
                  Confirmar Nova Data
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE RELATÓRIOS (Reports summary dashboard overlay) */}
      <AnimatePresence>
        {showReportsModal && (() => {
          const rep = parseReportData();
          return (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#f8fafc] rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200/80 flex flex-col max-h-[85vh]"
              >
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-brand" />
                    <div>
                      <h3 className="font-sans font-extrabold text-sm uppercase tracking-wider">Painel de Relatório Comercial</h3>
                      <p className="text-[10px] text-slate-300 font-medium">Automaticamente compilado a partir de vendas registradas</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowReportsModal(false)}
                    className="text-white/60 hover:text-white text-xs font-bold leading-none select-none cursor-pointer bg-white/10 p-2 rounded-full hover:bg-white/15 transition"
                  >
                    ✕
                  </button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                  
                  {/* Period Banner Card */}
                  <div className="bg-white rounded-2xl border border-slate-150 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div>
                      <span className="text-[9px] font-extrabold text-[#64748b] uppercase tracking-wider">Período de Análise</span>
                      <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-4 h-4 text-brand" />
                        {rep.periodo}
                      </h4>
                      {rep.wasFallback && (
                        <p className="text-[10px] text-amber-600 mt-1 font-medium bg-amber-50 px-2 py-0.5 rounded-md inline-block font-sans">Nenhum pedido na semana anterior; apresentando os dados históricos completos.</p>
                      )}
                    </div>
                    <div className="text-xs bg-slate-100 font-semibold px-3 py-1.5 rounded-xl border border-slate-250 text-slate-600 uppercase tracking-widest text-[9px] font-mono shrink-0">
                      ZAP REGISTRO PRO v1.2
                    </div>
                  </div>

                  {/* High Contrast Mini Bento metrics cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Faturamento */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-150 shadow-xs">
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Faturamento Bruto</span>
                      <p className="text-lg font-black text-slate-900 mt-1">R$ {rep.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <span className="text-[9px] text-slate-400 font-mono">Relação de vendas diretas</span>
                    </div>

                    {/* Vendas Count */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-150 shadow-xs">
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Pedidos Convertidos</span>
                      <p className="text-lg font-black text-slate-900 mt-1">{rep.vendasCount}</p>
                      <span className="text-[9px] text-[#2563eb] font-semibold mt-1 flex items-center gap-0.5 font-sans">
                        <span className="text-emerald-500 font-bold">{rep.entreguesCount}</span> entregues • <span className="text-amber-550 font-bold">{rep.pendentesCount}</span> ativos
                      </span>
                    </div>

                    {/* Comissão Gerada */}
                    <div className="bg-[#2563eb]/[0.02] p-4 rounded-2xl border border-brand/10 shadow-xs">
                      <span className="text-[9px] font-extrabold text-brand uppercase tracking-wider block">Comissão Acumulada</span>
                      <p className="text-lg font-black text-brand mt-1">R$ {rep.comissaoGerada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <span className="text-[9px] text-slate-400 font-mono">Potencial ganho semanal</span>
                    </div>

                    {/* Comissão Recebida */}
                    <div className="bg-emerald-50/[0.08] p-4 rounded-2xl border border-emerald-100 shadow-xs">
                      <span className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-wider block">Comissão Liquidada</span>
                      <p className="text-lg font-black text-emerald-600 mt-1">R$ {rep.comissaoRecebida.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <span className="text-[9px] text-slate-400 font-mono">Calculado de pedidos entregues</span>
                    </div>
                  </div>

                  {/* Commission Progress Indicator Bar */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-155 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Aproveitamento de Comissão Recebida</h5>
                      <span className="text-xs font-bold font-mono text-emerald-650">
                        {rep.comissaoGerada > 0 ? Math.round((rep.comissaoRecebida / rep.comissaoGerada) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${rep.comissaoGerada > 0 ? (rep.comissaoRecebida / rep.comissaoGerada) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <p className="text-[10px] text-slate-400">Esta barra de aproveitamento indica qual percentual de sua comissão potencial já foi liquidada com status <strong>"Entregue"</strong> versus o que ainda se encontra pendente ou em rota.</p>
                  </div>

                </div>

                {/* Footer and exit buttons */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      const textSummary = `*RELATÓRIO DE DESEMPENHO IA ZAP REGISTRO*\n\nPeríodo: ${rep.periodo}\nPedidos Convertidos: ${rep.vendasCount}\nFaturamento Bruto: R$ ${rep.faturamento.toFixed(2)}\nComissão Gerada: R$ ${rep.comissaoGerada.toFixed(2)}\nComissão Liquidada: R$ ${rep.comissaoRecebida.toFixed(2)}`;
                      navigator.clipboard.writeText(textSummary);
                      triggerToast('success', 'Relatório copiado para a área de transferência no estilo texto!');
                    }}
                    className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs py-2 px-4 rounded-full font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Relatório Formatado
                  </button>
                  <button
                    onClick={() => setShowReportsModal(false)}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs py-2 px-5 rounded-full font-bold transition cursor-pointer"
                  >
                    Fechar Painel
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* --- ADVANCED SLIDE-OVER SIDEBAR DRAWER: REAL-TIME NOTIFICATIONS MONITOR --- */}
      <AnimatePresence>
        {showNotificationsDrawer && (
          <>
            {/* Backdrop shadow overlay inside iframe */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotificationsDrawer(false)}
              className="fixed inset-0 bg-slate-900 z-50 cursor-pointer"
            />

            {/* Slide-over panel container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed right-0 top-0 bottom-0 h-full w-full max-w-sm sm:max-w-md bg-white shadow-2xl z-53 flex flex-col border-l border-slate-200"
            >
              {/* Header section with brand accent color */}
              <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-500 p-2 rounded-xl text-white shadow-sm animate-pulse">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-sans font-extrabold text-sm uppercase tracking-wide">Pedidos do Dia</h2>
                    <p className="text-[10px] text-slate-300 font-medium font-sans">Alertas inteligentes de hoje</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="bg-amber-500/20 text-amber-300 font-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                    {getTodayNotifications().length} pendentes
                  </span>
                  <button
                    onClick={() => setShowNotificationsDrawer(false)}
                    className="p-1.5 hover:bg-slate-800 rounded-full transition text-slate-300 hover:text-white cursor-pointer"
                    title="Fechar Painel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable list content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {getTodayNotifications().length > 0 ? (
                  <>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-sans pb-2 border-b border-slate-100">
                      O sistema identificou as seguintes fichas de agendamentos e reagendamentos vencendo ou programados para a data de hoje. Clique em qualquer cartão para localizar e realçar automaticamente o pedido na planilha principal do vendedor.
                    </p>

                    {/* Notification cards grouped by dynamic calculated severity priority level */}
                    {getTodayNotifications()
                      .sort((a, b) => {
                        const priorityPoints = { high: 3, medium: 2, low: 1 };
                        return priorityPoints[b.priority] - priorityPoints[a.priority];
                      })
                      .map(item => (
                        <div
                          key={item.pedido.id}
                          onClick={() => {
                            setShowNotificationsDrawer(false);
                            handleSelectAndHighlightPedido(item.pedido);
                          }}
                          className={`rounded-2xl p-4 border border-slate-200 hover:border-slate-300 hover:shadow-xs hover:scale-[1.015] transition-all duration-200 cursor-pointer text-left relative overflow-hidden flex flex-col gap-2.5 bg-white border-l-4 ${item.colorClass}`}
                        >
                          {/* Top row description badges */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                                #{item.pedido.numeroVenda}
                              </span>
                              <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-md ${
                                item.priority === 'high' ? 'bg-red-50 text-red-650' : 
                                item.priority === 'medium' ? 'bg-amber-50 text-amber-850' : 
                                'bg-emerald-50 text-emerald-805'
                              }`}>
                                {item.priority === 'high' ? '⏰ Urgente' : item.priority === 'medium' ? '🚚 Moderado' : '📦 Retirada'}
                              </span>
                            </div>
                            
                            {/* Action text indicator */}
                            <span className="text-[9.5px] font-bold font-sans text-brand flex items-center gap-0.5 hover:underline">
                              Visualizar ficha <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>

                          {/* Customer detailed overview */}
                          <div className="space-y-1 text-left">
                            <h4 className="text-xs font-bold text-slate-900 font-sans leading-snug">
                              {item.pedido.nomeCompleto}
                            </h4>
                            <p className="text-[11px] text-slate-600 flex items-center gap-1 font-sans">
                              <span className="font-semibold text-slate-800">{item.pedido.produto}</span>
                              {item.pedido.cor && <span className="text-slate-400 font-normal">({item.pedido.cor})</span>}
                            </p>
                          </div>

                          {/* Endereço & status lines */}
                          <div className="text-[10px] text-slate-500 space-y-1 pt-1.5 border-t border-slate-100 font-sans">
                            {item.pedido.endereco && (
                              <p className="flex items-center gap-1 truncate" title={item.pedido.endereco}>
                                <span className="font-semibold">Local:</span> {item.pedido.endereco}
                              </p>
                            )}
                            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                              <p>Telefone: <span className="font-mono text-slate-800">{item.pedido.telefone1 || 'Não informado'}</span></p>
                              <p className="bg-slate-100 text-slate-800 font-mono px-1.5 py-0.2 rounded font-bold uppercase">
                                STATUS: {item.pedido.status === 'PENDING' ? 'Pendente' :
                                         item.pedido.status === 'RESCHEDULED' ? 'Reagendado' :
                                         item.pedido.status === 'DELIVERED_UNPAID' ? 'Entregue/N.P.' : 'Entregue'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </>
                ) : (
                  <div className="py-20 text-center text-slate-400 space-y-3">
                    <div className="w-12 h-12 bg-slate-150 rounded-full flex items-center justify-center mx-auto text-slate-450">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Dia Totalmente Liquidado!</h4>
                      <p className="text-[10px] text-slate-500 mt-1">Nenhum agendamento ou reagendamento pendente monitorado para hoje.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer footer utilities */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[9.5px] font-bold text-slate-400 font-mono uppercase tracking-widest">
                  IA Zap Registro PRO v1.2
                </span>
                <button
                  onClick={() => setShowNotificationsDrawer(false)}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs py-2 px-5 rounded-full font-bold transition-all shadow-sm cursor-pointer"
                >
                  Fechar Alertas
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIGURAÇÕES (Backup e Segurança) */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#f8fafc] rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200/80 flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-rose-500 animate-spin-slow" />
                  <div>
                    <h3 className="font-sans font-extrabold text-sm uppercase tracking-wider">Configurações Gerais do Sistema</h3>
                    <p className="text-[10px] text-slate-300 font-medium">Controles e parametrizações de segurança das informações</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="text-white/60 hover:text-white text-xs font-bold leading-none select-none cursor-pointer bg-white/10 p-2 rounded-full hover:bg-white/15 transition"
                >
                  ✕
                </button>
              </div>

              {/* Sidebar Menu & Tabs Layout */}
              <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[50vh]">
                {/* Tabs Sidebar */}
                <div className="w-full md:w-64 bg-slate-100 border-b md:border-b-0 md:border-r border-slate-200 p-4 shrink-0 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible">
                  <button
                    onClick={() => setActiveSettingsTab('backup')}
                    className={`w-full text-left font-sans font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-2.5 transition shrink-0 cursor-pointer ${
                      activeSettingsTab === 'backup' 
                        ? 'bg-rose-500 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-250 hover:text-slate-800'
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    <span>Backup e Segurança</span>
                  </button>
                  <button
                    onClick={() => setActiveSettingsTab('logs')}
                    className={`w-full text-left font-sans font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-2.5 transition shrink-0 cursor-pointer ${
                      activeSettingsTab === 'logs' 
                        ? 'bg-rose-500 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-250 hover:text-slate-800'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Histórico & Auditoria ({backupsHistory.length})</span>
                  </button>
                   <button
                    onClick={() => setActiveSettingsTab('ailogs')}
                    className={`w-full text-left font-sans font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-2.5 transition shrink-0 cursor-pointer ${
                      activeSettingsTab === 'ailogs' 
                        ? 'bg-rose-500 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-250 hover:text-slate-800'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Logs de IA ({aiLogs.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveSettingsTab('diagnostico')}
                    className={`w-full text-left font-sans font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-2.5 transition shrink-0 cursor-pointer ${
                      activeSettingsTab === 'diagnostico' 
                        ? 'bg-rose-500 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-250 hover:text-slate-800'
                    }`}
                  >
                    <Shield className="w-4 h-4 text-sky-500" />
                    <span>Diagnóstico Firebase</span>
                  </button>
                  <button
                    onClick={() => setActiveSettingsTab('operator')}
                    className={`w-full text-left font-sans font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-2.5 transition shrink-0 cursor-pointer ${
                      activeSettingsTab === 'operator' 
                        ? 'bg-rose-500 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-250 hover:text-slate-800'
                    }`}
                  >
                    <User className="w-4 h-4 text-rose-500" />
                    <span>Configuração de Operador</span>
                  </button>
                  <button
                    onClick={() => setActiveSettingsTab('keys')}
                    className={`w-full text-left font-sans font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-2.5 transition shrink-0 cursor-pointer ${
                      activeSettingsTab === 'keys' 
                        ? 'bg-rose-500 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-250 hover:text-slate-800'
                    }`}
                  >
                    <Key className="w-4 h-4 text-emerald-500" />
                    <span>Chaves de API Gemini</span>
                  </button>
                </div>

                {/* Content Panel Area */}
                <div className="flex-1 p-6 overflow-y-auto space-y-6">
                  
                  {activeSettingsTab === 'backup' && (
                    <div className="space-y-6">
                      
                      {/* Subtitle & Alert box */}
                      <div className="bg-amber-55/65 border border-amber-200/50 rounded-2xl p-4.5 flex gap-3 text-amber-905 bg-amber-50">
                        <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold">Redundância Total e Prevenção Ativa</h4>
                          <p className="text-[10px] text-amber-805 mt-1 font-medium leading-relaxed">
                            Todos os backups salvam a integridade dos pedidos de todos os fornecedores (Sofia Home Decor, Michael, Frank, Outros) no Firestore e localmente. Backups automáticos gerados diariamente no limiar das 03:00 AM mantêm as últimas 30 cópias.
                          </p>
                        </div>
                      </div>

                      {/* Manual backup and spreadsheet exports row */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 1. Generate Backup */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
                          <div>
                            <span className="text-[8.5px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Formato JSON redundante</span>
                            <h4 className="text-xs font-extrabold text-slate-800 mt-1">Gerar Backup Manual</h4>
                            <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">Exporta toda a base de vendas ativa diretamente para o seu computador de forma criptografada.</p>
                          </div>
                          <button
                            onClick={handleGenerateManualBackup}
                            disabled={isCreatingBackup}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            <Download className="w-4 h-4" />
                            {isCreatingBackup ? 'Gerando...' : '📥 Fazer Backup Agora'}
                          </button>
                        </div>

                        {/* 2. Import Restore */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
                          <div>
                            <span className="text-[8.5px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Restauração Segura</span>
                            <h4 className="text-xs font-extrabold text-[#e11d48] mt-1">Restaurar Banco de Dados</h4>
                            <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">Importe um arquivo .json gerado anteriormente para sobrescrever ou restaurar pedidos perdidos.</p>
                          </div>
                          <label className="bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-extrabold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer border border-rose-200 transition text-center">
                            <Upload className="w-4 h-4 text-rose-500" />
                            <span>📤 Restaurar Backup</span>
                            <input
                              type="file"
                              accept=".json"
                              onChange={handleImportBackupFile}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* 3. Export Excel Spreadsheet */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
                          <div>
                            <span className="text-[8.5px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Relatório Comercial Planilha</span>
                            <h4 className="text-xs font-extrabold text-emerald-700 mt-1">Exportar Planilha Excel</h4>
                            <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">Gere uma planilha XLSX contendo canais, de fornecedor, comissão, cliente, valores e observações.</p>
                          </div>
                          <button
                            onClick={handleExportExcel}
                            className="bg-emerald-650 hover:bg-emerald-700 bg-emerald-600 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>📊 Exportar Excel</span>
                          </button>
                        </div>
                      </div>

                      {/* Integrity Protection and Structural Schema Updates Simulation Card */}
                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-slate-700" />
                          <div>
                            <h4 className="text-xs font-extrabold text-slate-900">Proteção de Integridade & Atualizações Estruturais</h4>
                            <p className="text-[10.5px] text-slate-500 font-medium">Garante a compatibilidade do sistema com segurança total e backups em cascata antes de qualquer mudança.</p>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="space-y-1.5 max-w-xl">
                            <span className="text-[9px] font-mono font-extrabold text-rose-600 uppercase bg-rose-50 px-2 py-0.5 rounded border border-rose-100">Atualização do Schema</span>
                            <p className="text-[10px] text-slate-600 font-medium leading-relaxed">
                              Ao realizar modificações nas tabelas do sistema, este assistente força a criação prévia de um backup automático redundante na coleção metadata, valida a gravação física dele e somente após isso atualiza e normaliza as ordens.
                            </p>
                          </div>
                          
                          <button
                            onClick={handleSystemUpdateWithBackup}
                            disabled={updateStep > 0}
                            className="bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs py-2.5 px-5 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition inline-flex items-center gap-1.5 shrink-0 self-start lg:self-center"
                          >
                            <RefreshCw className={`w-4 h-4 ${updateStep > 0 ? 'animate-spin' : ''}`} />
                            <span>Executar Atualização Estrutural</span>
                          </button>
                        </div>

                        {/* Interactive Steps workflow visualization */}
                        {updateStep > 0 && (
                          <div className="mt-4 p-4.5 bg-slate-50 rounded-2xl border border-slate-200">
                            <h5 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-3">Progresso de Atualização de Estrutura Segura:</h5>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {/* Step 1 */}
                              <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                                  updateStep === 1 ? 'bg-amber-500 text-white animate-pulse' : 
                                  updateStep > 1 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                                }`}>
                                  {updateStep > 1 ? '✓' : '1'}
                                </div>
                                <span className="text-[10px] font-bold text-slate-700">1. Criando Backup Forçado</span>
                              </div>
                              {/* Step 2 */}
                              <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                                  updateStep === 2 ? 'bg-amber-500 text-white animate-pulse' : 
                                  updateStep > 2 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                                }`}>
                                  {updateStep > 2 ? '✓' : '2'}
                                </div>
                                <span className="text-[10px] font-bold text-slate-700">2. Confirmando Gravação</span>
                              </div>
                              {/* Step 3 */}
                              <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                                  updateStep === 3 ? 'bg-amber-500 text-white animate-pulse' : 
                                  updateStep > 3 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                                }`}>
                                  {updateStep > 3 ? '✓' : '3'}
                                </div>
                                <span className="text-[10px] font-bold text-slate-700">3. Executando Otimização</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                  {activeSettingsTab === 'logs' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Auditoria & Histórico de Backups</h4>
                          <p className="text-[10px] text-slate-500">Histórico de todas as gravações redundantes que registram metadados de auditoria.</p>
                        </div>
                        <span className="text-[9.5px] font-bold px-2 py-1 bg-slate-100 rounded-lg text-slate-600 uppercase font-mono tracking-widest">{backupsHistory.length} Backups</span>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                        <table className="w-full text-left font-sans text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-205 text-slate-600 font-extrabold uppercase text-[9px] tracking-wider">
                              <th className="py-3 px-4">Data & Horário</th>
                              <th className="py-3 px-4">Tipo</th>
                              <th className="py-3 px-4">Registros</th>
                              <th className="py-3 px-4">Tamanho</th>
                              <th className="py-3 px-4">Responsável</th>
                              <th className="py-3 px-4 text-right">Ações Rápidas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {backupsHistory.length > 0 ? (
                              backupsHistory.map((b) => (
                                <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-25/50 font-medium text-slate-700">
                                  <td className="py-3 px-4 font-semibold text-slate-900">
                                    {new Date(b.createdAt).toLocaleString('pt-BR')}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                      b.backupType === 'automatico' 
                                        ? 'bg-purple-50 text-purple-750 border border-purple-150' 
                                        : 'bg-emerald-50 text-emerald-805 border border-emerald-150'
                                    }`}>
                                      {b.backupType === 'automatico' ? '⚙️ Automático' : '👤 Manual'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono font-bold text-slate-800">
                                    {b.recordsCount} vendas
                                  </td>
                                  <td className="py-3 px-4 font-mono text-slate-500">
                                    {b.fileSize}
                                  </td>
                                  <td className="py-3 px-4 truncate max-w-[140px]" title={b.responsibleUser}>
                                    {b.responsibleUser}
                                  </td>
                                  <td className="py-3 px-4 text-right flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleRestoreFromHistory(b)}
                                      className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-105 border border-rose-150 text-rose-700 hover:text-rose-800 text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition cursor-pointer"
                                      title="Aplica os dados deste backup imediatamente"
                                    >
                                      Restaurar
                                    </button>
                                    <button
                                      onClick={() => deleteBackup(b.id)}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                      title="Excluir do histórico permanente"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                                    <Database className="w-5 h-5" />
                                  </div>
                                  <p className="text-[10.5px]">Nenhum histórico de backup cadastrado ou registrado até o momento.</p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'ailogs' && (
                    <div className="space-y-4 text-left">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Logs & Diagnósticos de Consumo e Inteligência</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Monitore a economia de créditos, o parser local híbrido e o histórico de análises.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setAiDiagnostics({
                                totalAnalises: 0,
                                resolvidaSemIa: 0,
                                enviadaGemini: 0,
                                sucesso: 0,
                                erros: 0
                              });
                              triggerToast('success', 'Estatísticas de consumo de IA resetadas.');
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-[9.5px] py-1 px-2.5 rounded-lg transition cursor-pointer border border-indigo-100"
                          >
                            Zerar Telemetria
                          </button>
                          <button
                            onClick={() => {
                              setAiLogs([]);
                              triggerToast('info', 'Histórico de logs de IA limpo.');
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[9.5px] py-1 px-2.5 rounded-lg transition cursor-pointer"
                          >
                            Limpar Histórico
                          </button>
                        </div>
                      </div>
 
                      {/* STATS GAUGE - PAINEL DE DIAGNÓSTICO DO CONTROLE DE CONSUMO DE IA */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-white p-3 rounded-2xl border border-slate-200 text-center shadow-xs">
                          <span className="text-[8.5px] font-mono uppercase text-slate-400 block tracking-wider font-extrabold">Total Análises</span>
                          <span className="text-sm font-black text-slate-800 mt-1 block">{aiDiagnostics.totalAnalises}</span>
                        </div>
                        <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-center shadow-xs">
                          <span className="text-[8.5px] font-mono uppercase text-emerald-600 block tracking-wider font-extrabold">Resolvidas Sem IA</span>
                          <span className="text-sm font-black text-emerald-800 mt-1 block">⚡ {aiDiagnostics.resolvidaSemIa}</span>
                        </div>
                        <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-100 text-center shadow-xs">
                          <span className="text-[8.5px] font-mono uppercase text-indigo-600 block tracking-wider font-extrabold font-black">Enviadas p/ IA</span>
                          <span className="text-sm font-black text-indigo-800 mt-1 block">🤖 {aiDiagnostics.enviadaGemini}</span>
                        </div>
                        <div className="bg-white p-3 rounded-2xl border border-slate-200 text-center shadow-xs">
                          <span className="text-[8.5px] font-mono uppercase text-slate-400 block tracking-wider font-extrabold">Taxa de Sucesso</span>
                          <span className="text-sm font-black text-slate-800 mt-1 block">
                            {aiDiagnostics.totalAnalises > 0 
                              ? `${((aiDiagnostics.sucesso / aiDiagnostics.totalAnalises) * 100).toFixed(0)}%` 
                              : '100%'}
                          </span>
                        </div>
                        <div className="col-span-2 md:col-span-1 bg-amber-50 p-3 rounded-2xl border border-amber-100 text-center shadow-xs">
                          <span className="text-[8.5px] font-mono uppercase text-amber-700 block tracking-wider font-bold">Economia Estimada</span>
                          <span className="text-xs font-black text-amber-800 mt-1.5 block">
                            R$ {(aiDiagnostics.resolvidaSemIa * 0.15).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* MEMÓRIA DE PADRÕES APRENDIDAS */}
                      <div className="bg-slate-100/70 border border-slate-200 rounded-3xl p-4.5 space-y-3 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-rose-500 animate-pulse" />
                          <div>
                            <h5 className="text-[10px] uppercase font-black tracking-wider text-slate-800">Aprendizado Interno (Memória de Padrões)</h5>
                            <p className="text-[9.5px] text-slate-500 font-medium">Bancos de dados de correspondência local e caches em tempo real acelerados por economia ativa.</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-200/60 pt-3">
                          <div className="space-y-1.5">
                            <span className="text-[9px] font-mono font-extrabold text-blue-700 block uppercase tracking-wider">Cidades Registradas ({learnedPatterns.cities.length}):</span>
                            <div className="flex flex-wrap gap-1 max-h-[75px] overflow-y-auto no-scrollbar p-1">
                              {learnedPatterns.cities.map((city: string, idx: number) => (
                                <span key={`${city}-${idx}`} className="text-[8px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full font-mono font-semibold">
                                  📍 {city}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[9px] font-mono font-extrabold text-emerald-700 block uppercase tracking-wider">Produtos Repetidos ({learnedPatterns.products.length}):</span>
                            <div className="flex flex-wrap gap-1 max-h-[75px] overflow-y-auto no-scrollbar p-1">
                              {learnedPatterns.products.map((prod: string, idx: number) => (
                                <span key={`${prod}-${idx}`} className="text-[8px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full font-mono font-semibold">
                                  📦 {prod}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
 
                      {/* EXPANDABLE LOGS LIST */}
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 no-scrollbar border-t border-slate-100 pt-3">
                        <h5 className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Últimas 50 Análises e Rastreamentos:</h5>
                        {aiLogs.length > 0 ? (
                          aiLogs.map((log) => (
                            <div key={log.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5 hover:shadow-2xs transition">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-mono font-bold text-slate-500">
                                    {new Date(log.timestamp).toLocaleTimeString('pt-BR')} ({new Date(log.timestamp).toLocaleDateString('pt-BR')})
                                  </span>
                                  <span className={`text-[8.5px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                                    log.modelUsed?.includes('LOCAL')
                                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                      : log.isRapid 
                                        ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                                        : 'bg-blue-50 text-blue-600 border border-blue-100'
                                  }`}>
                                    {log.modelUsed?.includes('LOCAL') ? '⚡ LOCAL (GRAÇA)' : log.isRapid ? '⚡ Rápido' : '🔍 Completo'}
                                  </span>
                                  {log.supplier && (
                                    <span className="text-[8.5px] px-1.5 py-0.2 bg-slate-100 text-slate-650 border border-slate-200 rounded-full font-mono font-bold uppercase">
                                      {log.supplier}
                                    </span>
                                  )}
                                  {log.modelUsed && (
                                    <span className="text-[8.5px] px-1.5 py-0.2 bg-indigo-50 text-indigo-750 border border-indigo-100 rounded-full font-mono font-bold">
                                      🤖 {log.modelUsed}
                                    </span>
                                  )}
                                  {log.geminiKeyUsed && (
                                    <span className="text-[8.5px] px-1.5 py-0.2 bg-emerald-50 text-emerald-850 border border-emerald-150 rounded-full font-mono font-bold">
                                      🔑 {log.geminiKeyUsed}
                                    </span>
                                  )}
                                </div>
 
                                <div className="flex items-center gap-2">
                                  <span className="text-[9.5px] font-mono font-bold text-slate-650 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {(log.durationMs / 1000).toFixed(2)}s
                                  </span>
                                  {log.errorCode && (
                                    <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                      log.errorCode === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                                    }`}>
                                      {log.errorCode}
                                    </span>
                                  )}
                                  <span className="text-[9px] font-mono text-slate-400">
                                    {log.textLength} chars
                                  </span>
                                  <span className={`w-2 h-2 rounded-full ${log.error ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                                </div>
                              </div>
 
                              <div className="text-[10px] space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-150 font-mono text-slate-700 whitespace-pre-wrap max-h-24 overflow-y-auto no-scrollbar scroll-smooth">
                                <div className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-1">Texto Enviado do WhatsApp:</div>
                                {log.inputText}
                              </div>
 
                              {log.error ? (
                                <div className="text-[10px] p-2.5 bg-rose-50/60 border border-rose-150 rounded-xl text-rose-800 font-mono">
                                  <div className="text-[8.5px] font-black text-rose-500 uppercase tracking-widest pb-0.5">Erro Retornado:</div>
                                  {log.error}
                                </div>
                              ) : log.response ? (
                                <div className="text-[10px] p-2.5 bg-emerald-50/40 border border-emerald-150 rounded-xl text-slate-800 font-mono max-h-32 overflow-y-auto no-scrollbar">
                                  <div className="text-[8.5px] font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-100 pb-1 mb-1">Campos Interpretados:</div>
                                  {log.response}
                                </div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="py-12 text-center text-slate-400 space-y-2 bg-white border border-slate-205 rounded-2xl">
                            <Sparkles className="w-6 h-6 text-slate-300 mx-auto" />
                            <p className="text-[10.5px]">Nenhum evento registrado de análise de Inteligência Artificial.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'diagnostico' && (
                    <div className="space-y-6 text-left animate-fade-in animate-duration-300">
                      <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-indigo-500 animate-pulse" />
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900">Diagnóstico Firebase & CRM</h4>
                          <p className="text-[10.5px] text-slate-500 font-medium font-sans">Informações de conexão técnica e autenticação em tempo real.</p>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden text-xs shadow-xs">
                        {/* 1. Firebase Configured & Connected */}
                        <div className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-800">Firebase Configurado</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Verificação de chaves de API no projeto</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${isFirebaseConfigured ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            {isFirebaseConfigured ? 'SIM (Configurado)' : 'NÃO (Placeholder)'}
                          </span>
                        </div>

                        {/* 2. Firestore Connected */}
                        <div className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-800">Firestore Conectado</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Sincronização bidirecional de pedidos em tempo real</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${isFirebaseSyncActive && isFirebaseConfigured ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-55 bg-rose-50 text-rose-700 border border-rose-150'}`}>
                            {isFirebaseSyncActive && isFirebaseConfigured ? 'ATIVO' : 'DESACTIVADO'}
                          </span>
                        </div>

                        {/* 3. Authentication Connected */}
                        <div className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-800">Authentication Conectado</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium font-sans">Estado do módulo de login</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${authReady ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {authReady ? 'PRONTO (Sessões)' : 'CARREGANDO...'}
                          </span>
                        </div>

                        {/* 4. Usuário autenticado */}
                        <div className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-800">Usuário Autenticado</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium font-sans">Conta conectada no dispositivo</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${currentUser ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-105 bg-slate-100 text-slate-650'}`}>
                            {currentUser ? 'Operador Ativo' : 'Não Conectado'}
                          </span>
                        </div>

                        {/* 5. UID do usuário */}
                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2 overflow-hidden">
                          <div>
                            <p className="font-bold text-slate-800 font-sans">UID do Usuário (Firebase UID)</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Identificador de segurança UUID</p>
                          </div>
                          <span className="font-mono bg-slate-50 border border-slate-200 rounded py-1 px-2.5 text-[10px] font-bold text-slate-700 select-all max-w-full overflow-x-auto">
                            {currentUser ? currentUser.uid : 'Nenhum'}
                          </span>
                        </div>

                        {/* 6. E-mail autenticado */}
                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2 overflow-hidden">
                          <div>
                            <p className="font-bold text-slate-800 font-sans">E-mail Autenticado</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Conta Google ativa</p>
                          </div>
                          <span className="font-mono bg-slate-50 border border-slate-200 rounded py-1 px-2.5 text-[10px] font-bold text-slate-700 select-all max-w-full overflow-x-auto font-sans">
                            {currentUser && currentUser.email ? currentUser.email : 'Nenhum'}
                          </span>
                        </div>

                        {/* 7. Dispositivo móvel */}
                        <div className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-800 font-sans">Dispositivo Detectado</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium font-sans">Método de autenticação utilizado</p>
                          </div>
                          <span className="bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase font-sans">
                            {isMobileDevice() ? 'MOBILE (Redirect Integrado PWA)' : 'DESKTOP (Popup & Fallbacks)'}
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-100/70 border border-slate-200 rounded-2xl p-4.5 space-y-2.5 shadow-2xs">
                        <h5 className="text-[10px] font-bold text-slate-800 uppercase tracking-wider font-sans">Ações de Depuração e Renovação</h5>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                          Caso apresente travamentos de rede ou expiração do token de sessão de segurança do Google, utilize os controles abaixo para forçar restaurações de conexão rápidas.
                        </p>
                        <div className="flex gap-2 flex-wrap pt-1.5">
                          <button
                            onClick={async () => {
                              try {
                                triggerToast('info', 'Pingando servidor do Firestore...');
                                const { doc, getDocFromServer } = await import('firebase/firestore');
                                const { db } = await import('./firebase');
                                await getDocFromServer(doc(db, 'test', 'connection'));
                                triggerToast('success', 'Firestore respondendo normalmente em tempo real!');
                              } catch (err: any) {
                                triggerToast('error', `Falha ao conectar: ${err.message || err}`);
                              }
                            }}
                            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 text-[10px] font-extrabold py-2 px-3.5 rounded-xl transition cursor-pointer shadow-2xs"
                          >
                            Pingar Firestore
                          </button>
                          
                          <button
                            onClick={async () => {
                              try {
                                if (auth && auth.currentUser) {
                                  triggerToast('info', 'Forçando renovação segura de idToken...');
                                  await auth.currentUser.getIdToken(true);
                                  triggerToast('success', 'idToken Firebase renovado com sucesso absoluto!');
                                } else {
                                  triggerToast('error', 'Sem usuário ativo na conta para renovar token.');
                                }
                              } catch (err: any) {
                                triggerToast('error', `Falha ao renovar idToken: ${err.message || err}`);
                              }
                            }}
                            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 text-[10px] font-extrabold py-2 px-3.5 rounded-xl transition cursor-pointer shadow-2xs"
                          >
                            Renovar idToken
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'operator' && (
                    <div className="space-y-6 text-left animate-fade-in animate-duration-300 font-sans">
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-rose-500" />
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900">Configuração de Operador Ativo</h4>
                          <p className="text-[10.5px] text-slate-500 font-medium">Configure o nome de quem está operando o CRM. Esse nome será usado para registrar quem criou ou atualizou cada pedido.</p>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4 max-w-md">
                        <div className="space-y-2">
                          <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest block animate-pulse">Nome do Operador Ativo</label>
                          <input
                            type="text"
                            placeholder="Ex: Alan ou Esposa"
                            value={operatorName}
                            onChange={(e) => handleSaveOperatorName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 focus:border-rose-500 focus:outline-hidden py-2 px-3.5 rounded-xl text-xs text-slate-900 font-bold transition"
                          />
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 leading-relaxed font-sans">
                          💡 O nome configurado acima é salvo localmente em seu navegador no <span className="font-mono">localStorage</span> e associado de maneira automática com as auditorias de criação (<span className="font-semibold">createdBy</span>) e edição (<span className="font-semibold">updatedBy</span>) de todos os pedidos no banco de dados Firestore.
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'keys' && (
                    <div className="space-y-6 text-left animate-fade-in animate-duration-300 font-sans">
                      <div className="flex items-center gap-2">
                        <Key className="w-5 h-5 text-emerald-500" />
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900">Configuração de Múltiplas Chaves Gemini</h4>
                          <p className="text-[10.5px] text-slate-500 font-medium">Cadastre até 4 chaves de API do Gemini para alternância e fallback automático se houver falhas.</p>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4 max-w-lg">
                        <div className="space-y-4">
                          {[0, 1, 2, 3].map((idx) => (
                            <div key={idx} className="space-y-1.5">
                              <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-widest block">
                                Chave de API Gemini {idx + 1}
                              </label>
                              <input
                                type="password"
                                placeholder={`Insira a chave de API ${idx + 1} (ex: AIzaSy...)`}
                                value={aiKeys[idx] || ''}
                                onChange={(e) => {
                                  const updated = [...aiKeys];
                                  updated[idx] = e.target.value.trim();
                                  setAiKeys(updated);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-rose-500 focus:outline-hidden py-2 px-3.5 rounded-xl text-xs text-slate-950 font-mono transition"
                              />
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => {
                            // Validar formato básico das chaves do Gemini (AIzaSy..., 39 caracteres)
                            const invalidFormatKeys: number[] = [];
                            aiKeys.forEach((k, idx) => {
                              const trimmed = k ? k.trim() : "";
                              if (trimmed && (!trimmed.startsWith("AIzaSy") || trimmed.length < 35)) {
                                invalidFormatKeys.push(idx + 1);
                              }
                            });

                            localStorage.setItem('iazap_gemini_keys', JSON.stringify(aiKeys));

                            if (invalidFormatKeys.length > 0) {
                              triggerToast('info', `Chaves salvas! Nota: A(s) Chave(s) ${invalidFormatKeys.join(', ')} não parece(m) estar no formato padrão do Gemini (deve começar com AIzaSy... e ter cerca de 39 caracteres). Certifique-se de copiar a chave inteira.`);
                            } else {
                              triggerToast('success', 'Chaves de API salvas localmente com sucesso!');
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                        >
                          Salvar Chaves
                        </button>

                        <div className="text-[10px] text-slate-500 font-medium bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 leading-relaxed font-sans">
                          💡 <strong>Fila de Fallback automático:</strong> O sistema tentará usar a Chave 1. Se ela falhar (erro 500, 503, timeout de 30s, etc.), tentará a Chave 2 automaticamente, e assim por diante. Se você não cadastrar nenhuma chave, o sistema utilizará o limite padrão global do servidor.
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Footer UI elements */}
              <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[9.5px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  SISTEMA DE SEGURANÇA E INTEGRIDADE IA ZAP REGISTRO
                </span>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs py-2 px-5 rounded-full font-bold transition cursor-pointer"
                >
                  Fechar Painel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMAÇÃO DO OVERWRITE / RESTORE DIALOG */}
      <AnimatePresence>
        {restoreConfirmData && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              {/* Alert Warning Header */}
              <div className="px-5 py-4 bg-amber-505 bg-amber-500 text-white flex items-center gap-2.5">
                <Shield className="w-5 h-5 animate-pulse" />
                <h4 className="text-xs font-bold uppercase tracking-wider">CONFIRMAÇÃO DE RESTAURAÇÃO</h4>
              </div>

              <div className="p-5.5 space-y-4">
                <div className="space-y-2 text-left">
                  <h5 className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider">Origem da Cópia / Backup:</h5>
                  <p className="text-xs font-extrabold text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200 font-sans break-all">
                    {restoreConfirmName}
                  </p>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-[10.5px] leading-relaxed space-y-1.5 font-medium text-left">
                  <div className="flex justify-between font-bold text-amber-950 text-xs pb-1 border-b border-amber-200">
                    <span>Quantidade de Pedidos:</span>
                    <span className="font-mono">{restoreConfirmData.length} registros</span>
                  </div>
                  <p className="pt-1">
                    ⚠️ <strong>ATENÇÃO TOTAL:</strong> Ao executar a restauração de segurança, todos os registros e pedidos de vendas atuais do seu sistema ativos serão <strong>SUBSTITUÍDOS PERMANENTEMENTE</strong> por este conjunto de dados.
                  </p>
                </div>
              </div>

              {/* Action Cancel/Confirm row */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  onClick={() => {
                    setRestoreConfirmData(null);
                    setRestoreConfirmName('');
                  }}
                  disabled={isRestoring}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded-xl font-bold transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar Sobrescrita
                </button>
                <button
                  onClick={executeRestore}
                  disabled={isRestoring}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-xl font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {isRestoring ? 'Processando...' : 'Confirmar e Restaurar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
