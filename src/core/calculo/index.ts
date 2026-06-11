/**
 * Motor de cálculo — re-export da cópia canônica em
 * `supabase/functions/_shared/calculo/` (compartilhada com as Edge Functions,
 * que rodam em Deno e validam o cálculo no servidor).
 */
export * from '../../../supabase/functions/_shared/calculo/tipos.ts';
export * from '../../../supabase/functions/_shared/calculo/motor.ts';
