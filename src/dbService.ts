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
  serverTimestamp,
  getDocs,
  where
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured, handleFirestoreError, OperationType } from './firebase';
import { Pedido, CustomUser } from './types';
import bcrypt from 'bcryptjs';

export function getCollectionNameBySupplier(supplier?: string): string {
  if (supplier === 'SOFIA_HOME_DECOR' || supplier === 'Sofia Home Decor') return 'Sofia Home Decor';
  if (supplier === 'MICHAEL' || supplier === 'Michael') return 'Michael';
  if (supplier === 'FRANK' || supplier === 'Frank') return 'Frank';
  return 'Outros Fornecedores';
}

// LocalStorage storage and sync for Custom Users
let currentOfflineUsers: CustomUser[] = [];
export const DEFAULT_SYSTEM_USERS: CustomUser[] = [
  {
    id: "user-alan",
    username: "alan",
    password: "", // Seeded below
    name: "Alan",
    role: "admin",
    active: true
  },
  {
    id: "user-esposa",
    username: "esposa",
    password: "", // Seeded below
    name: "Esposa",
    role: "admin",
    active: true
  }
];

// Seed bcrypt hashes for the default passwords (alan123 and esposa123)
const SALT_ROUNDS = 10;
const hashedAlan = bcrypt.hashSync("alan123", SALT_ROUNDS);
const hashedEsposa = bcrypt.hashSync("esposa123", SALT_ROUNDS);
DEFAULT_SYSTEM_USERS[0].password = hashedAlan;
DEFAULT_SYSTEM_USERS[1].password = hashedEsposa;

function getLocalStorageUsers(): CustomUser[] {
  const data = localStorage.getItem("iazap_users");
  if (!data) {
    localStorage.setItem("iazap_users", JSON.stringify(DEFAULT_SYSTEM_USERS));
    currentOfflineUsers = [...DEFAULT_SYSTEM_USERS];
    return currentOfflineUsers;
  }
  try {
    currentOfflineUsers = JSON.parse(data);
    return currentOfflineUsers;
  } catch (e) {
    return DEFAULT_SYSTEM_USERS;
  }
}

function setLocalStorageUsers(users: CustomUser[]) {
  currentOfflineUsers = [...users];
  localStorage.setItem("iazap_users", JSON.stringify(users));
  window.dispatchEvent(new Event("iazap_users_update"));
}

const usersLocalListeners: Set<(users: CustomUser[]) => void> = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("iazap_users_update", () => {
    const fresh = getLocalStorageUsers();
    usersLocalListeners.forEach(listener => listener(fresh));
  });
}

/**
 * Seemless automatic seeder for admin users on startup
 */
export async function seedInitialUsersIfEmpty(): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, "users"));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        console.log("Seeding initial administrator users...");
        for (const user of DEFAULT_SYSTEM_USERS) {
          const docId = user.id || `user-${user.username}`;
          const { id, ...payload } = user;
          await setDoc(doc(db, "users", docId), {
            ...payload,
            createdAt: serverTimestamp()
          });
        }
        console.log("Seeding complete.");
      }
    } catch (err) {
      console.error("Erro ao semear usuários iniciais no Firestore:", err);
    }
  } else {
    getLocalStorageUsers();
  }
}

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
    const listNames = ["Sofia Home Decor", "Michael", "Frank", "Outros Fornecedores"];
    const activeUnsubscribes: (() => void)[] = [];
    const latestData: { [col: string]: Pedido[] } = {};

    const triggerMergedUpdate = () => {
      let merged: Pedido[] = [];
      for (const colName of listNames) {
        if (latestData[colName]) {
          merged = merged.concat(latestData[colName]);
        }
      }
      merged.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0));
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0));
        return timeB - timeA;
      });
      onUpdate(merged);
    };

    listNames.forEach((colName) => {
      const q = query(collection(db, colName), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(q, (snapshot) => {
        const list: Pedido[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const rawStatus = d.status || 'PENDING';
          const mappedStatus: 'PENDING' | 'RESCHEDULED' | 'DELIVERED_UNPAID' | 'DELIVERED' | 'CANCELLED' =
            (rawStatus === 'Pendente' || rawStatus === 'PENDING') ? 'PENDING' :
            (rawStatus === 'Reagendado' || rawStatus === 'Agendado' || rawStatus === 'RESCHEDULED') ? 'RESCHEDULED' :
            (rawStatus === 'Entregue e Não Pago' || rawStatus === 'DELIVERED_UNPAID' || rawStatus === 'Entregue / N.P.') ? 'DELIVERED_UNPAID' :
            (rawStatus === 'Entregue' || rawStatus === 'DELIVERED') ? 'DELIVERED' :
            (rawStatus === 'CANCELLED' || rawStatus === 'Cancelado' || rawStatus === 'CANCELADO') ? 'CANCELLED' : 'PENDING';

          const mappedSupplier: 'SOFIA_HOME_DECOR' | 'MICHAEL' | 'FRANK' | 'OUTROS' =
            colName === "Sofia Home Decor" ? "SOFIA_HOME_DECOR" :
            colName === "Michael" ? "MICHAEL" :
            colName === "Frank" ? "FRANK" : "OUTROS";

          list.push({
            id: docSnap.id,
            numeroVenda: d.numeroVenda || '',
            data: d.data || '',
            nomeCompleto: d.nomeCompleto || '',
            telefone1: d.telefone1 || '',
            telefone2: d.telefone2 || '',
            endereco: d.endereco || '',
            city: d.city || '',
            state: d.state || '',
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
            supplier: d.supplier || mappedSupplier,
            userId: d.userId || '',
            createdAt: d.createdAt?.seconds ? d.createdAt.seconds * 1000 : d.createdAt,
            updatedAt: d.updatedAt?.seconds ? d.updatedAt.seconds * 1000 : d.updatedAt
          });
        });
        latestData[colName] = list;
        triggerMergedUpdate();
      }, (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, colName);
        } catch (formattedError: any) {
          onError(formattedError);
        }
      });
      activeUnsubscribes.push(unsub);
    });

    return () => {
      activeUnsubscribes.forEach(unsub => unsub());
    };
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
export async function savePedido(pedido: Omit<Pedido, "id"> & { id?: string }, byUser?: string): Promise<string> {
  const rawStatus = (pedido.status || 'PENDING') as any;
  const mappedStatus: 'PENDING' | 'RESCHEDULED' | 'DELIVERED_UNPAID' | 'DELIVERED' | 'CANCELLED' =
    (rawStatus === 'Pendente' || rawStatus === 'PENDING') ? 'PENDING' :
    (rawStatus === 'Reagendado' || rawStatus === 'Agendado' || rawStatus === 'RESCHEDULED') ? 'RESCHEDULED' :
    (rawStatus === 'Entregue e Não Pago' || rawStatus === 'DELIVERED_UNPAID' || rawStatus === 'Entregue / N.P.') ? 'DELIVERED_UNPAID' :
    (rawStatus === 'Entregue' || rawStatus === 'DELIVERED') ? 'DELIVERED' :
    (rawStatus === 'CANCELLED' || rawStatus === 'Cancelado' || rawStatus === 'CANCELADO') ? 'CANCELLED' : 'PENDING';

  // Normalize city and state
  let cityInput = (pedido.city || '').trim();
  let stateInput = (pedido.state || '').trim().toUpperCase();

  const isRetiradaText = (txt: string) => {
    if (!txt) return false;
    const norm = txt.toLowerCase();
    return norm.includes("retirada") || 
           norm.includes("retirar") || 
           norm.includes("retira na loja") || 
           norm.includes("retirada na fábrica") || 
           norm.includes("retirada na fabrica") || 
           norm.includes("cliente retira") || 
           norm.includes("retirada no local");
  };

  const matchesRetirada = 
    isRetiradaText(cityInput) || 
    isRetiradaText(pedido.endereco || '') || 
    isRetiradaText(pedido.observacoes || '') || 
    isRetiradaText(pedido.textoOriginal || '');

  if (matchesRetirada) {
    cityInput = "RETIRADA";
    stateInput = "";
  } else if (!cityInput) {
    // If not found in cityInput, let's check if endereco contains a city/state format like "Alfenas/MG" or "Alfenas - MG"
    const addr = pedido.endereco || '';
    const match = addr.match(/,\s*([^,]+?)\s*[\/-]\s*([A-Za-z]{2})/);
    if (match) {
      cityInput = match[1].trim();
      stateInput = match[2].trim().toUpperCase();
      if (isRetiradaText(cityInput)) {
        cityInput = "RETIRADA";
        stateInput = "";
      }
    }
  }

  // Double check some common raw texts in address, such as "Alfenas/MG" or "Campinas/SP" or "Varginha" or "São Paulo"
  if (!cityInput || cityInput === "NÃO INFORMADO") {
    const fullText = `${pedido.endereco || ''} ${pedido.textoOriginal || ''}`.toLowerCase();
    if (fullText.includes("alfenas")) {
      cityInput = "Alfenas";
      stateInput = "MG";
    } else if (fullText.includes("poços de caldas") || fullText.includes("pocos de caldas")) {
      cityInput = "Poços de Caldas";
      stateInput = "MG";
    } else if (fullText.includes("varginha")) {
      cityInput = "Varginha";
      stateInput = "MG";
    } else if (fullText.includes("guaxupé") || fullText.includes("guaxupe")) {
      cityInput = "Guaxupé";
      stateInput = "MG";
    } else if (fullText.includes("passos")) {
      cityInput = "Passos";
      stateInput = "MG";
    } else if (fullText.includes("campinas")) {
      cityInput = "Campinas";
      stateInput = "SP";
    } else if (fullText.includes("são paulo") || fullText.includes("sao paulo")) {
      cityInput = "São Paulo";
      stateInput = "SP";
    }
  }

  // Capitalize first letters of city unless it is RETIRADA or NÃO INFORMADO
  if (cityInput && cityInput !== "RETIRADA" && cityInput !== "NÃO INFORMADO") {
    cityInput = cityInput
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  if (!cityInput) {
    cityInput = "NÃO INFORMADO";
  }

  const payload: any = {
    numeroVenda: pedido.numeroVenda,
    data: pedido.data,
    nomeCompleto: pedido.nomeCompleto,
    telefone1: pedido.telefone1,
    telefone2: pedido.telefone2,
    endereco: pedido.endereco,
    city: cityInput,
    state: stateInput,
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
    supplier: pedido.supplier || 'SOFIA_HOME_DECOR',
    updatedAt: isFirebaseConfigured ? serverTimestamp() : Date.now()
  };

  if (byUser) {
    if (!pedido.id) {
      payload.createdBy = byUser;
    }
    payload.updatedBy = byUser;
  }

  if (isFirebaseConfigured && db) {
    if (auth?.currentUser) {
      payload.userId = auth.currentUser.uid;
    }
    
    // Resolve correct collection
    const targetColName = getCollectionNameBySupplier(pedido.supplier || 'OUTROS');
    const allCollections = ["Sofia Home Decor", "Michael", "Frank", "Outros Fornecedores"];
    const collectionsToClean = allCollections.filter(c => c !== targetColName);

    try {
      if (pedido.id) {
        const docRef = doc(db, targetColName, pedido.id);
        await setDoc(docRef, payload, { merge: true });

        // Cleanup potential duplicate of this ID in other active databases to prevent cross-supplier duplicates
        for (const otherCol of collectionsToClean) {
          try {
            const staleRef = doc(db, otherCol, pedido.id);
            await deleteDoc(staleRef);
          } catch (e) {
            // Silently ignore permission/existence errors during duplicate cleaning
          }
        }
        return pedido.id;
      } else {
        payload.createdAt = serverTimestamp();
        const colRef = collection(db, targetColName);
        const docRef = await addDoc(colRef, payload);
        return docRef.id;
      }
    } catch (err: any) {
      handleFirestoreError(err, pedido.id ? OperationType.UPDATE : OperationType.CREATE, `${targetColName}/${pedido.id || 'new'}`);
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
  extra?: { dataReagendamento?: string },
  byUser?: string,
  supplier?: string
): Promise<void> {
  // 1. ADICIONAR LOGS COMPLETOS
  console.log("Atualizando pedido...", id, "supplier:", supplier);
  console.log("Novo Status original:", newStatus);
  console.log("Usuário:", auth?.currentUser);

  // 7. GARANTIR QUE ID EXISTE
  if (!id) {
    console.error("Pedido sem ID");
    return;
  }

  // 2. VALIDAR STATUS ANTES DE SALVAR (and convert to uppercase first)
  const rawStatus = newStatus || 'PENDING';
  const fileStatus: 'PENDING' | 'RESCHEDULED' | 'DELIVERED_UNPAID' | 'DELIVERED' | 'CANCELLED' =
    (rawStatus === 'Pendente' || rawStatus === 'PENDING') ? 'PENDING' :
    (rawStatus === 'Reagendado' || rawStatus === 'Agendado' || rawStatus === 'RESCHEDULED') ? 'RESCHEDULED' :
    (rawStatus === 'Entregue e Não Pago' || rawStatus === 'DELIVERED_UNPAID' || rawStatus === 'Entregue / N.P.') ? 'DELIVERED_UNPAID' :
    (rawStatus === 'Entregue' || rawStatus === 'DELIVERED') ? 'DELIVERED' :
    (rawStatus === 'CANCELLED' || rawStatus === 'Cancelado' || rawStatus === 'CANCELADO') ? 'CANCELLED' : 'PENDING';

  const VALID_STATUS = [
    "PENDING",
    "RESCHEDULED",
    "DELIVERED_UNPAID",
    "DELIVERED",
    "CANCELLED"
  ];

  if (!VALID_STATUS.includes(fileStatus)) {
    console.error("Status inválido detectado:", fileStatus);
    return;
  }

  const updatePayload: any = { 
    status: fileStatus,
    updatedAt: isFirebaseConfigured ? serverTimestamp() : Date.now()
  };
  if (byUser) {
    updatePayload.updatedBy = byUser;
  }
  if (extra && extra.dataReagendamento !== undefined) {
    updatePayload.dataReagendamento = extra.dataReagendamento;
    updatePayload.rescheduleDate = extra.dataReagendamento;
  }

  if (isFirebaseConfigured && db) {
    try {
      const allCollections = ["Sofia Home Decor", "Michael", "Frank", "Outros Fornecedores"];
      if (supplier) {
        const docRef = doc(db, getCollectionNameBySupplier(supplier), id);
        await updateDoc(docRef, updatePayload);
      } else {
        // Try to update document in any of the four collections sequentially
        let updatedAny = false;
        for (const col of allCollections) {
          try {
            const docRef = doc(db, col, id);
            await updateDoc(docRef, updatePayload);
            updatedAny = true;
            break;
          } catch (e) {
            // Silently scan next collection if not found
          }
        }
        if (!updatedAny) {
          console.warn(`[updatePedidoStatus] Could not locate document ${id} with status update in any collection.`);
        }
      }
      console.log("Status atualizado com sucesso no Firestore:", id, "com", fileStatus);
    } catch (error: any) {
      console.error("ERRO FIREBASE DETALHADO:");
      console.error("Error Code:", error?.code);
      console.error("Error Message:", error?.message);
      console.error(error);
      handleFirestoreError(error, OperationType.UPDATE, `orders-multisupplier/${id}`);
    }
  } else {
    const list = getLocalStoragePedidos();
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx].status = fileStatus;
      if (extra && extra.dataReagendamento !== undefined) {
        list[idx].dataReagendamento = extra.dataReagendamento;
      }
      if (byUser) {
        list[idx].updatedBy = byUser;
      }
      list[idx].updatedAt = Date.now();
      setLocalStoragePedidos(list);
    }
  }
}

/**
 * Deletes a Pedido
 */
export async function deletePedido(id: string, supplier?: string): Promise<void> {
  console.log("[DEBUG deletePedido] Iniciando exclusão de pedido no Firebase/LocalStorage. ID:", id, "supplier:", supplier);
  console.log("[DEBUG deletePedido] Firebase configurado:", isFirebaseConfigured, "DB ativo:", !!db);
  if (isFirebaseConfigured && db) {
    try {
      const allCollections = ["Sofia Home Decor", "Michael", "Frank", "Outros Fornecedores"];
      if (supplier) {
        const docRef = doc(db, getCollectionNameBySupplier(supplier), id);
        await deleteDoc(docRef);
      } else {
        for (const col of allCollections) {
          try {
            const docRef = doc(db, col, id);
            await deleteDoc(docRef);
          } catch (e) {
            // Silently scan next
          }
        }
      }
      console.log("[DEBUG deletePedido] Exclusão executada com sucesso no Firestore.");
    } catch (err: any) {
      console.error("[DEBUG deletePedido] Erro ao deletar documento no Firestore:", err);
      handleFirestoreError(err, OperationType.DELETE, `orders-multisupplier/${id}`);
    }
  } else {
    console.log("[DEBUG deletePedido] Usando modo offline / LocalStorage.");
    const list = getLocalStoragePedidos();
    const filtered = list.filter(p => p.id !== id);
    setLocalStoragePedidos(filtered);
    console.log("[DEBUG deletePedido] LocalStorage atualizado, linhas restantes:", filtered.length);
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

export interface BackupItem {
  id: string;
  createdAt: string;
  recordsCount: number;
  responsibleUser: string;
  fileSize: string;
  backupType: 'manual' | 'automatico';
  backupData: string; // JSON string of Pedidos
}

// In-memory list of backups when offline
let currentOfflineBackups: BackupItem[] = [];

function getLocalStorageBackups(): BackupItem[] {
  const data = localStorage.getItem("iazap_system_backups");
  if (!data) return [];
  try {
    currentOfflineBackups = JSON.parse(data);
    return currentOfflineBackups;
  } catch (e) {
    return [];
  }
}

function setLocalStorageBackups(backups: BackupItem[]) {
  currentOfflineBackups = [...backups];
  localStorage.setItem("iazap_system_backups", JSON.stringify(backups));
  window.dispatchEvent(new Event("iazap_backups_update"));
}

const backupsLocalListeners: Set<(backups: BackupItem[]) => void> = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("iazap_backups_update", () => {
    const fresh = getLocalStorageBackups();
    backupsLocalListeners.forEach(listener => listener(fresh));
  });
}

/**
 * Saves backup metadata and contents to Firebase or LocalStorage
 */
export async function saveBackupMetadata(backup: Omit<BackupItem, "id">): Promise<string> {
  const finalId = `backup-${Date.now()}`;
  const payload = {
    createdAt: backup.createdAt,
    recordsCount: Number(backup.recordsCount) || 0,
    responsibleUser: backup.responsibleUser || 'sistema',
    fileSize: backup.fileSize,
    backupType: backup.backupType,
    // Store full backupData if appropriate size, else truncated (but let's store it as demanded for direct recovery)
    backupData: backup.backupData
  };

  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "system_backups", finalId);
      await setDoc(docRef, payload);
      
      // Auto prune: keep only last 30 automated backups
      if (backup.backupType === 'automatico') {
        const q = query(
          collection(db, "system_backups"), 
          where("backupType", "==", "automatico"),
          orderBy("createdAt", "asc")
        );
        const snapshot = await getDocs(q);
        if (snapshot.size > 30) {
          const docsToDelete = snapshot.docs.slice(0, snapshot.size - 30);
          for (const docSnap of docsToDelete) {
            await deleteDoc(docSnap.ref);
          }
        }
      }
      return finalId;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `system_backups/${finalId}`);
    }
  } else {
    // LocalStorage Mode
    const list = getLocalStorageBackups();
    const newItem: BackupItem = {
      ...payload,
      id: finalId
    };
    list.push(newItem);
    
    // Sort so newest is first or manage pruning of automated backups
    let automated = list.filter(b => b.backupType === 'automatico');
    const manualAndOthers = list.filter(b => b.backupType !== 'automatico');
    
    if (automated.length > 30) {
      // Sort older to newer to prune the oldest
      automated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      automated = automated.slice(automated.length - 30);
    }
    
    const finalBackups = [...manualAndOthers, ...automated];
    // Sort final list by createdAt descending
    finalBackups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    setLocalStorageBackups(finalBackups);
    return finalId;
  }
}

/**
 * Subscribes to realtime changes in Backup History list
 */
export function subscribeBackupHistory(
  onUpdate: (backups: BackupItem[]) => void,
  onError: (error: any) => void
): () => void {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, "system_backups"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: BackupItem[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          createdAt: d.createdAt || '',
          recordsCount: d.recordsCount || 0,
          responsibleUser: d.responsibleUser || 'sistema',
          fileSize: d.fileSize || '0 KB',
          backupType: d.backupType || 'manual',
          backupData: d.backupData || '[]'
        });
      });
      onUpdate(list);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, "system_backups");
      } catch (formattedError: any) {
        onError(formattedError);
      }
    });
    return unsubscribe;
  } else {
    // LocalStorage mode
    const list = getLocalStorageBackups();
    // Sort descending
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    onUpdate(list);
    
    const localCallback = (freshList: BackupItem[]) => {
      freshList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(freshList);
    };
    backupsLocalListeners.add(localCallback);
    return () => {
      backupsLocalListeners.delete(localCallback);
    };
  }
}

/**
 * Deletes a single backup from database/local storage
 */
export async function deleteBackup(id: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "system_backups", id);
      await deleteDoc(docRef);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `system_backups/${id}`);
    }
  } else {
    const list = getLocalStorageBackups();
    const filtered = list.filter(b => b.id !== id);
    setLocalStorageBackups(filtered);
  }
}

/**
 * Fully restores system pedidios database by over-writing orders
 */
export async function restoreBackupToSystem(restoredPedidos: Pedido[]): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      // For each pedido, write to its corresponding supplier collection name
      for (const p of restoredPedidos) {
        const docId = p.id || `restored-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const targetColName = getCollectionNameBySupplier(p.supplier || 'OUTROS');
        const docRef = doc(db, targetColName, docId);
        
        // Sanitize & map inputs
        const rawStatus = p.status as any;
        const fileStatus: 'PENDING' | 'RESCHEDULED' | 'DELIVERED_UNPAID' | 'DELIVERED' | 'CANCELLED' =
          (rawStatus === 'Pendente' || rawStatus === 'PENDING') ? 'PENDING' :
          (rawStatus === 'Reagendado' || rawStatus === 'Agendado' || rawStatus === 'RESCHEDULED') ? 'RESCHEDULED' :
          (rawStatus === 'Entregue e Não Pago' || rawStatus === 'DELIVERED_UNPAID' || rawStatus === 'Entregue / N.P.') ? 'DELIVERED_UNPAID' :
          (rawStatus === 'Entregue' || rawStatus === 'DELIVERED') ? 'DELIVERED' :
          (rawStatus === 'CANCELLED' || rawStatus === 'Cancelado' || rawStatus === 'CANCELADO') ? 'CANCELLED' : 'PENDING';

        const payload: any = {
          numeroVenda: p.numeroVenda || '',
          data: p.data || '',
          nomeCompleto: p.nomeCompleto || '',
          telefone1: p.telefone1 || '',
          telefone2: p.telefone2 || '',
          endereco: p.endereco || '',
          city: p.city || '',
          state: p.state || '',
          produto: p.produto || '',
          cor: p.cor || '',
          quantidade: Number(p.quantidade) || 1,
          formaPagamento: p.formaPagamento || '',
          valorTotal: Number(p.valorTotal) || 0,
          comissao: Number(p.comissao) || 0,
          status: fileStatus,
          dataReagendamento: p.dataReagendamento || p.rescheduleDate || '',
          rescheduleDate: p.rescheduleDate || p.dataReagendamento || '',
          textoOriginal: p.textoOriginal || '',
          observacoes: p.observacoes || '',
          supplier: p.supplier || 'SOFIA_HOME_DECOR',
          updatedAt: serverTimestamp()
        };
        if (p.userId) payload.userId = p.userId;
        if (p.createdAt) {
          payload.createdAt = p.createdAt;
        } else {
          payload.createdAt = serverTimestamp();
        }
        
        await setDoc(docRef, payload, { merge: true });
        
        // Cleanup document from other collections just in case of cross-supplier restore cleanups
        const allCollections = ["Sofia Home Decor", "Michael", "Frank", "Outros Fornecedores"];
        const collectionsToClean = allCollections.filter(c => c !== targetColName);
        for (const otherCol of collectionsToClean) {
          try {
            const staleRef = doc(db, otherCol, docId);
            await deleteDoc(staleRef);
          } catch (e) {}
        }
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, "orders/restore");
    }
  } else {
    // LocalStorage mode
    setLocalStoragePedidos(restoredPedidos);
  }
}

export interface ExcludedOrderBackup {
  id: string; // unique exclusion ID
  deletedAtDate: string; // DD/MM/YYYY
  deletedAtTime: string; // HH:mm
  deletedBy: string; // email/user
  supplier: string; // supplier
  pedidoCompleto: Pedido; // full Pedido object
}

// In-memory list when offline, backed by LocalStorage
let currentOfflineExclusions: ExcludedOrderBackup[] = [];

function getLocalStorageExclusions(): ExcludedOrderBackup[] {
  const data = localStorage.getItem("iazap_vendas_excluidas");
  if (!data) return [];
  try {
    currentOfflineExclusions = JSON.parse(data);
    return currentOfflineExclusions;
  } catch (e) {
    return [];
  }
}

function setLocalStorageExclusions(items: ExcludedOrderBackup[]) {
  currentOfflineExclusions = [...items];
  localStorage.setItem("iazap_vendas_excluidas", JSON.stringify(items));
  window.dispatchEvent(new Event("iazap_exclusions_update"));
}

const exclusionsLocalListeners: Set<(exclusions: ExcludedOrderBackup[]) => void> = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("iazap_exclusions_update", () => {
    const fresh = getLocalStorageExclusions();
    exclusionsLocalListeners.forEach(listener => listener(fresh));
  });
}

/**
 * Subscribes to real-time updates for Excluded Vendas (Administradores)
 */
export function subscribeExcludedOrders(
  onUpdate: (exclusions: ExcludedOrderBackup[]) => void,
  onError: (error: any) => void
): () => void {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, "system_exclusions"), orderBy("deletedAtDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: ExcludedOrderBackup[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          deletedAtDate: d.deletedAtDate || '',
          deletedAtTime: d.deletedAtTime || '',
          deletedBy: d.deletedBy || '',
          supplier: d.supplier || '',
          pedidoCompleto: d.pedidoCompleto || null
        });
      });
      onUpdate(list);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, "system_exclusions");
      } catch (formattedError: any) {
        onError(formattedError);
      }
    });
    return unsubscribe;
  } else {
    // LocalStorage Mode
    const list = getLocalStorageExclusions();
    onUpdate(list);
    
    const localCallback = (freshList: ExcludedOrderBackup[]) => {
      onUpdate(freshList);
    };
    exclusionsLocalListeners.add(localCallback);
    return () => {
      exclusionsLocalListeners.delete(localCallback);
    };
  }
}

/**
 * Excludes a sale with backup registration (Histórico de Exclusões)
 */
export async function excludeOrderWithBackup(
  pedido: Pedido,
  deletedByUser: string
): Promise<void> {
  console.log("[DEBUG excludeOrderWithBackup] Iniciando excludeOrderWithBackup.");
  console.log("[DEBUG excludeOrderWithBackup] Pedido a ser excluído:", pedido);
  console.log("[DEBUG excludeOrderWithBackup] Excluído por:", deletedByUser);

  if (!pedido || !pedido.id) {
    console.error("[DEBUG excludeOrderWithBackup] Erro: Pedido inválido ou ID ausente!");
    throw new Error("Não é possível excluir uma venda sem ID válido.");
  }

  const finalId = `exclusion-${Date.now()}`;
  const now = new Date();
  
  const payload: Omit<ExcludedOrderBackup, "id"> = {
    deletedAtDate: now.toLocaleDateString('pt-BR'),
    deletedAtTime: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    deletedBy: deletedByUser || 'Administrador',
    supplier: pedido.supplier || 'OUTROS',
    pedidoCompleto: pedido
  };

  console.log("[DEBUG excludeOrderWithBackup] Payload de exclusão preparado:", payload);

  // 1. Save Backup in system_exclusions
  if (isFirebaseConfigured && db) {
    try {
      console.log("[DEBUG excludeOrderWithBackup] Salvando backup no Firestore na coleção 'system_exclusions', ID:", finalId);
      const exclusionDocRef = doc(db, "system_exclusions", finalId);
      await setDoc(exclusionDocRef, payload);
      console.log("[DEBUG excludeOrderWithBackup] Backup de exclusão salvo com sucesso no Firestore.");
    } catch (err: any) {
      console.error("[DEBUG excludeOrderWithBackup] Erro ao gravar backup de exclusão no Firestore:", err);
      handleFirestoreError(err, OperationType.CREATE, `system_exclusions/${finalId}`);
    }
  } else {
    console.log("[DEBUG excludeOrderWithBackup] Salvando backup de exclusão em LocalStorage (Offline).");
    const list = getLocalStorageExclusions();
    list.push({ ...payload, id: finalId });
    setLocalStorageExclusions(list);
    console.log("[DEBUG excludeOrderWithBackup] Backup salvo em LocalStorage com sucesso.");
  }

  // 2. Delete from active sales
  console.log("[DEBUG excludeOrderWithBackup] Deletando pedido original:", pedido.id);
  await deletePedido(pedido.id);
  console.log("[DEBUG excludeOrderWithBackup] Exclusão e backup concluídos com sucesso.");
}

/**
 * Restores a previously excluded sale back to the orders list
 */
export async function restoreExcludedOrderToSystem(
  backup: ExcludedOrderBackup
): Promise<void> {
  const p = backup.pedidoCompleto;
  await savePedido(p);

  // 2. Remove from exclusions list
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "system_exclusions", backup.id);
      await deleteDoc(docRef);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `system_exclusions/${backup.id}`);
    }
  } else {
    const list = getLocalStorageExclusions();
    const filtered = list.filter(b => b.id !== backup.id);
    setLocalStorageExclusions(filtered);
  }
}

/**
 * Subscribes to real-time custom users
 */
export function subscribeUsers(
  onUpdate: (users: CustomUser[]) => void,
  onError: (error: any) => void
): () => void {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, "users"));
    return onSnapshot(q, (snapshot) => {
      const list: CustomUser[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          username: d.username || '',
          password: d.password || '',
          name: d.name || '',
          role: d.role || 'user',
          active: d.active !== false,
        });
      });
      onUpdate(list);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, "users");
      } catch (formattedError: any) {
        onError(formattedError);
      }
    });
  } else {
    // LocalStorage Mode
    const list = getLocalStorageUsers();
    onUpdate(list);
    
    const localCallback = (freshList: CustomUser[]) => {
      onUpdate(freshList);
    };
    usersLocalListeners.add(localCallback);
    
    return () => {
      usersLocalListeners.delete(localCallback);
    };
  }
}

/**
 * Saves or updates a custom user in users collection
 */
export async function saveCustomUser(user: CustomUser): Promise<string> {
  const payload: any = {
    username: user.username.trim().toLowerCase(),
    name: user.name.trim(),
    role: user.role || 'user',
    active: user.active !== false,
  };

  if (user.password && user.password.trim() !== '') {
    if (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
      const salt = bcrypt.genSaltSync(10);
      payload.password = bcrypt.hashSync(user.password.trim(), salt);
    } else {
      payload.password = user.password;
    }
  } else if (user.id) {
    // If updating but password is empty, don't overwrite password
    // (the caller should retrieve existing password hash first)
  }

  if (isFirebaseConfigured && db) {
    try {
      const userId = user.id || `user-${payload.username}`;
      const docRef = doc(db, "users", userId);
      await setDoc(docRef, payload, { merge: true });
      return userId;
    } catch (err: any) {
      handleFirestoreError(err, user.id ? OperationType.UPDATE : OperationType.CREATE, `users/${user.id || 'new'}`);
    }
  } else {
    const list = getLocalStorageUsers();
    let finalId = user.id || `user-${payload.username}`;
    const existingIdx = list.findIndex(u => u.id === finalId || u.username === payload.username);
    if (existingIdx !== -1) {
      // Merge password if omitted
      if (!payload.password && list[existingIdx].password) {
        payload.password = list[existingIdx].password;
      }
      list[existingIdx] = { ...list[existingIdx], ...payload, id: finalId };
    } else {
      list.push({ ...payload, id: finalId });
    }
    setLocalStorageUsers(list);
    return finalId;
  }
}

/**
 * Deletes a custom user
 */
export async function deleteCustomUser(id: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "users", id);
      await deleteDoc(docRef);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
    }
  } else {
    const list = getLocalStorageUsers();
    const filtered = list.filter(u => u.id !== id);
    setLocalStorageUsers(filtered);
  }
}

