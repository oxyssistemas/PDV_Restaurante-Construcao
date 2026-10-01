import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/functionError';
import { publicOrigin } from '@/lib/native';

export type Network = 'facebook' | 'instagram' | 'tiktok';
export type Provider = 'meta' | 'tiktok';
export type MediaType = 'none' | 'image' | 'video';

export type ChannelResult = {
  status: 'pending' | 'processing' | 'published' | 'error';
  id?: string; url?: string; error?: string;
};

export const NETWORKS: Record<Network, {
  label: string; provider: Provider; accountKind: string; needsMedia: boolean; captionLimit: number;
}> = {
  instagram: { label: 'Instagram', provider: 'meta', accountKind: 'instagram', needsMedia: true, captionLimit: 2200 },
  facebook: { label: 'Facebook', provider: 'meta', accountKind: 'facebook_page', needsMedia: false, captionLimit: 63206 },
  tiktok: { label: 'TikTok', provider: 'tiktok', accountKind: 'tiktok', needsMedia: true, captionLimit: 2200 },
};
export const NETWORK_ORDER: Network[] = ['instagram', 'facebook', 'tiktok'];

export const POST_STATUS: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', tone: 'outline' },
  scheduled: { label: 'Agendada', tone: 'secondary' },
  publishing: { label: 'Publicando', tone: 'secondary' },
  published: { label: 'Publicada', tone: 'default' },
  partial: { label: 'Publicada em parte', tone: 'destructive' },
  error: { label: 'Falhou', tone: 'destructive' },
};

export const TIKTOK_PRIVACY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Todos',
  MUTUAL_FOLLOW_FRIENDS: 'Amigos',
  FOLLOWER_OF_CREATOR: 'Seguidores',
  SELF_ONLY: 'Só eu',
};

export const MEDIA_BUCKET = 'marketing-media';
export const MAX_MEDIA_MB = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada ação devolve um formato diferente
type ApiResponse = Record<string, any>;

async function invoke(fn: string, body: Record<string, unknown>): Promise<ApiResponse> {
  const { data, error } = await supabase.functions.invoke<ApiResponse>(fn, { body });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));
  return data ?? {};
}

export const marketingApi = (restaurantId: string, action: string, extra: Record<string, unknown> = {}) =>
  invoke('marketing-api', { restaurantId, action, ...extra });

export const marketingConfig = async () =>
  (await invoke('marketing-oauth', { action: 'config' })) as { configured: Record<string, boolean>; redirectUri: string };

/** Abre o login oficial da rede; ela devolve o usuário para a tela de Conexões. */
export async function startConnect(restaurantId: string, provider: Provider) {
  // No app de celular o login abre no navegador e volta para o site; a tela de Conexões atualiza ao voltar.
  const returnTo = `${publicOrigin()}/marketing/connections`;
  const { url } = await invoke('marketing-oauth', { action: 'start', restaurantId, provider, returnTo });
  window.location.href = url;
}

/**
 * Fotos viram JPEG (o Instagram só aceita JPEG) com no máximo 1440 px no maior lado.
 * Retorna também a proporção, que o Instagram limita entre 4:5 e 1,91:1.
 */
export async function prepareImage(file: File): Promise<{ blob: Blob; ratio: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem'))), 'image/jpeg', 0.9));
  return { blob, ratio: bitmap.width / bitmap.height };
}

export const instagramRatioOk = (ratio: number) => ratio >= 0.8 - 0.01 && ratio <= 1.91 + 0.01;

export function videoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

export async function uploadMedia(restaurantId: string, blob: Blob, ext: string) {
  const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error(error.message.includes('exceeded') ? `Arquivo maior que ${MAX_MEDIA_MB} MB` : error.message);
  return path;
}
