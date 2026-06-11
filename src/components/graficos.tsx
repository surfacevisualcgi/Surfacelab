/**
 * Gráficos SVG leves (sem dependência) com a pele Surface Labs:
 * gradiente azul→roxo→rosa como acento, neutros para o resto.
 */
import { useId } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { moeda } from '@/lib/formato';

export interface PontoMensal {
  rotulo: string; // "Jan", "Fev"…
  valor: number; // centavos
}

/** Linha/área — o herói "Faturamento (últimos 12 meses)" */
export function GraficoLinha({ pontos, altura = 180 }: { pontos: PontoMensal[]; altura?: number }) {
  const { formato } = useAuth();
  const gid = useId();
  const L = 720;
  const A = altura;
  const padX = 8;
  const padY = 18;
  const max = Math.max(...pontos.map((p) => p.valor), 1);
  const passo = pontos.length > 1 ? (L - padX * 2) / (pontos.length - 1) : 0;
  const x = (i: number) => padX + i * passo;
  const y = (v: number) => A - padY - (v / max) * (A - padY * 2);
  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const area = `${linha} L${x(pontos.length - 1).toFixed(1)},${A - padY} L${x(0).toFixed(1)},${A - padY} Z`;

  return (
    <svg viewBox={`0 0 ${L} ${A + 16}`} className="w-full" role="img"
      aria-label={pontos.map((p) => `${p.rotulo}: ${moeda(p.valor, formato)}`).join('; ')}>
      <defs>
        <linearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--color-brand-azul)" />
          <stop offset="0.6" stopColor="var(--color-brand-roxo)" />
          <stop offset="1" stopColor="var(--color-brand-magenta)" />
        </linearGradient>
        <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-brand-roxo)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--color-brand-roxo)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={padX} x2={L - padX} y1={y(max * f)} y2={y(max * f)}
          stroke="var(--color-borda)" strokeDasharray="3 5" strokeWidth="1" />
      ))}
      <path d={area} fill={`url(#${gid}-a)`} />
      <path d={linha} fill="none" stroke={`url(#${gid}-l)`} strokeWidth="2.5" strokeLinecap="round" />
      {pontos.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.valor)} r="3" fill="white" stroke={`url(#${gid}-l)`} strokeWidth="2" />
          <text x={x(i)} y={A + 10} textAnchor="middle" fontSize="11" fill="var(--color-texto-2)">
            {p.rotulo}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Barras pareadas — "Fluxo de caixa" (entradas × saídas por mês) */
export function GraficoBarrasDuplas({ meses }: {
  meses: { rotulo: string; entrada: number; saida: number }[];
}) {
  const { formato } = useAuth();
  const L = 360;
  const A = 150;
  const padY = 16;
  const max = Math.max(...meses.flatMap((m) => [m.entrada, m.saida]), 1);
  const grupo = (L - 16) / Math.max(meses.length, 1);
  const larguraBarra = Math.min(14, grupo / 3);
  const h = (v: number) => ((v / max) * (A - padY * 2));

  return (
    <svg viewBox={`0 0 ${L} ${A + 14}`} className="w-full" role="img"
      aria-label={meses.map((m) => `${m.rotulo}: entradas ${moeda(m.entrada, formato)}, saídas ${moeda(m.saida, formato)}`).join('; ')}>
      {meses.map((m, i) => {
        const cx = 8 + i * grupo + grupo / 2;
        return (
          <g key={i}>
            <rect x={cx - larguraBarra - 1.5} y={A - padY - h(m.entrada)} width={larguraBarra}
              height={h(m.entrada)} rx="3" fill="var(--color-ok)" opacity="0.85" />
            <rect x={cx + 1.5} y={A - padY - h(m.saida)} width={larguraBarra}
              height={h(m.saida)} rx="3" fill="var(--color-erro)" opacity="0.7" />
            <text x={cx} y={A + 8} textAnchor="middle" fontSize="10.5" fill="var(--color-texto-2)">
              {m.rotulo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const CORES_ROSCA = [
  'var(--color-brand-azul)',
  'var(--color-brand-roxo)',
  'var(--color-brand-magenta)',
  'var(--color-brand-ciano)',
  'var(--color-texto-2)',
];

/** Rosca — "Faturamento por categoria" com legenda */
export function GraficoRosca({ fatias }: { fatias: { rotulo: string; valor: number }[] }) {
  const { formato } = useAuth();
  const total = fatias.reduce((s, f) => s + f.valor, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="size-32 shrink-0" role="img"
        aria-label={fatias.map((f) => `${f.rotulo}: ${Math.round((f.valor / total) * 100)}%`).join('; ')}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="20" />
        {fatias.map((f, i) => {
          const frac = f.valor / total;
          const offset = C * (1 - acumulado);
          acumulado += frac;
          return (
            <circle key={i} cx="70" cy="70" r={R} fill="none"
              stroke={CORES_ROSCA[i % CORES_ROSCA.length]} strokeWidth="20"
              strokeDasharray={`${C * frac} ${C * (1 - frac)}`}
              strokeDashoffset={offset} transform="rotate(-90 70 70)" />
          );
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {fatias.map((f, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-texto-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: CORES_ROSCA[i % CORES_ROSCA.length] }} />
              <span className="truncate">{f.rotulo}</span>
            </span>
            <span className="font-semibold tabular-nums text-ink">
              {Math.round((f.valor / total) * 100)}%
              <span className="ml-1.5 font-normal text-texto-2">{moeda(f.valor, formato)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontais — "De onde vem o custo" (detalhamento) */
export function GraficoBarrasH({ itens }: { itens: { rotulo: string; valor: number }[] }) {
  const { formato } = useAuth();
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="space-y-2.5">
      {itens.map((item, i) => (
        <div key={i}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="text-texto-2">{item.rotulo}</span>
            <span className="font-semibold tabular-nums text-ink">{moeda(item.valor, formato)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full grad-acento" style={{ width: `${(item.valor / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
