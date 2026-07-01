import { Link } from 'react-router-dom';

const nav = ['Funcionalidades', 'Recursos', 'Para quem', 'Preços', 'Roadmap'];

const recursos = [
  {
    titulo: 'Preço real',
    texto: 'Calcule material, tempo, mão de obra, energia e despesas. Margem clara em cada orçamento.',
  },
  {
    titulo: 'Pedido no fluxo',
    texto: 'Do orçamento à entrega. Acompanhe cada etapa e mantenha o cliente sempre informado.',
  },
  {
    titulo: 'Operação visível',
    texto: 'Estoque, produção e financeiro em um único painel. Decisões melhores, mais rápido.',
  },
];

export function PaginaLanding() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-white text-ink">
      <header className="mx-auto flex h-[68px] w-full max-w-[1320px] shrink-0 items-center justify-between px-5 sm:h-[76px] sm:px-8 lg:px-10">
        <Link to="/" aria-label="Surface Labs" className="shrink-0">
          <img
            src="/landing/surface-labs-logo.svg"
            width={188}
            height={47}
            alt="Surface Labs"
            className="h-8 w-auto sm:h-9 lg:h-10"
            draggable={false}
          />
        </Link>

        <nav className="hidden items-center gap-9 text-sm font-medium text-ink md:flex">
          {nav.map((item) => (
            <a key={item} href="#hero" className="transition-colors hover:text-brand-roxo">
              {item}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden min-w-24 rounded-lg border border-borda bg-white px-6 py-2.5 text-center text-sm font-semibold text-ink shadow-[0_10px_30px_rgba(13,13,13,0.04)] transition hover:border-ink/20 sm:inline-flex sm:justify-center"
          >
            Entrar
          </Link>
          <Link
            to="/cadastro"
            className="inline-flex min-w-32 justify-center rounded-lg bg-[linear-gradient(100deg,#2f66ea,#7b4df0_58%,#dc28b8)] px-6 py-2.5 text-sm font-bold text-white shadow-[0_14px_35px_rgba(77,85,226,0.22)] transition hover:opacity-90"
          >
            Começar beta
          </Link>
        </div>
      </header>

      <section
        id="hero"
        className="mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 flex-col items-center px-5 pb-0 pt-[clamp(8px,1.4dvh,18px)] text-center sm:px-8 lg:px-10"
      >
        <div className="flex shrink-0 items-center justify-center gap-4 text-xs font-medium text-texto-2">
          <span className="rounded-full bg-[#f0ecff] px-3 py-1 font-semibold text-[#5b3ff1]">
            BETA PRIVADO
          </span>
          <span>Vagas limitadas</span>
        </div>

        <h1 className="mt-[clamp(14px,2.1dvh,28px)] w-full max-w-[980px] text-[clamp(34px,5.7dvh,60px)] font-extrabold leading-[1.06] text-black">
          <span className="block">Gestão simples para</span>
          <span className="block">negócios de impressão 3D<span className="grad-texto">.</span></span>
        </h1>

        <p className="mt-[clamp(10px,1.5dvh,20px)] max-w-[560px] text-[clamp(14px,1.7dvh,18px)] font-medium leading-[1.65] text-[#707586]">
          Precifique com segurança, organize pedidos e acompanhe sua operação sem planilhas espalhadas.
        </p>

        <div className="mt-[clamp(14px,2.1dvh,26px)] flex shrink-0 flex-col items-stretch justify-center gap-3 sm:flex-row">
          <Link
            to="/cadastro"
            className="inline-flex min-w-44 items-center justify-center rounded-lg bg-[linear-gradient(100deg,#2f66ea,#7b4df0_58%,#dc28b8)] px-7 py-3 text-sm font-bold text-white shadow-[0_16px_36px_rgba(77,85,226,0.24)] transition hover:opacity-90"
          >
            Começar beta
          </Link>
          <Link
            to="/login"
            className="inline-flex min-w-36 justify-center rounded-lg border border-borda bg-white px-7 py-3 text-sm font-bold text-ink shadow-[0_12px_30px_rgba(13,13,13,0.04)] transition hover:border-ink/20"
          >
            Entrar
          </Link>
        </div>

        <div className="mt-[clamp(6px,1dvh,14px)] flex min-h-0 w-full flex-1 items-end justify-center overflow-hidden">
          <img
            src="/landing/surface-labs-product-hero.png"
            alt="Dashboard do Surface Labs mostrando visão geral da operação, métricas, pedidos, estoque, financeiro e peças de impressão 3D."
            className="block h-auto max-h-full w-auto max-w-[min(94%,1700px)] select-none object-contain"
            draggable={false}
          />
        </div>

        <div className="mt-[clamp(10px,1.6dvh,20px)] grid h-[clamp(82px,11.5dvh,130px)] w-full max-w-[1180px] shrink-0 grid-cols-3 border-t border-borda/70 pt-[clamp(8px,1.25dvh,16px)] text-left">
          {recursos.map((recurso, index) => (
            <article
              key={recurso.titulo}
              className={`min-w-0 px-[clamp(12px,2.4vw,44px)] ${
                index > 0 ? 'border-l border-borda/70' : ''
              }`}
            >
              <div className="mb-[clamp(5px,0.8dvh,10px)] h-1 w-10 rounded-full bg-[linear-gradient(100deg,#2f66ea,#7b4df0_58%,#dc28b8)]" />
              <h2 className="text-[clamp(14px,1.45dvh,21px)] font-extrabold leading-tight text-black">
                {recurso.titulo}
              </h2>
              <p className="mt-[clamp(3px,0.5dvh,7px)] overflow-hidden text-[clamp(10px,1.05dvh,13px)] font-medium leading-[1.38] text-[#707586] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] sm:[-webkit-line-clamp:4]">
                {recurso.texto}
              </p>
            </article>
          ))}
        </div>

        <div
          aria-hidden="true"
          className="mt-[clamp(8px,1.1dvh,14px)] h-[clamp(10px,1.5dvh,18px)] w-screen shrink-0 bg-ink"
        />
      </section>
    </main>
  );
}
