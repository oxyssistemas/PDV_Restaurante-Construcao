/** Teste grátis de 14 dias: contato da Oxys para contratar um plano. */
export const TRIAL_DAYS = 14;
export const OXYS_WHATSAPP = '5543988709679';
export const OXYS_WHATSAPP_LABEL = '(43) 98870-9679';

export const trialWhatsappLink = (restaurant?: string | null, expired = false, plan?: string | null) => {
  const base = expired
    ? `Olá! Meu teste grátis do Oxys${restaurant ? ` (${restaurant})` : ''} terminou e quero contratar um plano.`
    : `Olá! Estou testando o Oxys${restaurant ? ` (${restaurant})` : ''} e quero contratar um plano.`;
  const text = plan ? `${base} O sistema me indicou o plano ${plan}.` : base;
  return `https://wa.me/${OXYS_WHATSAPP}?text=${encodeURIComponent(text)}`;
};

/** Tempo restante em dias, horas, minutos e segundos. */
export function remaining(endsAt: string | Date, now = Date.now()) {
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const s = Math.floor(ms / 1000);
  return { ms, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}
