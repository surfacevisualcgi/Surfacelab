/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Supabase local — alvo do proxy do dev server. Permite expor o app por um
// único túnel (ngrok): o front e a API saem pela mesma origem.
const SUPABASE_LOCAL = 'http://127.0.0.1:54321';
const rotasSupabase = ['/auth', '/rest', '/realtime', '/storage', '/functions', '/graphql'];

export default defineConfig({
  server: {
    // libera o Host da URL do ngrok (Vite bloqueia hosts desconhecidos)
    allowedHosts: true,
    proxy: Object.fromEntries(
      rotasSupabase.map((rota) => [
        rota,
        { target: SUPABASE_LOCAL, changeOrigin: true, ws: rota === '/realtime' },
      ]),
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Surface Labs',
        short_name: 'Surface Labs',
        description: 'Gestão e precificação para impressão 3D',
        theme_color: '#0d0d0d',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        lang: 'pt-BR',
        icons: [
          { src: '/brand/spirograph.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    // tests/ exige o Supabase local rodando — fica fora do `npm test` padrão
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
  },
});
