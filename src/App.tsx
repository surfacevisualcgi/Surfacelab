import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { PaginaCadastro, PaginaConvite, PaginaEmpresa, PaginaLogin } from './auth/paginas';
import { AppShell } from './layout/AppShell';
import { Carregando } from './components/ui';
import { PaginaDashboard } from './features/dashboard/PaginaDashboard';
import { PaginaModelos } from './features/modelos/PaginaModelos';
import { PaginaModeloDetalhe } from './features/modelos/PaginaModeloDetalhe';
import { PaginaProdutos } from './features/produtos/PaginaProdutos';
import { PaginaProdutoDetalhe } from './features/produtos/PaginaProdutoDetalhe';
import { PaginaCanais } from './features/canais/PaginaCanais';
import { PaginaCalculadora } from './features/calculadora/PaginaCalculadora';
import { PaginaOrcamentos } from './features/orcamentos/PaginaOrcamentos';
import { PaginaOrcamentoDetalhe } from './features/orcamentos/PaginaOrcamentoDetalhe';
import { PaginaPedidos } from './features/pedidos/PaginaPedidos';
import { PaginaPedidoDetalhe } from './features/pedidos/PaginaPedidoDetalhe';
import { PaginaOrdemProducao } from './features/pedidos/PaginaOrdemProducao';
import { PaginaEstoque } from './features/estoque/PaginaEstoque';
import { PaginaClientes } from './features/clientes/PaginaClientes';
import { PaginaFornecedores } from './features/fornecedores/PaginaFornecedores';
import { PaginaFinanceiro } from './features/financeiro/PaginaFinanceiro';
import { PaginaFiscal } from './features/fiscal/PaginaFiscal';
import { PaginaImpressoras } from './features/impressoras/PaginaImpressoras';
import { PaginaCadastros } from './features/cadastros/PaginaCadastros';
import { PaginaConfiguracoes } from './features/configuracoes/PaginaConfiguracoes';
import { PaginaConta } from './features/conta/PaginaConta';
import { PaginaLanding } from './features/landing/PaginaLanding';
import {
  PaginaCreatorLabAnuncios,
  PaginaCreatorLabImagens,
  PaginaCreatorLabRadar,
} from './features/creator-lab/PaginasCreatorLab';

export default function App() {
  const { carregando, session, ativa } = useAuth();

  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Carregando />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<PaginaLogin />} />
      <Route path="/cadastro" element={<PaginaCadastro />} />
      <Route path="/convite/:token" element={<PaginaConvite />} />

      {!session ? (
        <>
          <Route index element={<PaginaLanding />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : !ativa ? (
        <>
          <Route path="/empresa" element={<PaginaEmpresa />} />
          <Route path="*" element={<Navigate to="/empresa" replace />} />
        </>
      ) : (
        <>
          <Route path="/empresa" element={<PaginaEmpresa />} />
          <Route element={<AppShell />}>
            <Route index element={<PaginaDashboard />} />
            <Route path="/modelos" element={<PaginaModelos />} />
            <Route path="/modelos/:id" element={<PaginaModeloDetalhe />} />
            <Route path="/produtos" element={<PaginaProdutos />} />
            <Route path="/produtos/:id" element={<PaginaProdutoDetalhe />} />
            <Route path="/canais" element={<Navigate to="/canais/shopify" replace />} />
            <Route path="/canais/:canal" element={<PaginaCanais />} />
            <Route path="/calculadora" element={<PaginaCalculadora />} />
            <Route path="/orcamentos" element={<PaginaOrcamentos />} />
            <Route path="/orcamentos/:id" element={<PaginaOrcamentoDetalhe />} />
            <Route path="/pedidos" element={<PaginaPedidos />} />
            <Route path="/pedidos/:id" element={<PaginaPedidoDetalhe />} />
            <Route path="/producao/:id" element={<PaginaOrdemProducao />} />
            <Route path="/estoque" element={<PaginaEstoque />} />
            <Route path="/clientes" element={<PaginaClientes />} />
            <Route path="/fornecedores" element={<PaginaFornecedores />} />
            <Route path="/financeiro" element={<PaginaFinanceiro />} />
            <Route path="/fiscal" element={<PaginaFiscal />} />
            <Route path="/impressoras" element={<PaginaImpressoras />} />
            <Route path="/cadastros" element={<PaginaCadastros />} />
            <Route path="/configuracoes" element={<PaginaConfiguracoes />} />
            <Route path="/conta" element={<PaginaConta />} />
            <Route path="/creator-lab" element={<Navigate to="/creator-lab/anuncios" replace />} />
            <Route path="/creator-lab/anuncios" element={<PaginaCreatorLabAnuncios />} />
            <Route path="/creator-lab/imagens" element={<PaginaCreatorLabImagens />} />
            <Route path="/creator-lab/radar" element={<PaginaCreatorLabRadar />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </>
      )}
    </Routes>
  );
}
