import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured, handleFirestoreError, OperationType } from './firebase';
import { Pedido } from './types';

// Mock values used when local storage is empty
const INITIAL_MOCK_PEDIDOS: Pedido[] = [
  {
    id: "mock-1",
    numeroVenda: "#001",
    data: "22/05",
    nomeCompleto: "João Silva Santos",
    telefone1: "11999994433",
    telefone2: "11988887766",
    endereco: "Rua das Oliveiras, 120 - Bloco C Apt 4 - Centro, São Paulo - SP",
    produto: "Cama Box Casal King",
    cor: "Preto",
    quantidade: 1,
    formaPagamento: "PIX",
    valorTotal: 1599.00,
    comissao: 160.00,
    status: "PENDING",
    textoOriginal: "FICHA DE PEDIDO\nNome: João Silva Santos\nTelefone: 11 99999-4433 / 11 98888-7766\nEndereço: Rua das Oliveiras, 120 - Bloco C Apt 4 - Centro, São Paulo - SP\nProduto: Cama Box Casal King\nCor: Preto\nQtd: 1\nForma de Pagamento: PIX\nValor Total: R$1599,00\nComissão: 10%\nObservações: Entregar após as 14h.",
    observacoes: "Entregar após as 14h."
  },
  {
    id: "mock-2",
    numeroVenda: "#002",
    data: "23/05",
    nomeCompleto: "Ana Maria de Sousa",
    telefone1: "21977771234",
    telefone2: "",
    endereco: "Av. Atlântica, 450 - Copacabana, Rio de Janeiro - RJ",
    produto: "Sofá Retrátil 3 Lugares",
    cor: "Cinza Chumbo",
    quantidade: 1,
    formaPagamento: "Cartão de Crédito",
    valorTotal: 2400.00,
    comissao: 240.00,
    status: "RESCHEDULED",
    textoOriginal: "PEDIDO WHATSAPP\nCliente: Ana Maria de Sousa\nTel: 21 97777-1234\nLocal: Av. Atlântica, 450 - Copacabana, Rio de Janeiro - RJ\nItem: Sofá Retrátil\nCor: Cinza Chumbo\nPagamento: Cartão de Crédito\nTotal: R$2400,00\nComissão: R$240",
    observacoes: "Entregar no sábado de manhã."
  },
  {
    id: "mock-3",
    numeroVenda: "#003",
    data: "24/05",
    nomeCompleto: "Carlos Eduardo Santos",
    telefone1: "19966554411",
    telefone2: "19988112233",
    endereco: "Rua Regente Feijó, 980 - Cambuí, Campinas - SP",
    produto: "Mesa de Jantar 6 Cadeiras",
    cor: "Mel e Off-White",
    quantidade: 1,
    formaPagamento: "Dinheiro / Entregar no local",
    valorTotal: 1850.00,
    comissao: 185.00,
    status: "DELIVERED",
    textoOriginal: "REGISTRO RAPIDO\nNome: Carlos Eduardo Santos\nFone: 19 96655-4411\nEndereço: Rua Regente Feijó, 980 - Cambuí, Campinas - SP\nProduto: Mesa de Jantar 6 Cadeiras Mel e Off-White\nValor: R$1850,00\nComissão: 185",
    observacoes: "Entregue com sucesso. Cliente elogiou muito o acabamento."
  }
];

// In-memory list when offline, backed by LocalStorage
let currentOfflinePedidos: Pedido[] = [];

function getLocalStoragePedidos(): Pedido[] {
  const data = localStorage.getItem("iazap_pedidos");
  if (!data) {
    localStorage.setItem("iazap_pedidos", JSON.stringify(INITIAL_MOCK_PEDIDOS));
    currentOfflinePedidos = [...INITIAL_MOCK_PEDIDOS];
    return currentOfflinePedidos;
  }
  try {
    currentOfflinePedidos = JSON.parse(data);
    return currentOfflinePedidos;
  } catch (e) {
    return INITIAL_MOCK_PEDIDOS;
  }
}

function setLocalStoragePedidos(pedidos: Pedido[]) {
  currentOfflinePedidos = [...pedidos];
  localStorage.setItem("iazap_pedidos", JSON.stringify(pedidos));
  // Dispatch custom event to notify multiple components of state change in SPA mode
  window.dispatchEvent(new Event("iazap_db_update"));
}

// Sequence generator for "numeroVenda"
export function generateNextNumeroVenda(existing: Pedido[]): string {
  if (existing.length === 0) return "#001";
  const nums = existing
    .map(p => {
      const match = p.numeroVenda.match(/#(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `#${String(max + 1).padStart(3, '0')}`;
}

// Listeners collection for localStorage SPA sync
const localListeners: Set<(pedidos: Pedido[]) => void> = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("iazap_db_update", () => {
    const fresh = getLocalStoragePedidos();
    localListeners.forEach(listener => listener(fresh));
  });
}

/**
 * Subscribes to real-time updates for Pedidos
 */
export function subscribePedidos(
  onUpdate: (pedidos: Pedido[]) => void, 
  onError: (error: any) => void
): () => void {
  
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    
    // Setup snapshot listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Pedido[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        
        // Normalize status to uppercase values
        const rawStatus = d.status || 'PENDING';
        const mappedStatus: 'PENDING' | 'RESCHEDULED' | 'DELIVERED_UNPAID' | 'DELIVERED' =
          (rawStatus === 'Pendente' || rawStatus === 'PENDING') ? 'PENDING' :
          (rawStatus === 'Reagendado' || rawStatus === 'Agendado' || rawStatus === 'RESCHEDULED') ? 'RESCHEDULED' :
          (rawStatus === 'Entregue e Não Pago' || rawStatus === 'DELIVERED_UNPAID' || rawStatus === 'Entregue / N.P.') ? 'DELIVERED_UNPAID' :
          (rawStatus === 'Entregue' || rawStatus === 'DELIVERED') ? 'DELIVERED' : 'PENDING';

        list.push({
          id: docSnap.id,
          numeroVenda: d.numeroVenda || '',
          data: d.data || '',
          nomeCompleto: d.nomeCompleto || '',
          telefone1: d.telefone1 || '',
          telefone2: d.telefone2 || '',
          endereco: d.endereco || '',
          produto: d.produto || '',
          cor: d.cor || '',
          quantidade: d.quantidade || 1,
          formaPagamento: d.formaPagamento || '',
          valorTotal: typeof d.valorTotal === "number" ? d.valorTotal : parseFloat(d.valorTotal) || 0,
          comissao: typeof d.comissao === "number" ? d.comissao : parseFloat(d.comissao) || 0,
          status: mappedStatus,
          dataReagendamento: d.dataReagendamento || d.rescheduleDate || '',
          rescheduleDate: d.rescheduleDate || d.dataReagendamento || '',
          textoOriginal: d.textoOriginal || '',
          observacoes: d.observacoes || '',
          userId: d.userId || '',
          createdAt: d.createdAt?.seconds ? d.createdAt.seconds * 1000 : d.createdAt,
          updatedAt: d.updatedAt?.seconds ? d.updatedAt.seconds * 1000 : d.updatedAt
        });
      });
      // Sort in descending order to match expected structure
      onUpdate(list);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, "orders");
      } catch (formattedError: any) {
        onError(formattedError);
      }
    });

    return unsubscribe;
  } else {
    // LocalStorage Mode
    const list = getLocalStoragePedidos();
    onUpdate(list);
    
    const localCallback = (freshList: Pedido[]) => {
      onUpdate(freshList);
    };
    localListeners.add(localCallback);
    
    return () => {
      localListeners.delete(localCallback);
    };
  }
}

/**
 * Saves a new Pedido or overwrites an existing one
 */
export async function savePedido(pedido: Omit<Pedido, "id"> & { id?: string }): Promise<string> {
  const rawStatus = (pedido.status || 'PENDING') as any;
  const mappedStatus: 'PENDING' | 'RESCHEDULED' | 'DELIVERED_UNPAID' | 'DELIVERED' =
    (rawStatus === 'Pendente' || rawStatus === 'PENDING') ? 'PENDING' :
    (rawStatus === 'Reagendado' || rawStatus === 'Agendado' || rawStatus === 'RESCHEDULED') ? 'RESCHEDULED' :
    (rawStatus === 'Entregue e Não Pago' || rawStatus === 'DELIVERED_UNPAID' || rawStatus === 'Entregue / N.P.') ? 'DELIVERED_UNPAID' :
    (rawStatus === 'Entregue' || rawStatus === 'DELIVERED') ? 'DELIVERED' : 'PENDING';

  const payload: any = {
    numeroVenda: pedido.numeroVenda,
    data: pedido.data,
    nomeCompleto: pedido.nomeCompleto,
    telefone1: pedido.telefone1,
    telefone2: pedido.telefone2,
    endereco: pedido.endereco,
    produto: pedido.produto,
    cor: pedido.cor,
    quantidade: Number(pedido.quantidade) || 1,
    formaPagamento: pedido.formaPagamento,
    valorTotal: Number(pedido.valorTotal) || 0,
    comissao: Number(pedido.comissao) || 0,
    status: mappedStatus,
    dataReagendamento: pedido.dataReagendamento || '',
    rescheduleDate: pedido.rescheduleDate || pedido.dataReagendamento || '',
    textoOriginal: pedido.textoOriginal,
    observacoes: pedido.observacoes,
    updatedAt: isFirebaseConfigured ? serverTimestamp() : Date.now()
  };

  if (isFirebaseConfigured && db) {
    if (auth?.currentUser) {
      payload.userId = auth.currentUser.uid;
    }
    
    try {
      if (pedido.id) {
        const docRef = doc(db, "orders", pedido.id);
        await setDoc(docRef, payload, { merge: true });
        return pedido.id;
      } else {
        payload.createdAt = serverTimestamp();
        const colRef = collection(db, "orders");
        const docRef = await addDoc(colRef, payload);
        return docRef.id;
      }
    } catch (err: any) {
      handleFirestoreError(err, pedido.id ? OperationType.UPDATE : OperationType.CREATE, `orders/${pedido.id || 'new'}`);
    }
  } else {
    // LocalStorage mode
    const list = getLocalStoragePedidos();
    let finalId = pedido.id || `local-${Date.now()}`;
    
    if (pedido.id) {
      const idx = list.findIndex(p => p.id === pedido.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...payload, id: finalId, status: mappedStatus };
      }
    } else {
      payload.createdAt = Date.now();
      const newPedido: Pedido = {
        ...payload,
        id: finalId
      };
      list.push(newPedido);
    }
    
    setLocalStoragePedidos(list);
    return finalId;
  }
}

/**
 * Changes status of a Pedido instantly without using IA
 */
export async function updatePedidoStatus(
  id: string, 
  newStatus: any,
  extra?: { dataReagendamento?: string }
): Promise<void> {
  // 1. ADICIONAR LOGS COMPLETOS
  console.log("Atualizando pedido...");
  console.log("Pedido ID:", id);
  console.log("Novo Status original:", newStatus);
  console.log("Usuário:", auth?.currentUser);

  // 7. GARANTIR QUE ID EXISTE
  if (!id) {
    console.error("Pedido sem ID");
    return;
  }

  // 2. VALIDAR STATUS ANTES DE SALVAR (and convert to uppercase first)
  const rawStatus = newStatus || 'PENDING';
  const fileStatus: 'PENDING' | 'RESCHEDULED' | 'DELIVERED_UNPAID' | 'DELIVERED' =
    (rawStatus === 'Pendente' || rawStatus === 'PENDING') ? 'PENDING' :
    (rawStatus === 'Reagendado' || rawStatus === 'Agendado' || rawStatus === 'RESCHEDULED') ? 'RESCHEDULED' :
    (rawStatus === 'Entregue e Não Pago' || rawStatus === 'DELIVERED_UNPAID' || rawStatus === 'Entregue / N.P.') ? 'DELIVERED_UNPAID' :
    (rawStatus === 'Entregue' || rawStatus === 'DELIVERED') ? 'DELIVERED' : 'PENDING';

  const VALID_STATUS = [
    "PENDING",
    "RESCHEDULED",
    "DELIVERED_UNPAID",
    "DELIVERED"
  ];

  if (!VALID_STATUS.includes(fileStatus)) {
    console.error("Status inválido detectado:", fileStatus);
    return;
  }

  const updatePayload: any = { 
    status: fileStatus,
    updatedAt: isFirebaseConfigured ? serverTimestamp() : Date.now()
  };
  if (extra && extra.dataReagendamento !== undefined) {
    updatePayload.dataReagendamento = extra.dataReagendamento;
    updatePayload.rescheduleDate = extra.dataReagendamento;
  }

  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "orders", id);
      await updateDoc(docRef, updatePayload);
      console.log("Status atualizado com sucesso no Firestore: orders", id, "com", fileStatus);
    } catch (error: any) {
      console.error("ERRO FIREBASE DETALHADO:");
      console.error("Error Code:", error?.code);
      console.error("Error Message:", error?.message);
      console.error(error);
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    }
  } else {
    const list = getLocalStoragePedidos();
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx].status = fileStatus;
      if (extra && extra.dataReagendamento !== undefined) {
        list[idx].dataReagendamento = extra.dataReagendamento;
      }
      list[idx].updatedAt = Date.now();
      setLocalStoragePedidos(list);
    }
  }
}

/**
 * Deletes a Pedido
 */
export async function deletePedido(id: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "orders", id);
      await deleteDoc(docRef);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `orders/${id}`);
    }
  } else {
    const list = getLocalStoragePedidos();
    const filtered = list.filter(p => p.id !== id);
    setLocalStoragePedidos(filtered);
  }
}

/**
 * Forces manual trigger of localStorage event to prevent delays
 */
export function forceManualSyncRefresh(): void {
  // Trigger event to refresh list manually
  if (isFirebaseConfigured && db) {
    // In Firebase, we can't force a snapshot unless we re-fetch or simply wait for real-time. 
    // We can dispatch a global event so UI gets feedback of "Refreshing..."
    window.dispatchEvent(new Event("iazap_db_update"));
  } else {
    window.dispatchEvent(new Event("iazap_db_update"));
  }
}
