export interface Pedido {
  id: string;
  numeroVenda: string;
  data: string; // Ex: DD/MM (04/05)
  nomeCompleto: string;
  telefone1: string;
  telefone2: string;
  endereco: string;
  produto: string;
  cor: string;
  quantidade: number;
  formaPagamento: string;
  valorTotal: number;
  comissao: number;
  status: 'PENDING' | 'RESCHEDULED' | 'DELIVERED_UNPAID' | 'DELIVERED' | 'CANCELLED';
  dataReagendamento?: string;
  rescheduleDate?: string;
  textoOriginal: string;
  observacoes: string;
  city?: string;
  state?: string;
  supplier?: 'SOFIA_HOME_DECOR' | 'MICHAEL' | 'FRANK' | 'OUTROS';
  userId?: string;
  createdAt?: string | number | Date | any;
  updatedAt?: string | number | Date | any;
}

export interface AiAnalysisLog {
  id: string;
  timestamp: string;
  durationMs: number;
  textLength: number;
  inputText: string;
  error?: string;
  response?: string;
  isRapid: boolean;
  supplier?: string;
  modelUsed?: string;
  errorCode?: string | number;
}

export interface ExcludedOrderBackup {
  id: string; // unique exclusion ID
  deletedAtDate: string; // DD/MM/YYYY
  deletedAtTime: string; // HH:mm
  deletedBy: string; // email/user
  supplier: string; // supplier
  pedidoCompleto: Pedido; // full Pedido object
}

