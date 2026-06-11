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
import { PaginaCalculadora } from './features/calculadora/PaginaCalculadora';
import { PaginaOrcamentos } from './features/orcamentos/PaginaOrcamentos';
import { PaginaOrcamentoDetalhe } from './features/orcamentos/PaginaOrcamentoDetalhe';
import { PaginaPedidos } from './features/pedidos/PaginaPedidos';
import { PaginaOrdemProducao } from './features/pedidos/PaginaOrdemProducao';
import { PaginaEstoque } from './features/estoque/PaginaEstoque';
import { PaginaClientes } from './features/clientes/PaginaClientes';
import { PaginaFornecedores } from './features/fornecedores/PaginaFornecedores';
import { PaginaFinanceiro } from './features/financeiro/PaginaFinanceiro';
import { PaginaCadastros } from './features/cadastros/PaginaCadastros';
import { PaginaConfiguracoes } from './features/configuracoes/PaginaConfiguracoes';
import { PaginaConta } from './features/conta/PaginaConta';

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
        <Route path="*" element={<Navigate to="/login" replace />} />
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
            <Route path="/calculadora" element={<PaginaCalculadora />} />
            <Route path="/orcamentos" element={<PaginaOrcamentos />} />
            <Route path="/orcamentos/:id" element={<PaginaOrcamentoDetalhe />} />
            <Route path="/pedidos" element={<PaginaPedidos />} />
            <Route path="/producao/:id" element={<PaginaOrdemProducao />} />
            <Route path="/estoque" element={<PaginaEstoque />} />
            <Route path="/clientes" element={<PaginaClientes />} />
            <Route path="/fornecedores" element={<PaginaFornecedores />} />
            <Route path="/financeiro" element={<PaginaFinanceiro />} />
            <Route path="/cadastros" element={<PaginaCadastros />} />
            <Route path="/configuracoes" element={<PaginaConfiguracoes />} />
            <Route path="/conta" element={<PaginaConta />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </>
      )}
    </Routes>
  );
}
