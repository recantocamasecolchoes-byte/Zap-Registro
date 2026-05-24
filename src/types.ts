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
  status: 'Pendente' | 'Agendado' | 'Reagendado' | 'Entregue e Não Pago' | 'Entregue';
  dataReagendamento?: string;
  textoOriginal: string;
  observacoes: string;
  userId?: string;
  createdAt?: string | number | Date | any;
  updatedAt?: string | number | Date | any;
}
