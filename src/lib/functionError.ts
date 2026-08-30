import { FunctionsHttpError } from '@supabase/supabase-js';

const friendly: Record<string, string> = {
  'A user with this email address has already been registered':
    'Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.',
  'User already registered':
    'Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.',
};

/** Extrai a mensagem real de erro de uma edge function (invoke esconde o corpo em erros não-2xx). */
export async function edgeErrorMessage(error: unknown, fallback = 'Não foi possível concluir a operação.') {
  let raw = '';
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      raw = body?.error ?? body?.message ?? '';
    } catch {
      raw = '';
    }
  } else if (error instanceof Error) {
    raw = error.message;
  }
  if (!raw) return fallback;
  return friendly[raw] ?? raw;
}
