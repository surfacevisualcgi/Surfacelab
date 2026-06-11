/**
 * Teste de ISOLAMENTO DE TENANT — roda contra o Supabase LOCAL
 * (`npx supabase start` antes). Garante a regra de ouro: usuário do tenant A
 * NÃO lê nem escreve dados do tenant B, e o masking de PII/custos funciona.
 *
 * Rodar: npm run test:isolamento
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// chaves PADRÃO do stack local do Supabase CLI — não são segredo de produção
const ANON = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

function novoCliente(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false } });
}

async function criarUsuarioComTenant(rotulo: string) {
  const email = `${rotulo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@teste.local`;
  const senha = 'senha-forte-123';
  const cli = novoCliente();
  const { data: signup, error: erroSignup } = await cli.auth.signUp({
    email,
    password: senha,
    options: { data: { nome_exibicao: rotulo, termos_versao: 'teste' } },
  });
  if (erroSignup || !signup.session) throw new Error(`signup falhou: ${erroSignup?.message}`);

  const { data: tenantId, error: erroTenant } = await cli.rpc('criar_tenant', {
    p_nome: `Empresa ${rotulo}`,
  });
  if (erroTenant) throw new Error(`criar_tenant falhou: ${erroTenant.message}`);

  // renova a sessão para o JWT carregar o claim tenant_ativo
  await cli.auth.refreshSession();
  return { cli, email, tenantId: tenantId as string, userId: signup.user!.id };
}

let A: Awaited<ReturnType<typeof criarUsuarioComTenant>>;
let B: Awaited<ReturnType<typeof criarUsuarioComTenant>>;
let materialA: string;

beforeAll(async () => {
  A = await criarUsuarioComTenant('tenant-a');
  B = await criarUsuarioComTenant('tenant-b');

  const { data, error } = await A.cli
    .from('material')
    .insert({
      tenant_id: A.tenantId,
      nome: 'PLA Secreto do A',
      tipo: 'filamento',
      preco_compra: 12000,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insert material A falhou: ${error.message}`);
  materialA = data.id;
}, 60_000);

describe('isolamento multi-tenant (RLS)', () => {
  it('A lê o próprio material', async () => {
    const { data } = await A.cli.from('material').select('id, nome').eq('id', materialA);
    expect(data).toHaveLength(1);
  });

  it('B NÃO lê o material do tenant A', async () => {
    const { data, error } = await B.cli.from('material').select('id').eq('id', materialA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS filtra: linha invisível, não erro
  });

  it('B NÃO consegue inserir dados no tenant A (tenant_id forjado)', async () => {
    const { error } = await B.cli.from('material').insert({
      tenant_id: A.tenantId, // payload adulterado
      nome: 'invasor',
      tipo: 'filamento',
    });
    expect(error).not.toBeNull(); // bloqueado pela política de INSERT
  });

  it('B NÃO consegue atualizar material do tenant A', async () => {
    await B.cli.from('material').update({ nome: 'hackeado' }).eq('id', materialA);
    const { data } = await admin.from('material').select('nome').eq('id', materialA).single();
    expect(data?.nome).toBe('PLA Secreto do A'); // intacto
  });

  it('B não vê o tenant A na tabela tenant', async () => {
    const { data } = await B.cli.from('tenant').select('id').eq('id', A.tenantId);
    expect(data).toHaveLength(0);
  });

  it('B não vê memberships do tenant A', async () => {
    const { data } = await B.cli.from('membership').select('id').eq('tenant_id', A.tenantId);
    expect(data).toHaveLength(0);
  });

  it('claim de tenant forjado não dá acesso (trocar_tenant valida membership)', async () => {
    const { error } = await B.cli.rpc('trocar_tenant', { p_tenant: A.tenantId });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('membro');
  });
});

describe('ledger de estoque', () => {
  it('movimentação é imutável (UPDATE bloqueado)', async () => {
    const { data: mov, error: erroMov } = await A.cli
      .from('movimentacao_estoque')
      .insert({
        tenant_id: A.tenantId,
        material_id: materialA,
        tipo: 'entrada',
        quantidade: 1000,
        custo_unitario: 12,
      })
      .select('id')
      .single();
    expect(erroMov).toBeNull();

    // sem política de UPDATE + trigger de imutabilidade
    const { data: updData } = await A.cli
      .from('movimentacao_estoque')
      .update({ quantidade: 999999 })
      .eq('id', mov!.id)
      .select();
    expect(updData ?? []).toHaveLength(0); // nenhuma linha alterada

    const { data: conferencia } = await admin
      .from('movimentacao_estoque').select('quantidade').eq('id', mov!.id).single();
    expect(Number(conferencia?.quantidade)).toBe(1000);
  });

  it('entrada atualiza saldo e custo médio ponderado', async () => {
    const { data } = await A.cli
      .from('material').select('saldo, custo_medio').eq('id', materialA).single();
    expect(Number(data?.saldo)).toBe(1000);
    expect(Number(data?.custo_medio)).toBeCloseTo(12, 4);
  });
});

describe('masking de dados sensíveis', () => {
  it('dono vê PII do cliente; a view expõe pii_visivel', async () => {
    const { error } = await A.cli.from('cliente').insert({
      tenant_id: A.tenantId,
      nome: 'Cliente Sigiloso',
      cpf_cnpj: '123.456.789-00',
    });
    expect(error).toBeNull();
    const { data } = await A.cli.from('v_cliente').select('nome, cpf_cnpj, pii_visivel');
    expect(data).toHaveLength(1);
    expect(data![0].cpf_cnpj).toBe('123.456.789-00'); // dono tem a flag
    expect(data![0].pii_visivel).toBe(true);
  });

  it('B não vê clientes do A nem pela view', async () => {
    const { data } = await B.cli.from('v_cliente').select('id');
    expect(data).toHaveLength(0);
  });
});

describe('snapshot imutável de orçamento', () => {
  it('orçamento emitido não aceita alteração de valores', async () => {
    const { data: orc, error } = await A.cli
      .from('orcamento')
      .insert({ tenant_id: A.tenantId, numero: '', total: 50000, custo_total: 30000 })
      .select('id, numero')
      .single();
    expect(error).toBeNull();
    expect(orc!.numero).toMatch(/^ORC-\d{4}$/); // numeração automática

    // sai de rascunho
    await A.cli.from('orcamento').update({ status: 'enviado' }).eq('id', orc!.id);

    // tentar mudar o total deve falhar no trigger
    const { error: erroImutavel } = await A.cli
      .from('orcamento').update({ total: 1 }).eq('id', orc!.id);
    expect(erroImutavel).not.toBeNull();
    expect(erroImutavel!.message).toContain('imutáveis');
  });
});
