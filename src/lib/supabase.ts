import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Modo "same-origin": o app usa a própria origem (ex.: a URL do ngrok ao
// compartilhar) e o Vite faz proxy de /auth /rest /realtime /storage /functions
// para o Supabase local. Permite expor o app por um único túnel.
const url =
  envUrl === 'same-origin' && typeof window !== 'undefined'
    ? window.location.origin
    : envUrl;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias — confira o .env.local',
  );
}

// Apenas a anon key no frontend — a service_role vive só no servidor.
export const supabase = createClient(url, anonKey, {
  // pula a tela de aviso do ngrok nas chamadas XHR/fetch da API.
  global: { headers: { 'ngrok-skip-browser-warning': 'true' } },
});
