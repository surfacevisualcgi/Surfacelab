import { useMemo, useState, type ChangeEvent } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EstadoVazio,
  Selecao,
} from '@/components/ui';
import {
  carregarConfigOpenAI,
  gerarImagemOpenAI,
  gerarJsonOpenAI,
} from '@/lib/creatorLabOpenAI';

type Canal = 'Shopee' | 'Mercado Livre' | 'Instagram' | 'TikTok';

const canais: Canal[] = ['Shopee', 'Mercado Livre', 'Instagram', 'TikTok'];
const estiloInput = 'w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm text-ink placeholder:text-texto-2/60 focus:border-brand-azul focus:outline-none focus:ring-2 focus:ring-brand-azul/20';

const PLAYBOOKS: Record<Canal, {
  foco: string;
  pensamento: string;
  anuncio: string[];
  imagens: string[];
  evitar: string[];
}> = {
  Shopee: {
    foco: 'Busca, comparacao rapida e decisao por preco/beneficio.',
    pensamento: 'Comprador quer entender rapido o que e, para que serve, se cabe na necessidade dele e por que vale clicar neste anuncio entre muitos parecidos.',
    anuncio: [
      'Titulo claro com produto + especificacao principal + uso.',
      'Descricao direta, com beneficios práticos antes de detalhes tecnicos.',
      'Palavras-chave naturais que o comprador pesquisaria.',
      'Reforcar pronta entrega, variacoes, personalizacao e itens inclusos quando existir.',
    ],
    imagens: [
      'Capa chamativa, mas com produto reconhecivel.',
      'Foto limpa do produto inteiro.',
      'Imagem de medidas e capacidade.',
      'Imagem de uso real e beneficios objetivos.',
      'Variacoes de cor/modelo quando houver.',
    ],
    evitar: [
      'Titulo confuso ou cheio de repeticoes.',
      'Promessas absolutas sem prova.',
      'Imagem bonita que nao deixa claro o produto real.',
    ],
  },
  'Mercado Livre': {
    foco: 'Clareza, ficha tecnica, confianca e intencao de compra alta.',
    pensamento: 'Comprador geralmente ja sabe o que procura. O anuncio deve reduzir risco: nome correto, medidas, material, compatibilidade, prazo e o que acompanha.',
    anuncio: [
      'Titulo objetivo no formato produto + especificacao + aplicacao.',
      'Descricao sem exagero, com informacao tecnica organizada.',
      'Bullets com medidas, material, acabamento, compatibilidade e conteudo da compra.',
      'Separar beneficios de dados tecnicos.',
    ],
    imagens: [
      'Primeira imagem limpa e objetiva.',
      'Detalhes de acabamento em close.',
      'Medidas bem legiveis.',
      'Produto em escala ou em uso.',
      'Comparacao apenas se ajudar a decisao.',
    ],
    evitar: [
      'Linguagem de urgencia exagerada.',
      'Texto visual poluido nas imagens principais.',
      'Omitir dimensoes, material ou limitacoes.',
    ],
  },
  Instagram: {
    foco: 'Desejo visual, contexto de uso, presenteavel e identidade.',
    pensamento: 'A pessoa nao necessariamente estava procurando o produto. A comunicacao precisa criar vontade, mostrar o produto bonito e explicar o valor em poucas linhas.',
    anuncio: [
      'Comecar com gancho visual/emocional.',
      'Legenda curta, escaneavel e com chamada para conversa ou link.',
      'Valorizar presente, personalizacao, bastidores e acabamento.',
      'Usar hashtags especificas e poucas, sem parecer spam.',
    ],
    imagens: [
      'Lifestyle com boa luz e produto em uso.',
      'Carrossel com capa, detalhe, uso, variacoes e chamada.',
      'Reels/story vertical com demonstracao curta.',
      'Close de textura, cor e acabamento.',
    ],
    evitar: [
      'Ficha tecnica longa demais na legenda.',
      'Imagem com cara de marketplace generico.',
      'Texto pequeno ou excesso de informacao no criativo.',
    ],
  },
  TikTok: {
    foco: 'Atencao nos primeiros segundos, demonstracao e criativo nativo.',
    pensamento: 'O produto precisa virar cena: problema, transformacao e uso. Funciona melhor com video vertical, som, pessoa/manipulacao do produto e gancho rapido.',
    anuncio: [
      'Criar gancho de 1 a 3 segundos.',
      'Roteiro em cenas curtas: problema, produto, prova, chamada.',
      'Linguagem natural, como conteudo de criador.',
      'CTA simples: comentar, pedir no link, chamar no direct ou ver loja.',
    ],
    imagens: [
      'Frames verticais 9:16 com acao.',
      'Produto sendo usado por uma pessoa.',
      'Antes/depois ou problema/solucao.',
      'Texto grande, pouco e seguro para tela mobile.',
    ],
    evitar: [
      'Criativo com cara de catalogo parado.',
      'Comecar explicando demais antes de mostrar valor.',
      'Texto longo ou fora de area segura.',
    ],
  },
};

interface ResultadoAnuncio {
  estrategia: string;
  titulo: string;
  titulosAlternativos: string[];
  descricaoCurta: string;
  descricaoCompleta: string;
  bullets: string[];
  palavrasChave: string[];
  chamadaPrincipal: string;
  roteiroVideoCurto: string[];
  sugestoesImagens: string[];
  checklistPublicacao: string[];
}

interface PromptImagem {
  tipo: string;
  titulo: string;
  prompt: string;
  uso: string;
  textoSobreposto: string;
  proporcao: string;
  observacaoPlataforma: string;
  imagemUrl?: string;
  gerando?: boolean;
  erro?: string;
}

interface ResultadoPacoteImagem {
  nomeProdutoSugerido: string;
  descricaoVisualReferencia: string;
  imagens: PromptImagem[];
}

interface ResultadoRadar {
  premissas: string[];
  nivelConfianca: string;
  resumo: string;
  score: number;
  recomendacaoCanal: string;
  precoSugerido: string;
  alertaCapacidade: string;
  concorrentes: {
    produto: string;
    precoMedio: string;
    vendasEstimadas: string;
    concorrencia: string;
    canal: string;
  }[];
  viabilidade: {
    tempoEstimado: string;
    filamento: string;
    custoUnitario: string;
    margemProvavel: string;
    dificuldade: string;
    riscoAtraso: string;
    compatibilidade: string;
  };
  proximosPassos: string[];
}

function CreatorLabLayout({
  ativo,
  children,
}: {
  ativo: 'anuncios' | 'imagens' | 'radar';
  children: React.ReactNode;
}) {
  const tabs = [
    { id: 'anuncios', rotulo: 'Anuncios', para: '/creator-lab/anuncios' },
    { id: 'imagens', rotulo: 'Imagens', para: '/creator-lab/imagens' },
    { id: 'radar', rotulo: 'Radar', para: '/creator-lab/radar' },
  ] as const;
  return (
    <div>
      <CabecalhoPagina
        titulo="Creator Lab"
        subtitulo="Ferramentas comerciais com IA para transformar produtos 3D em material de venda."
      />
      <div className="mb-5 flex flex-wrap gap-1 border-b border-borda">
        {tabs.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.para}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              ativo === tab.id ? 'border-brand-roxo text-ink' : 'border-transparent text-texto-2 hover:text-ink'
            }`}
          >
            {tab.rotulo}
          </NavLink>
        ))}
      </div>
      {children}
    </div>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${estiloInput} ${props.className ?? ''}`} />;
}

function StatusOpenAI() {
  const configurado = !!carregarConfigOpenAI();
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
      configurado ? 'border-ok/30 bg-ok/5 text-ok' : 'border-alerta/30 bg-alerta/5 text-alerta'
    }`}>
      {configurado
        ? 'OpenAI configurada. As geracoes usam a chave salva em Configuracoes.'
        : 'Configure sua chave em Configuracoes > OpenAI para gerar com IA.'}
    </div>
  );
}

function PlaybookCanal({ canal, compacto = false }: { canal: Canal; compacto?: boolean }) {
  const p = PLAYBOOKS[canal];
  return (
    <div className="rounded-lg border border-brand-roxo/20 bg-brand-roxo/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-extrabold uppercase text-brand-roxo">Como pensar para {canal}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-texto-2">{p.foco}</span>
      </div>
      <p className="text-xs leading-relaxed text-texto-2">{p.pensamento}</p>
      {!compacto && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <ListaCompacta titulo="Anuncio" itens={p.anuncio} />
          <ListaCompacta titulo="Imagens" itens={p.imagens} />
          <ListaCompacta titulo="Evitar" itens={p.evitar} />
        </div>
      )}
    </div>
  );
}

function ListaCompacta({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-extrabold uppercase text-ink">{titulo}</p>
      <ul className="space-y-1 text-[11px] leading-snug text-texto-2">
        {itens.map((item) => <li key={item}>- {item}</li>)}
      </ul>
    </div>
  );
}

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
      className="rounded-md border border-borda px-2 py-1 text-[11px] font-bold text-texto-2 hover:bg-surface-2 hover:text-ink"
    >
      {ok ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function BlocoResultado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-lg border border-borda bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-extrabold uppercase text-texto-2">{titulo}</h3>
        <Copiar texto={texto} />
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{texto}</p>
    </div>
  );
}

function fileParaDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function erroMensagem(err: unknown) {
  return err instanceof Error ? err.message : 'Nao foi possivel gerar agora.';
}

export function PaginaCreatorLabAnuncios() {
  const [canal, setCanal] = useState<Canal>('Shopee');
  const [produto, setProduto] = useState('Caixa de figurinhas Copa do Mundo 2026');
  const [descricao, setDescricao] = useState('Caixinha impressa em 3D para guardar figurinhas, com acabamento azul e branco.');
  const [material, setMaterial] = useState('PLA');
  const [medidas, setMedidas] = useState('12 x 9 x 4 cm');
  const [preco, setPreco] = useState('55,00');
  const [publico, setPublico] = useState('Colecionadores, pais e criancas que juntam figurinhas');
  const [objetivo, setObjetivo] = useState('Vender rapido destacando organizacao, presente e personalizacao');
  const [instrucoes, setInstrucoes] = useState('Tom comercial, direto e com palavras de busca para marketplace.');
  const [preview, setPreview] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAnuncio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolherFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(await fileParaDataUrl(file));
  }

  async function gerar() {
    const cfg = carregarConfigOpenAI();
    if (!cfg) {
      setErro('Configure a chave da OpenAI em Configuracoes > OpenAI.');
      return;
    }
    if (!preview) {
      setErro('Envie uma foto de referencia do produto. Nesta tela, a imagem e a fonte principal.');
      return;
    }
    const playbook = PLAYBOOKS[canal];
    setCarregando(true);
    setErro(null);
    try {
      const res = await gerarJsonOpenAI<ResultadoAnuncio>({
        apiKey: cfg.apiKey,
        model: cfg.textModel,
        imageDataUrl: preview,
        system: 'Voce e um estrategista senior de e-commerce para produtos de impressao 3D no Brasil. Gere material comercial pratico, honesto e pronto para copiar. Responda somente JSON valido, sem markdown.',
        prompt: `Crie um anuncio comercial em portugues para o canal ${canal}.
Estrategia da plataforma:
Foco: ${playbook.foco}
Como pensar: ${playbook.pensamento}
Boas praticas de anuncio: ${playbook.anuncio.join(' | ')}
Boas praticas visuais: ${playbook.imagens.join(' | ')}
Evitar: ${playbook.evitar.join(' | ')}

Produto: ${produto}
Descricao: ${descricao}
Material: ${material}
Medidas: ${medidas}
Preco: R$ ${preco}
Publico-alvo: ${publico}
Objetivo: ${objetivo}
Instrucoes adicionais: ${instrucoes}

Regras:
- Nao invente certificacoes, garantias, marca oficial, licenca ou compatibilidade se nao foi informado.
- Se for item inspirado em evento/personagem/marca, evite afirmar produto oficial.
- Adapte tom, estrutura e CTA ao canal escolhido.
- Use linguagem brasileira, natural e vendavel.
- Para marketplace, priorize busca, clareza e dados objetivos.
- Para rede social, priorize gancho, desejo, demonstracao e CTA curto.

Responda exatamente neste formato JSON:
{
  "estrategia": "string explicando em 2 a 4 frases a logica usada para o canal",
  "titulo": "string",
  "titulosAlternativos": ["string"],
  "descricaoCurta": "string",
  "descricaoCompleta": "string",
  "bullets": ["string"],
  "palavrasChave": ["string"],
  "chamadaPrincipal": "string",
  "roteiroVideoCurto": ["string"],
  "sugestoesImagens": ["string"],
  "checklistPublicacao": ["string"]
}`,
      });
      setResultado(res);
    } catch (err) {
      setErro(erroMensagem(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <CreatorLabLayout ativo="anuncios">
      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(460px,1.1fr)]">
        <Cartao className="space-y-4">
          <div>
            <h2 className="text-sm font-extrabold text-ink">Configurar anuncio</h2>
            <p className="mt-1 text-xs text-texto-2">Gere titulo, descricao, bullets, palavras-chave e ideias de imagem por canal.</p>
          </div>
          <StatusOpenAI />
          <PlaybookCanal canal={canal} />
          <Campo rotulo="Foto do produto">
            <input type="file" accept="image/*" onChange={escolherFoto} className="text-sm" />
            {preview && <img src={preview} alt="Produto" className="mt-2 h-28 rounded-lg border border-borda object-cover" />}
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Produto"><Entrada value={produto} onChange={(e) => setProduto(e.target.value)} /></Campo>
            <Campo rotulo="Preco"><Entrada value={preco} onChange={(e) => setPreco(e.target.value)} /></Campo>
            <Campo rotulo="Material"><Entrada value={material} onChange={(e) => setMaterial(e.target.value)} /></Campo>
            <Campo rotulo="Medidas"><Entrada value={medidas} onChange={(e) => setMedidas(e.target.value)} /></Campo>
          </div>
          <Campo rotulo="Descricao curta"><Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
          <Campo rotulo="Publico-alvo"><Entrada value={publico} onChange={(e) => setPublico(e.target.value)} /></Campo>
          <Campo rotulo="Canal">
            <div className="grid grid-cols-2 gap-2">
              {canais.map((c) => (
                <button key={c} type="button" onClick={() => setCanal(c)}
                  className={`rounded-lg border px-3 py-2 text-sm font-bold ${canal === c ? 'border-brand-roxo bg-brand-roxo/10 text-brand-roxo' : 'border-borda text-texto-2 hover:bg-surface-2'}`}>
                  {c}
                </button>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Objetivo"><Entrada value={objetivo} onChange={(e) => setObjetivo(e.target.value)} /></Campo>
          <Campo rotulo="Instrucoes adicionais"><Textarea rows={3} value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} /></Campo>
          {erro && <p className="text-xs font-bold text-erro">{erro}</p>}
          <Botao type="button" variante="acento" className="w-full" disabled={carregando} onClick={gerar}>
            {carregando ? 'Gerando...' : 'Gerar anuncio com IA'}
          </Botao>
        </Cartao>

        <Cartao className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-ink">Resultado - {canal}</h2>
              <p className="mt-1 text-xs text-texto-2">Nada e salvo automaticamente. Copie apenas o que quiser usar.</p>
            </div>
          </div>
          {!resultado ? <EstadoVazio mensagem="Preencha os dados e gere um anuncio para ver o resultado aqui." /> : (
            <div className="space-y-3">
              <BlocoResultado titulo="Estrategia do canal" texto={resultado.estrategia} />
              <BlocoResultado titulo="Titulo" texto={resultado.titulo} />
              <BlocoResultado titulo="Titulos alternativos" texto={(resultado.titulosAlternativos ?? []).map((t, i) => `${i + 1}. ${t}`).join('\n')} />
              <BlocoResultado titulo="Descricao curta" texto={resultado.descricaoCurta} />
              <BlocoResultado titulo="Descricao completa" texto={resultado.descricaoCompleta} />
              <BlocoResultado titulo="Bullets" texto={(resultado.bullets ?? []).map((b) => `- ${b}`).join('\n')} />
              <BlocoResultado titulo="Palavras-chave" texto={(resultado.palavrasChave ?? []).join(', ')} />
              <BlocoResultado titulo="Chamada principal" texto={resultado.chamadaPrincipal} />
              <BlocoResultado titulo="Roteiro curto / Reels / TikTok" texto={(resultado.roteiroVideoCurto ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')} />
              <BlocoResultado titulo="Sugestoes de imagens" texto={(resultado.sugestoesImagens ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')} />
              <BlocoResultado titulo="Checklist de publicacao" texto={(resultado.checklistPublicacao ?? []).map((s) => `- ${s}`).join('\n')} />
            </div>
          )}
        </Cartao>
      </div>
    </CreatorLabLayout>
  );
}

export function PaginaCreatorLabImagens() {
  const [canal, setCanal] = useState<Canal>('Shopee');
  const [tipoPacote, setTipoPacote] = useState('Pacote marketplace completo');
  const [estilo, setEstilo] = useState('Chamativo');
  const [instrucoes, setInstrucoes] = useState('Preservar o formato, cores e textura do produto da foto. Criar imagens comerciais sem transformar o objeto em outro produto.');
  const [preview, setPreview] = useState<string | null>(null);
  const [nomeSugerido, setNomeSugerido] = useState('');
  const [descricaoReferencia, setDescricaoReferencia] = useState('');
  const [prompts, setPrompts] = useState<PromptImagem[]>([]);
  const [selecionado, setSelecionado] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function escolherFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(await fileParaDataUrl(file));
    setNomeSugerido('');
    setDescricaoReferencia('');
    setPrompts([]);
    setErro(null);
  }

  function atualizarImagem(index: number, patch: Partial<PromptImagem>) {
    setPrompts((atuais) => atuais.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function gerarPacote() {
    const cfg = carregarConfigOpenAI();
    if (!cfg) {
      setErro('Configure a chave da OpenAI em Configuracoes > OpenAI.');
      return;
    }
    const playbook = PLAYBOOKS[canal];
    setCarregando(true);
    setErro(null);
    setProgresso('Criando direcao visual do pacote...');
    try {
      const res = await gerarJsonOpenAI<ResultadoPacoteImagem>({
        apiKey: cfg.apiKey,
        model: cfg.textModel,
        imageDataUrl: preview,
        system: 'Voce e diretor de arte de e-commerce e social commerce para produtos impressos em 3D. Gere prompts praticos, realistas e seguros para IA de imagem. Responda somente JSON valido, sem markdown.',
        prompt: `Analise a IMAGEM DE REFERENCIA enviada. Ela e a fonte principal do produto.
Crie 9 prompts de imagem para um anuncio no canal ${canal}, preservando o objeto da foto.
Estrategia visual da plataforma:
Foco: ${playbook.foco}
Como pensar: ${playbook.pensamento}
Boas praticas visuais: ${playbook.imagens.join(' | ')}
Evitar: ${playbook.evitar.join(' | ')}

Tipo de pacote: ${tipoPacote}
Estilo: ${estilo}
Instrucoes: ${instrucoes}

As 9 imagens devem cobrir exatamente esta ordem:
1. capa persuasiva
2. produto limpo/fundo branco
3. medidas do produto
4. produto em uso
5. beneficios
6. variacoes de cor
7. detalhes do acabamento
8. comparacao/diferencial
9. chamada final

Regras:
- Escreva prompts em portugues, mas com direcao visual precisa.
- A referencia visual manda mais do que qualquer suposicao textual.
- Nao transforme o objeto em outro produto, nao mude sua funcao percebida e nao invente uma categoria se a foto nao sustentar.
- Preserve formato geral, proporcoes, cores predominantes, textura, acabamento, material aparente e detalhes fisicos da imagem enviada.
- Nao use nome do produto dentro da imagem, exceto se o usuario pedir nas instrucoes adicionais.
- Nao crie marca oficial, logo, campeonato, personagem, licenca, embalagem ou texto que nao exista na referencia.
- Se houver texto sobreposto, use frases genericas de beneficio, nunca nomes de marca/propriedade intelectual.
- Para Mercado Livre, priorize clareza, produto real, escala, medidas e acabamento.
- Para Shopee, equilibre clareza com capa mais persuasiva.
- Para Instagram, pense em carrossel bonito, lifestyle e desejo.
- Para TikTok, pense em frames verticais de video, demonstracao e gancho.
- Defina proporcao adequada: marketplace 1:1, Instagram 4:5 ou 9:16, TikTok 9:16.
- O prompt final de cada imagem deve ser pronto para gerar IMAGEM FINAL, nao apenas ideia.
- Evite textos longos dentro da imagem. Priorize composicao clara e produto vendavel.
- Sugira um nome curto para o produto com base na referencia, mas use esse nome somente no JSON, nao nos prompts de imagem.

Responda exatamente neste formato:
{
  "nomeProdutoSugerido": "string curta baseada apenas na referencia",
  "descricaoVisualReferencia": "string descrevendo formato, cores, material e detalhes visiveis da referencia",
  "imagens": [
    {
      "tipo": "string",
      "titulo": "string",
      "prompt": "string",
      "uso": "string",
      "textoSobreposto": "string",
      "proporcao": "string",
      "observacaoPlataforma": "string"
    }
  ]
}`,
      });
      setNomeSugerido(res.nomeProdutoSugerido ?? '');
      setDescricaoReferencia(res.descricaoVisualReferencia ?? '');
      const pacote = (res.imagens ?? []).slice(0, 9).map((item) => ({ ...item, gerando: true, imagemUrl: undefined, erro: undefined }));
      setPrompts(pacote);
      setSelecionado(0);
      for (let i = 0; i < pacote.length; i += 1) {
        setProgresso(`Gerando imagem ${i + 1} de ${pacote.length}...`);
        try {
          const url = await gerarImagemOpenAI({
            apiKey: cfg.apiKey,
            model: cfg.imageModel,
            prompt: pacote[i].prompt,
            referenceImageDataUrl: preview,
          });
          atualizarImagem(i, { imagemUrl: url, gerando: false });
        } catch (err) {
          atualizarImagem(i, { gerando: false, erro: erroMensagem(err) });
        }
      }
      setProgresso('Pacote visual gerado.');
    } catch (err) {
      setErro(erroMensagem(err));
    } finally {
      setCarregando(false);
      setTimeout(() => setProgresso(''), 2500);
    }
  }

  async function regenerarSelecionada() {
    const cfg = carregarConfigOpenAI();
    const item = prompts[selecionado];
    if (!cfg || !item) return;
    setErro(null);
    atualizarImagem(selecionado, { gerando: true, erro: undefined });
    try {
      const url = await gerarImagemOpenAI({
        apiKey: cfg.apiKey,
        model: cfg.imageModel,
        prompt: item.prompt,
        referenceImageDataUrl: preview,
      });
      atualizarImagem(selecionado, { imagemUrl: url, gerando: false });
    } catch (err) {
      atualizarImagem(selecionado, { gerando: false, erro: erroMensagem(err) });
    }
  }

  return (
    <CreatorLabLayout ativo="imagens">
      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Cartao className="space-y-4 self-start">
          <div>
            <h2 className="text-sm font-extrabold text-ink">Configurar pacote de imagens</h2>
            <p className="mt-1 text-xs text-texto-2">Gere 9 imagens finais, prontas para revisar, baixar e usar no anuncio.</p>
          </div>
          <StatusOpenAI />
          <Campo rotulo="Foto de referencia do produto">
            <label className="block cursor-pointer overflow-hidden rounded-lg border border-borda bg-surface-2 hover:bg-white">
              {preview ? (
                <img src={preview} alt="Produto" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <span className="flex aspect-[4/3] items-center justify-center px-4 text-center text-sm font-semibold text-texto-2">
                  Clique para enviar a foto que a IA deve seguir
                </span>
              )}
              <input type="file" accept="image/*" onChange={escolherFoto} className="hidden" />
            </label>
          </Campo>
          {(nomeSugerido || descricaoReferencia) && (
            <div className="rounded-lg border border-borda bg-surface-2 p-3">
              {nomeSugerido && (
                <p className="text-xs text-texto-2">
                  <strong className="text-ink">Nome sugerido:</strong> {nomeSugerido}
                </p>
              )}
              {descricaoReferencia && (
                <p className="mt-1 text-xs leading-relaxed text-texto-2">
                  <strong className="text-ink">Referencia detectada:</strong> {descricaoReferencia}
                </p>
              )}
            </div>
          )}
          <Campo rotulo="Canal">
            <div className="grid grid-cols-2 gap-2">
              {canais.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCanal(c)}
                  className={`rounded-lg border px-3 py-2 text-sm font-bold ${canal === c ? 'border-brand-roxo bg-brand-roxo/10 text-brand-roxo' : 'border-borda text-texto-2 hover:bg-surface-2'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Tipo de pacote">
            <div className="grid grid-cols-2 gap-2">
              {['Capa persuasiva', 'Fundo branco', 'Lifestyle', 'Pacote marketplace completo'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTipoPacote(p)}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${tipoPacote === p ? 'border-brand-roxo bg-brand-roxo/10 text-brand-roxo' : 'border-borda text-texto-2 hover:bg-surface-2'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Estilo">
            <div className="grid grid-cols-3 gap-2">
              {['Limpo', 'Chamativo', 'Premium', 'Infantil', 'Tecnico'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setEstilo(p)}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${estilo === p ? 'border-brand-roxo bg-brand-roxo/10 text-brand-roxo' : 'border-borda text-texto-2 hover:bg-surface-2'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Instrucoes adicionais (opcional)">
            <Textarea rows={5} maxLength={300} value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} />
            <span className="mt-1 block text-right text-[11px] text-texto-2">{instrucoes.length}/300</span>
          </Campo>
          {erro && <p className="text-xs font-bold text-erro">{erro}</p>}
          {progresso && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs font-bold text-texto-2">{progresso}</p>}
          <Botao type="button" variante="acento" className="w-full" disabled={carregando} onClick={gerarPacote}>
            {carregando ? 'Gerando imagens...' : 'Gerar pacote visual'}
          </Botao>
        </Cartao>

        <Cartao>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-ink">Pacote {canal} - 9 imagens</h2>
              <p className="mt-1 text-xs text-texto-2">As imagens aparecem aqui em grade, como um pacote de marketplace/social pronto para revisar.</p>
            </div>
            {prompts.length > 0 && (
              <Botao type="button" variante="secundario" disabled={prompts[selecionado]?.gerando} onClick={regenerarSelecionada}>
                Regenerar selecionada
              </Botao>
            )}
          </div>
          {prompts.length === 0 ? <EstadoVazio mensagem="Gere um pacote para receber 9 imagens finais aqui." /> : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {prompts.map((p, i) => (
                <div
                  key={`${p.tipo}-${i}`}
                  className={`rounded-lg border bg-white p-3 transition-colors ${selecionado === i ? 'border-brand-roxo shadow-sm shadow-brand-roxo/10' : 'border-borda'}`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selecionado === i}
                      onChange={() => setSelecionado(i)}
                      className="accent-brand-roxo"
                    />
                    <button type="button" onClick={() => setSelecionado(i)} className="flex-1 text-left text-xs font-extrabold text-ink">
                      <span className="mr-1 rounded bg-ink px-1.5 py-0.5 text-[10px] text-white">{i + 1}</span>
                      {p.titulo || p.tipo}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelecionado(i)}
                    className="relative block aspect-square w-full overflow-hidden rounded-lg border border-borda bg-surface-2"
                  >
                    {p.imagemUrl ? (
                      <img src={p.imagemUrl} alt={p.titulo} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-xs font-semibold text-texto-2">
                        <span className="size-7 animate-spin rounded-full border-2 border-borda border-t-brand-roxo" />
                        {p.gerando ? 'Gerando imagem...' : p.erro ? 'Falha ao gerar' : 'Aguardando imagem'}
                      </div>
                    )}
                  </button>
                  {p.erro && <p className="mt-2 text-[11px] font-bold text-erro">{p.erro}</p>}
                  <div className="mt-3 flex gap-2">
                    <Copiar texto={p.prompt} />
                    {p.imagemUrl ? (
                      <a
                        href={p.imagemUrl}
                        download={`creator-lab-${canal.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.png`}
                        className="inline-flex flex-1 items-center justify-center rounded-md border border-borda px-2 py-1 text-[11px] font-bold text-texto-2 hover:bg-surface-2 hover:text-ink"
                      >
                        Baixar
                      </a>
                    ) : (
                      <button type="button" disabled className="flex-1 rounded-md border border-borda px-2 py-1 text-[11px] font-bold text-texto-2 opacity-50">
                        Baixar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-texto-2">
            Ao gerar, voce recebe 9 imagens otimizadas para o canal selecionado. Os prompts ficam disponiveis apenas para copiar ou regenerar imagens.
          </p>
        </Cartao>
      </div>
    </CreatorLabLayout>
  );
}

export function PaginaCreatorLabRadar() {
  const [busca, setBusca] = useState('suporte celular impressao 3D');
  const [canal, setCanal] = useState<Canal>('Shopee');
  const [capacidade, setCapacidade] = useState('2 impressoras FDM, foco em pecas pequenas, evitar produtos com muito acabamento manual');
  const [resultado, setResultado] = useState<ResultadoRadar | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const sugestoes = ['organizador 3D', 'miniatura 3D', 'cosplay', 'porta controle', 'brindes personalizados', 'suporte celular'];

  async function analisar() {
    const cfg = carregarConfigOpenAI();
    if (!cfg) {
      setErro('Configure a chave da OpenAI em Configuracoes > OpenAI.');
      return;
    }
    const playbook = PLAYBOOKS[canal];
    setCarregando(true);
    setErro(null);
    try {
      const res = await gerarJsonOpenAI<ResultadoRadar>({
        apiKey: cfg.apiKey,
        model: cfg.textModel,
        system: 'Voce e um analista comercial de e-commerce para impressao 3D. Seja prudente: sem acesso a scraping em tempo real, trate numeros como estimativas e explique premissas. Responda somente JSON valido.',
        prompt: `Analise a oportunidade comercial para: ${busca}
Canal principal: ${canal}
Capacidade produtiva atual: ${capacidade}
Estrategia do canal:
Foco: ${playbook.foco}
Como pensar: ${playbook.pensamento}
Boas praticas: ${playbook.anuncio.join(' | ')}

Avalie demanda provavel, concorrencia, preco, viabilidade de impressao, risco operacional e proximo passo.
Nao afirme que coletou dados reais. Quando citar vendas/precos/concorrencia, escreva como estimativa ou faixa provavel. O objetivo e decidir se vale pesquisar manualmente e testar producao.
Responda exatamente neste formato:
{
  "premissas": ["string"],
  "nivelConfianca": "baixo | medio | alto, com justificativa curta",
  "resumo": "string",
  "score": 0,
  "recomendacaoCanal": "string",
  "precoSugerido": "string",
  "alertaCapacidade": "string",
  "concorrentes": [
    { "produto": "string", "precoMedio": "string", "vendasEstimadas": "string", "concorrencia": "string", "canal": "string" }
  ],
  "viabilidade": {
    "tempoEstimado": "string",
    "filamento": "string",
    "custoUnitario": "string",
    "margemProvavel": "string",
    "dificuldade": "string",
    "riscoAtraso": "string",
    "compatibilidade": "string"
  },
  "proximosPassos": ["string"]
}`,
      });
      setResultado(res);
    } catch (err) {
      setErro(erroMensagem(err));
    } finally {
      setCarregando(false);
    }
  }

  const scoreCor = useMemo(() => {
    const s = resultado?.score ?? 0;
    if (s >= 75) return 'text-ok';
    if (s >= 50) return 'text-alerta';
    return 'text-erro';
  }, [resultado?.score]);

  return (
    <CreatorLabLayout ativo="radar">
      <div className="space-y-4">
        <Cartao className="space-y-4">
          <div>
            <h2 className="text-sm font-extrabold text-ink">Buscar oportunidade</h2>
            <p className="mt-1 text-xs text-texto-2">Analise uma ideia antes de gastar tempo modelando, imprimindo e anunciando.</p>
          </div>
          <StatusOpenAI />
          <PlaybookCanal canal={canal} />
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            <Campo rotulo="Termo ou produto"><Entrada value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
            <Campo rotulo="Canal"><Selecao value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>{canais.map((c) => <option key={c}>{c}</option>)}</Selecao></Campo>
          </div>
          <div className="flex flex-wrap gap-2">
            {sugestoes.map((s) => (
              <button key={s} type="button" onClick={() => setBusca(s)}
                className="rounded-full border border-borda bg-white px-3 py-1.5 text-xs font-bold text-texto-2 hover:bg-surface-2 hover:text-ink">
                {s}
              </button>
            ))}
          </div>
          <Campo rotulo="Capacidade produtiva atual"><Textarea rows={3} value={capacidade} onChange={(e) => setCapacidade(e.target.value)} /></Campo>
          {erro && <p className="text-xs font-bold text-erro">{erro}</p>}
          <Botao type="button" variante="acento" disabled={carregando} onClick={analisar}>
            {carregando ? 'Analisando...' : 'Analisar mercado'}
          </Botao>
        </Cartao>

        {!resultado ? <EstadoVazio mensagem="Rode uma analise para ver concorrencia, viabilidade e decisao comercial." /> : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <Cartao>
                <h2 className="mb-3 text-sm font-extrabold text-ink">Resultados encontrados</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-texto-2">
                      <tr>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2">Preco medio</th>
                        <th className="px-3 py-2">Vendas</th>
                        <th className="px-3 py-2">Concorrencia</th>
                        <th className="px-3 py-2">Canal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.concorrentes.map((c, i) => (
                        <tr key={`${c.produto}-${i}`} className="border-t border-borda">
                          <td className="px-3 py-2 font-semibold text-ink">{c.produto}</td>
                          <td className="px-3 py-2 text-texto-2">{c.precoMedio}</td>
                          <td className="px-3 py-2 text-texto-2">{c.vendasEstimadas}</td>
                          <td className="px-3 py-2 text-texto-2">{c.concorrencia}</td>
                          <td className="px-3 py-2 text-texto-2">{c.canal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Cartao>
              <Cartao>
                <h2 className="mb-3 text-sm font-extrabold text-ink">Viabilidade de impressao</h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(resultado.viabilidade).map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-borda bg-white p-3">
                      <p className="text-[10px] font-extrabold uppercase text-texto-2">{k}</p>
                      <p className="mt-1 text-sm font-bold text-ink">{v}</p>
                    </div>
                  ))}
                </div>
              </Cartao>
            </div>
            <Cartao className="space-y-4">
              <div>
                <p className="text-xs font-extrabold uppercase text-texto-2">Score de oportunidade</p>
                <p className={`mt-1 text-5xl font-black ${scoreCor}`}>{resultado.score}</p>
                <p className="mt-1 text-xs font-semibold text-texto-2">{resultado.nivelConfianca}</p>
              </div>
              <BlocoResultado titulo="Premissas" texto={(resultado.premissas ?? []).map((p) => `- ${p}`).join('\n')} />
              <BlocoResultado titulo="Resumo" texto={resultado.resumo} />
              <BlocoResultado titulo="Canal recomendado" texto={resultado.recomendacaoCanal} />
              <BlocoResultado titulo="Preco sugerido" texto={resultado.precoSugerido} />
              <BlocoResultado titulo="Alerta de capacidade" texto={resultado.alertaCapacidade} />
              <BlocoResultado titulo="Proximos passos" texto={(resultado.proximosPassos ?? []).map((p) => `- ${p}`).join('\n')} />
            </Cartao>
          </div>
        )}
      </div>
    </CreatorLabLayout>
  );
}
