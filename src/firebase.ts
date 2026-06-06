import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocFromServer,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Pedido } from './types';

// Check if Firebase is configured with real credentials (not placeholders)
export const isFirebaseConfigured = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'placeholder_key' && 
  firebaseConfig.projectId && 
  firebaseConfig.projectId !== 'placeholder_project';

let app: any;
let db: any;
const auth: any = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
  } catch (err) {
    console.warn("Erro ao inicializar Firebase. Entrando em modo offline (LocalStorage):", err);
  }
}

export { app, db, auth };

// 19. TRATAMENTO DE ERROS - Formatar erros de forma clara e legível
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    provider?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const customError: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
    }
  };
  console.error("Erro interno do Firestore:", JSON.stringify(customError));
  throw new Error(JSON.stringify(customError));
}

export function parseFirebaseError(err: any): string {
  if (!err) return 'Erro desconhecido.';
  
  let errMsg = err.message || String(err);
  try {
    const parsed = JSON.parse(errMsg);
    if (parsed && typeof parsed === 'object' && parsed.error) {
      errMsg = parsed.error;
    }
  } catch (e) {
    // Not JSON, continue with original message
  }
  
  const lowerMsg = errMsg.toLowerCase();
  if (lowerMsg.includes('permission-denied') || lowerMsg.includes('permission_denied') || lowerMsg.includes('permission denied') || lowerMsg.includes('insufficient')) {
    return 'Permissão negada pelo Firebase Firestore. Verifique as regras de segurança ou faça login.';
  }
  if (lowerMsg.includes('unregistered') || lowerMsg.includes('not initialized') || lowerMsg.includes('initialize')) {
    return 'Firebase Firestore não inicializado corretamente. Verifique as credenciais no arquivo do projeto.';
  }
  if (lowerMsg.includes('auth') || lowerMsg.includes('authenticate') || lowerMsg.includes('signed out') || lowerMsg.includes('invalid-credential') || lowerMsg.includes('unauthenticated')) {
    return 'Falha de autenticação do Firebase. Conecte-se antes de continuar.';
  }
  if (lowerMsg.includes('offline') || lowerMsg.includes('failed to connect') || lowerMsg.includes('network-error') || lowerMsg.includes('unavailable')) {
    return 'Erro de conexão: sem rede ou sem conexão ativa com o Firestore.';
  }
  if (lowerMsg.includes('quota') || lowerMsg.includes('exceeded')) {
    return 'Limite de cota diária do Firebase atingido. O limite de uso gratuito foi excedido.';
  }
  
  return errMsg;
}

// Test Connection
if (isFirebaseConfigured && db) {
  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error: any) {
      if (error && error.message && error.message.includes('the client is offline')) {
        console.warn("Conexão com Firebase: O cliente parece estar offline.");
      }
    }
  };
  testConnection();
}
