export interface CreatorLabOpenAIConfig {
  apiKey: string;
  textModel: string;
  imageModel: string;
  updatedAt: string;
}

const STORAGE_KEY = 'surface_creator_lab_openai';

export const MODELO_TEXTO_PADRAO = 'gpt-4.1-mini';
export const MODELO_IMAGEM_PADRAO = 'gpt-image-1';

export function carregarConfigOpenAI(): CreatorLabOpenAIConfig | null {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return null;
    const cfg = JSON.parse(bruto) as CreatorLabOpenAIConfig;
    if (!cfg.apiKey?.trim()) return null;
    return {
      apiKey: cfg.apiKey,
      textModel: cfg.textModel || MODELO_TEXTO_PADRAO,
      imageModel: cfg.imageModel || MODELO_IMAGEM_PADRAO,
      updatedAt: cfg.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function salvarConfigOpenAI(cfg: Omit<CreatorLabOpenAIConfig, 'updatedAt'>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...cfg,
    textModel: cfg.textModel || MODELO_TEXTO_PADRAO,
    imageModel: cfg.imageModel || MODELO_IMAGEM_PADRAO,
    updatedAt: new Date().toISOString(),
  }));
}

export function removerConfigOpenAI() {
  localStorage.removeItem(STORAGE_KEY);
}

export function mascararChave(apiKey?: string) {
  if (!apiKey) return 'Nao configurada';
  if (apiKey.length <= 12) return 'Configurada';
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}

function extrairTextoResposta(data: unknown) {
  const d = data as {
    output_text?: string;
    output?: { content?: { text?: string; type?: string }[] }[];
  };
  if (d.output_text) return d.output_text;
  const partes = d.output
    ?.flatMap((o) => o.content ?? [])
    .map((c) => c.text)
    .filter(Boolean);
  return partes?.join('\n') ?? '';
}

function parseJson<T>(texto: string): T {
  let limpo = texto
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!limpo.startsWith('{')) {
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio >= 0 && fim > inicio) limpo = limpo.slice(inicio, fim + 1);
  }
  return JSON.parse(limpo) as T;
}

async function erroOpenAI(res: Response) {
  let detalhe = '';
  try {
    const data = await res.json();
    detalhe = data?.error?.message ? ` ${data.error.message}` : '';
  } catch {
    detalhe = ` ${res.statusText}`;
  }
  return new Error(`OpenAI retornou erro ${res.status}.${detalhe}`);
}

export async function gerarJsonOpenAI<T>({
  apiKey,
  model,
  system,
  prompt,
  imageDataUrl,
}: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  imageDataUrl?: string | null;
}): Promise<T> {
  const conteudoUsuario: Record<string, unknown>[] = [
    { type: 'input_text', text: prompt },
  ];
  if (imageDataUrl) {
    conteudoUsuario.push({ type: 'input_image', image_url: imageDataUrl });
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.45,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: conteudoUsuario },
      ],
    }),
  });

  if (!res.ok) throw await erroOpenAI(res);
  const data = await res.json();
  const texto = extrairTextoResposta(data);
  if (!texto) throw new Error('A OpenAI nao retornou texto.');
  return parseJson<T>(texto);
}

export async function gerarImagemOpenAI({
  apiKey,
  model,
  prompt,
  referenceImageDataUrl,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceImageDataUrl?: string | null;
}): Promise<string> {
  if (referenceImageDataUrl) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('n', '1');
    form.append('image', dataUrlParaArquivo(referenceImageDataUrl, 'referencia.png'));

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!res.ok) throw await erroOpenAI(res);
    const data = await res.json();
    const item = data?.data?.[0];
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    if (item?.url) return item.url as string;
    throw new Error('A OpenAI nao retornou imagem.');
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x1024',
      n: 1,
    }),
  });

  if (!res.ok) throw await erroOpenAI(res);
  const data = await res.json();
  const item = data?.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url as string;
  throw new Error('A OpenAI nao retornou imagem.');
}

function dataUrlParaArquivo(dataUrl: string, nome: string) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return new File([bytes], nome, { type: mime });
}
