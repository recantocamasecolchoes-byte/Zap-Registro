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
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Pedido, AiAnalysisLog } from './types';
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
  BackupItem
} from './dbService';
import * as XLSX from 'xlsx';
import { 
  auth, 
  googleProvider, 
  isFirebaseConfigured,
  parseFirebaseError
} from './firebase';
import { 
  signInWithPopup, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';

export default function App() {
  // Database state
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isFirebaseSyncActive, setIsFirebaseSyncActive] = useState(isFirebaseConfigured);

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
  const [activeSettingsTab, setActiveSettingsTab] = useState<'backup' | 'logs' | 'ailogs'>('backup');

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

  // Global Toast alerts
  const [notification, setNotification] = useState<{ type: 'success' | 'refused' | 'error' | 'info'; message: string } | null>(null);
  
  // AI Options and Logging
  const [isRapidAnalysis, setIsRapidAnalysis] = useState<boolean>(() => {
    return localStorage.getItem('iazap_is_rapid') === 'true';
  });
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [aiLogs, setAiLogs] = useState<AiAnalysisLog[]>(() => {
    try {
      const stored = localStorage.getItem('iazap_ai_logs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

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

  // Track Firebase connection
  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        setCurrentUser(user);
        setAuthReady(true);
        if (user) {
          triggerToast('success', `Conectado como ${user.displayName || user.email || 'Usuário Autenticado'}`);
        } else {
          try {
            console.log("Iniciando login anônimo automático...");
            await signInAnonymously(auth);
          } catch (err: any) {
            console.error("Falha no login anônimo automático:", err);
            const readableError = parseFirebaseError(err);
            triggerToast('error', `Falha ao conectar automaticamente: ${readableError}`);
          }
        }
      });
      return () => unsubscribeAuth();
    } else {
      setAuthReady(true);
    }
  }, []);

  // Sync / loading Database in Real-time
  useEffect(() => {
    if (isFirebaseConfigured && !currentUser) {
      // Aguarda autenticação antes de se conectar ao Firestore
      return;
    }

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
  }, [currentUser]);

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
        responsibleUser: currentUser?.email || 'Vendedor Autenticado',
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
  const handleGoogleLogin = async () => {
    if (!isFirebaseConfigured) {
      triggerToast('info', 'Firebase não configurado. Ative no painel do AI Studio para habilitar login.');
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error(err);
      triggerToast('error', `Falha ao entrar com Google: ${err.message || 'Erro Desconhecido'}`);
    }
  };

  const handleAnonymousLogin = async () => {
    if (!isFirebaseConfigured) {
      triggerToast('info', 'Firebase não configurado. Usando armazenamento interno.');
      return;
    }
    try {
      await signInAnonymously(auth);
      triggerToast('success', 'Entrou com sucesso de forma anônima!');
    } catch (err: any) {
      console.error(err);
      triggerToast('error', `Falha ao entrar de forma anônima: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    if (!isFirebaseConfigured) return;
    try {
      await signOut(auth);
      setCurrentUser(null);
      triggerToast('info', 'Sessão encerrada.');
    } catch (err: any) {
      triggerToast('error', `Erro ao sair: ${err.message}`);
    }
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

  // 1. CADASTRO INTELIGENTE DE PEDIDOS COM IA (WA Paste Interpreter)
  const handleParseWhatsAppOrder = async () => {
    if (!pasteOrderText.trim()) {
      triggerToast('error', 'Por favor, cole um texto de pedido do WhatsApp.');
      return;
    }

    setIsProcessingOrder(true);
    setAiAnalysisError(null);
    const analysisStartTime = Date.now();
    const textLen = pasteOrderText.length;

    // Create an abort controller for the 15 seconds timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const response = await fetch("/api/gemini/parse-pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteOrderText, rapidMode: isRapidAnalysis }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Servidor retornou código ${response.status}`);
      }

      const resJson = await response.json();
      if (resJson.success && resJson.data) {
        const extracted = resJson.data;
        const durationMs = Date.now() - analysisStartTime;

        // Save successful log
        const newLog: AiAnalysisLog = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
          timestamp: new Date().toISOString(),
          durationMs,
          textLength: textLen,
          inputText: pasteOrderText,
          response: JSON.stringify(extracted, null, 2),
          isRapid: isRapidAnalysis
        };
        setAiLogs(prev => [newLog, ...prev].slice(0, 50));

        // Generate pre-filled structure
        const today = new Date();
        const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
        const nextNum = generateNextNumeroVenda(currentSupplierPedidos);

        // Opcionalmente sugerir valor de comissão (10% se não especificado)
        const totalVal = Number(extracted.valorTotal) || 0;
        let finalComis = Number(extracted.comissaoSugerida) || 0;
        if (finalComis === 0 && totalVal > 0) {
          finalComis = Number((totalVal * (comissaoPercent / 100)).toFixed(2));
        }

         setEditingPedido({
           numeroVenda: nextNum,
           data: formattedDate,
           nomeCompleto: extracted.nomeCompleto || '',
           telefone1: extracted.telefone1 || '',
           telefone2: extracted.telefone2 || '',
           endereco: extracted.endereco || '',
           city: extracted.city || '',
           state: extracted.state || '',
           produto: extracted.produto || '',
           cor: extracted.cor || '',
           quantidade: Number(extracted.quantidade) || 1,
           formaPagamento: extracted.formaPagamento || '',
           valorTotal: totalVal,
           comissao: finalComis,
           status: 'PENDING',
           textoOriginal: pasteOrderText, // Armazena texto original completo com observações, CNPJ, etc.
           observacoes: extracted.observacoes || '',
           supplier: currentSupplier
         });

        triggerToast('success', 'Ficha interpretada pela IA com sucesso! Verifique os dados abaixo.');
      } else {
        throw new Error(resJson.error || "IA não conseguiu interpretar os campos estruturados.");
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - analysisStartTime;
      const isTimeout = error.name === 'AbortError';
      const errorMsg = isTimeout ? 'Análise cancelada devido ao tempo limite de 15 segundos excedido do Gemini.' : (error.message || 'Não foi possível interpretar o pedido.');
      
      console.error("Erro na análise da IA:", error);
      
      // Save error log
      const newLog: AiAnalysisLog = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        durationMs,
        textLength: textLen,
        inputText: pasteOrderText,
        error: errorMsg,
        isRapid: isRapidAnalysis
      };
      setAiLogs(prev => [newLog, ...prev].slice(0, 50));

      // Set explicit error text for display as requested
      setAiAnalysisError("A IA não conseguiu interpretar a ficha.");
      triggerToast('error', 'A IA não conseguiu interpretar a ficha.');
    } finally {
      setIsProcessingOrder(false);
    }
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

      const response = await fetch("/api/gemini/parse-entregue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: pasteDeliveryText, 
          activeOrders 
        })
      });

      if (!response.ok) {
        throw new Error(`Erro do servidor: ${response.status}`);
      }

      const resJson = await response.json();
      if (resJson.success && resJson.matchedOrderId) {
        const matchedId = resJson.matchedOrderId;
        const index = pedidos.find(p => p.id === matchedId);
        
        if (index) {
          await updatePedidoStatus(matchedId, 'DELIVERED');
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
    if (editingPedido.comissao === undefined || isNaN(editingPedido.comissao)) {
      triggerToast('error', 'Campo obrigatório faltando ou incorreto: Comissão.');
      return;
    }

    try {
      // Construct logical payload
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
        supplier: editingPedido.supplier || currentSupplier
      };

      await savePedido(payload);
      
      triggerToast('success', `Pedido ${payload.numeroVenda} de ${payload.nomeCompleto} salvo com sucesso!`);
      
      // Clean form states
      setEditingPedido(null);
      setPasteOrderText('');
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
      await updatePedidoStatus(id, newStatus, extra);
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
      if (p.status !== 'RESCHEDULED' && p.status !== 'PENDING') return null;

      const targetDate = p.dataReagendamento ? p.dataReagendamento : p.data;
      if (!targetDate) return null;

      const cleanTarget = targetDate.trim().replace(/\s/g, '');
      const cleanToday = todayStr;

      if (cleanTarget === cleanToday) {
        let label = '';
        let type: 'delivery' | 'scheduled' | 'rescheduled' = 'delivery';
        let icon = '📦';
        let colorClass = 'border-l-blue-500 bg-blue-50/40';
        let priority: 'high' | 'medium' | 'low' = 'low';

        if (p.dataReagendamento) {
          type = 'rescheduled';
          label = `⏰ Pedido reagendado vence hoje:\n${p.nomeCompleto}`;
          icon = '⏰';
          colorClass = 'border-l-rose-500 bg-rose-50/20';
          priority = 'high';
        } else if (p.status === 'RESCHEDULED') {
          type = 'scheduled';
          label = `🚚 Pedido agendado para hoje:\n${p.nomeCompleto} - ${p.produto}`;
          icon = '🚚';
          colorClass = 'border-l-amber-500 bg-amber-50/20';
          priority = 'medium';
        } else {
          type = 'delivery';
          label = `📦 Hoje é a data de entrega:\n${p.nomeCompleto} - ${p.produto}`;
          icon = '📦';
          colorClass = 'border-l-emerald-500 bg-emerald-50/10';
          priority = 'low';
        }

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
        await updatePedidoStatus(id, 'CANCELLED');
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
    if (selectedStatuses.includes('Todos')) {
      return tabFilterState(p);
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
      supplier: currentSupplier
    };

    try {
      const newId = await savePedido(newObj);
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
      await savePedido(updated);
      triggerToast('success', `Célula sincronizada em tempo real!`);
    } catch (err: any) {
      console.error(err);
      const readableError = parseFirebaseError(err);
      triggerToast('error', `Erro ao salvar edição: ${readableError}`);
    }
  };

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
            {isFirebaseConfigured ? (
              <div className="flex items-center gap-2">
                {currentUser ? (
                  <div className="flex items-center gap-2">
                    <div className="hidden md:flex flex-col items-end text-right">
                      <span className="text-xs text-slate-900 font-bold">{currentUser.displayName || 'Vendedor Autenticado'}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{currentUser.email || 'Conectado'}</span>
                    </div>
                    {currentUser.photoURL ? (
                      <img src={currentUser.photoURL} alt="Foto usuário" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full border border-slate-200 shadow-xs" />
                    ) : (
                      <div className="bg-slate-100 text-slate-700 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs"><User className="w-4 h-4"/></div>
                    )}
                    <button 
                      id="btn-logout"
                      onClick={handleLogout}
                      className="p-2 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-650 hover:border-red-200 rounded-xl text-slate-500 transition shadow-xs cursor-pointer"
                      title="Sair da conta"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button 
                      id="btn-google-login"
                      onClick={handleGoogleLogin}
                      className="bg-brand text-white hover:bg-brand-hover text-xs py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition shadow-xs hover:shadow-sm cursor-pointer"
                    >
                      Entrar c/ Google
                    </button>
                    <button 
                      id="btn-anon-login"
                      onClick={handleAnonymousLogin}
                      className="bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs py-2 px-3 rounded-xl font-bold transition cursor-pointer"
                      title="Acessar sem Google"
                    >
                      Anônimo
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 py-1.5 px-3 rounded-xl border border-slate-200 shadow-xs">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Instalável como PWA</span>
              </div>
            )}

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
                <div className="flex items-center justify-between">
                  <h2 className="font-sans font-extrabold text-lg text-slate-900 flex items-center gap-2">
                    <span>1. Colar Pedido do WhatsApp</span>
                    <span className="text-[10px] uppercase font-extrabold tracking-wider bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full border border-blue-100">Inteligente</span>
                  </h2>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Copie a ficha inteira ou mensagem de conversa enviada pelo cliente ou vendedor e cole no campo de texto abaixo. A IA interpretará e preencherá a estrutura automaticamente.
                </p>
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
                              comissao: 0,
                              status: 'PENDING',
                              textoOriginal: pasteOrderText || 'Ficha Cadastrada Manualmente (Fallback erro IA)',
                              observacoes: '',
                              supplier: currentSupplier
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
                <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 bg-slate-100 hover:bg-slate-250 py-1.5 px-3 rounded-full transition font-extrabold shadow-3xs">
                  <input
                    type="checkbox"
                    checked={isRapidAnalysis}
                    onChange={(e) => setIsRapidAnalysis(e.target.checked)}
                    className="rounded text-rose-500 focus:ring-rose-500 w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                  />
                  <span>⚡ Análise Rápida</span>
                </label>

                <div className="flex items-center gap-2 flex-grow sm:flex-none justify-end">
                  <button
                    id="btn-create-manual-fallback"
                  onClick={() => {
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
                      comissao: 0,
                      status: 'PENDING',
                      textoOriginal: 'Ficha Cadastrada Manualmente',
                      observacoes: '',
                      supplier: currentSupplier
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
                      <Sparkles className="w-4 h-4 text-blue-200" />
                      Analisar e Preencher dados
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
 
            {/* PANEL 2: MARCAR ENTREGUE COM IA */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/90 flex flex-col justify-between h-full hover:shadow-xs transition duration-300">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-sans font-extrabold text-lg text-slate-900 flex items-center gap-2">
                    <span>2. Despachar Pedido Entregue</span>
                    <span className="text-[10px] uppercase font-extrabold tracking-wider bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full border border-emerald-100">IA Rápida</span>
                  </h2>
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
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
                            updateComissaoSuggestion(val, comissaoPercent);
                          }}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                        />
                      </div>

                      {/* Comissão editável e calculável */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-natural-muted uppercase">Comissão (R$)</label>
                          
                          {/* Slider or selection tool */}
                          <select 
                            value={comissaoPercent}
                            onChange={(e) => {
                              const pct = parseInt(e.target.value, 10);
                              setComissaoPercent(pct);
                              updateComissaoSuggestion(editingPedido.valorTotal || 0, pct);
                            }}
                            className="text-[10px] bg-natural-accent px-1 py-0.5 rounded outline-none border border-natural-border-dark"
                            title="Sugerir comissão automática"
                          >
                            <option value={5}>5%</option>
                            <option value={8}>8%</option>
                            <option value={10}>10%</option>
                            <option value={12}>12%</option>
                            <option value={15}>15%</option>
                          </select>
                        </div>
                        <input 
                          type="number" 
                          step="0.01"
                          required
                          value={editingPedido.comissao !== undefined ? editingPedido.comissao : ''}
                          onChange={(e) => setEditingPedido(prev => prev ? { ...prev, comissao: parseFloat(e.target.value) || 0 } : null)}
                          className="w-full text-sm bg-white p-2.5 text-natural-text border border-natural-border-dark rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
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
                        Confirmar e Salvar Pedido
                      </button>
                    </div>

                  </form>
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
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-sans font-extrabold text-xl text-slate-900 flex items-center gap-2">
                <Grid className="w-5 h-5 text-brand" />
                Planilha Administrativa (Modo de Edição Direta)
              </h2>
              <p className="text-xs text-slate-500">Tudo conectado ao Firebase em tempo real. Pressione Tab de célula em célula para preencher rapidamente.</p>
            </div>
            
            <div className="flex items-center gap-2">
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
 
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
            <div className="overflow-x-auto">
              
              <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-extrabold tracking-wider border-b border-slate-200/90">
                    <th className="px-3 py-3.5 w-28">Nº Venda</th>
                    <th className="px-3 py-3.5 w-24">Data</th>
                    <th className="px-3 py-3.5 w-56">Cliente</th>
                    <th className="px-3 py-3.5 w-64">Produto</th>
                    <th className="px-3 py-3.5 w-36">Cor</th>
                    <th className="px-3 py-3.5 w-32 text-right">Valor Célula (R$)</th>
                    <th className="px-3 py-3.5 w-32 text-right">Comissão (R$)</th>
                    <th className="px-3 py-3.5 w-36 text-center">Status</th>
                    <th className="px-3 py-3.5 w-20 text-center text-rose-650">Cancelar</th>
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
                                await updatePedidoStatus(p.id, nextStat);
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

                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        Nenhuma venda cadastrada.
                      </td>
                    </tr>
                  )}
                </tbody>

              </table>

            </div>
          </div>

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
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Logs & Diagnósticos de Inteligência Artificial</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Monitore o desempenho, tempos de resposta e falhas da IA.</p>
                        </div>
                        <button
                          onClick={() => {
                            setAiLogs([]);
                            triggerToast('info', 'Histórico de logs de IA limpo.');
                          }}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[9.5px] py-1 px-2.5 rounded-lg transition cursor-pointer"
                        >
                          Limpar Logs
                        </button>
                      </div>

                      {/* STATS GAUGE */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-50/65 p-3 rounded-2xl border border-slate-150">
                          <span className="text-[8.5px] font-mono uppercase text-slate-450 block tracking-wider font-extrabold">Total Acumulado</span>
                          <span className="text-sm font-black text-slate-800 mt-1 block">{aiLogs.length}</span>
                        </div>
                        <div className="bg-slate-50/65 p-3 rounded-2xl border border-slate-150">
                          <span className="text-[8.5px] font-mono uppercase text-slate-450 block tracking-wider font-extrabold">Tempo Médio (s)</span>
                          <span className="text-sm font-black text-slate-800 mt-1 block">
                            {aiLogs.length > 0 
                              ? `${(aiLogs.reduce((acc, curr) => acc + curr.durationMs, 0) / aiLogs.length / 1000).toFixed(2)}s` 
                              : '0.00s'}
                          </span>
                        </div>
                        <div className="bg-slate-50/65 p-3 rounded-2xl border border-slate-150">
                          <span className="text-[8.5px] font-mono uppercase text-slate-450 block tracking-wider font-extrabold">Sucesso</span>
                          <span className="text-sm font-black text-slate-800 mt-1 block">
                            {aiLogs.length > 0 
                              ? `${((aiLogs.filter(l => !l.error).length / aiLogs.length) * 100).toFixed(0)}%` 
                              : '100%'}
                          </span>
                        </div>
                      </div>

                      {/* EXPANDABLE LOGS LIST */}
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
                        {aiLogs.length > 0 ? (
                          aiLogs.map((log) => (
                            <div key={log.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5 hover:shadow-2xs transition">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-mono font-bold text-slate-500">
                                    {new Date(log.timestamp).toLocaleTimeString('pt-BR')} ({new Date(log.timestamp).toLocaleDateString('pt-BR')})
                                  </span>
                                  <span className={`text-[8.5px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                                    log.isRapid 
                                      ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                                      : 'bg-blue-50 text-blue-600 border border-blue-100'
                                  }`}>
                                    {log.isRapid ? '⚡ Rápido' : '🔍 Completo'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[9.5px] font-mono font-bold text-slate-650 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {(log.durationMs / 1000).toFixed(2)}s
                                  </span>
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
                                  <div className="text-[8.5px] font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-100 pb-1 mb-1">Campos Interpretados da IA:</div>
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
