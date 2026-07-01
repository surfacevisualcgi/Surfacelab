export interface StlAnalise {
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
  volumeMm3: number | null;
  triangulos: number;
}

type Ponto = [number, number, number];

function vazio() {
  return {
    min: [Infinity, Infinity, Infinity] as Ponto,
    max: [-Infinity, -Infinity, -Infinity] as Ponto,
    volume6: 0,
    triangulos: 0,
  };
}

function incluir(acc: ReturnType<typeof vazio>, p: Ponto) {
  for (let i = 0; i < 3; i++) {
    if (p[i] < acc.min[i]) acc.min[i] = p[i];
    if (p[i] > acc.max[i]) acc.max[i] = p[i];
  }
}

function volume6(a: Ponto, b: Ponto, c: Ponto) {
  return a[0] * (b[1] * c[2] - b[2] * c[1])
    - a[1] * (b[0] * c[2] - b[2] * c[0])
    + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function finalizar(acc: ReturnType<typeof vazio>): StlAnalise {
  if (acc.triangulos === 0 || acc.min.some((v) => !Number.isFinite(v))) {
    throw new Error('Arquivo STL sem vertices validos.');
  }
  const largura = acc.max[0] - acc.min[0];
  const profundidade = acc.max[1] - acc.min[1];
  const altura = acc.max[2] - acc.min[2];
  const volume = Math.abs(acc.volume6 / 6);
  return {
    larguraMm: arredondar(largura),
    profundidadeMm: arredondar(profundidade),
    alturaMm: arredondar(altura),
    volumeMm3: volume > 0 ? arredondar(volume) : null,
    triangulos: acc.triangulos,
  };
}

function arredondar(n: number) {
  return Math.round(n * 100) / 100;
}

function pareceBinario(buffer: ArrayBuffer) {
  if (buffer.byteLength < 84) return false;
  const view = new DataView(buffer);
  const tri = view.getUint32(80, true);
  return 84 + tri * 50 === buffer.byteLength;
}

function analisarBinario(buffer: ArrayBuffer): StlAnalise {
  const view = new DataView(buffer);
  const total = view.getUint32(80, true);
  const acc = vazio();
  let off = 84;
  for (let i = 0; i < total; i++) {
    off += 12; // normal
    const a: Ponto = [view.getFloat32(off, true), view.getFloat32(off + 4, true), view.getFloat32(off + 8, true)];
    off += 12;
    const b: Ponto = [view.getFloat32(off, true), view.getFloat32(off + 4, true), view.getFloat32(off + 8, true)];
    off += 12;
    const c: Ponto = [view.getFloat32(off, true), view.getFloat32(off + 4, true), view.getFloat32(off + 8, true)];
    off += 14; // vertex + attribute byte count
    incluir(acc, a);
    incluir(acc, b);
    incluir(acc, c);
    acc.volume6 += volume6(a, b, c);
    acc.triangulos++;
  }
  return finalizar(acc);
}

function analisarAscii(texto: string): StlAnalise {
  const re = /vertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/gi;
  const acc = vazio();
  const vertices: Ponto[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const p: Ponto = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (p.every(Number.isFinite)) vertices.push(p);
  }
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const c = vertices[i + 2];
    incluir(acc, a);
    incluir(acc, b);
    incluir(acc, c);
    acc.volume6 += volume6(a, b, c);
    acc.triangulos++;
  }
  return finalizar(acc);
}

export async function analisarStl(arquivo: File): Promise<StlAnalise> {
  const buffer = await arquivo.arrayBuffer();
  if (pareceBinario(buffer)) return analisarBinario(buffer);
  return analisarAscii(new TextDecoder().decode(buffer));
}

export function dimensoesTexto(a: Pick<StlAnalise, 'larguraMm' | 'profundidadeMm' | 'alturaMm'>) {
  return `${a.larguraMm.toLocaleString('pt-BR')} x ${a.profundidadeMm.toLocaleString('pt-BR')} x ${a.alturaMm.toLocaleString('pt-BR')} mm`;
}
