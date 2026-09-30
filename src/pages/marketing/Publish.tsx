import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CalendarClock, ImagePlus, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ModuleGate from '@/components/ModuleGate';
import NetworkIcon from '@/components/marketing/NetworkIcon';
import {
  instagramRatioOk, marketingApi, MAX_MEDIA_MB, NETWORK_ORDER, NETWORKS, prepareImage, TIKTOK_PRIVACY,
  uploadMedia, videoDuration, type MediaType, type Network,
} from '@/lib/marketing';

type Media = { type: MediaType; file: File; blob: Blob; preview: string; ratio?: number; duration?: number; ext: string };

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function MarketingPublish() {
  const { currentRole, user } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [channels, setChannels] = useState<Network[]>([]);
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState<Media | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [when, setWhen] = useState<'now' | 'schedule'>('now');
  const [scheduledFor, setScheduledFor] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60_000)));
  const [privacy, setPrivacy] = useState('');

  useEffect(() => () => { if (media) URL.revokeObjectURL(media.preview); }, [media]);

  // Redes com conta conectada e selecionada
  const { data: connected, isLoading } = useQuery({
    queryKey: ['marketing-accounts-selected', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_accounts')
        .select('kind, name').eq('restaurant_id', restaurantId!).eq('selected', true)
        .in('kind', ['facebook_page', 'instagram', 'tiktok']);
      if (error) throw error;
      const byKind = Object.fromEntries((data || []).map(a => [a.kind, a.name]));
      return Object.fromEntries(NETWORK_ORDER.map(n => [n, byKind[NETWORKS[n].accountKind] ?? null])) as Record<Network, string | null>;
    },
  });

  const tiktokOn = channels.includes('tiktok');
  const { data: tiktokInfo, error: tiktokError } = useQuery({
    queryKey: ['tiktok-creator', restaurantId],
    enabled: !!restaurantId && tiktokOn,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => marketingApi(restaurantId!, 'tiktok_creator_info') as Promise<{ nickname: string; privacy_options: string[]; max_video_seconds: number }>,
  });
  useEffect(() => {
    const opts = tiktokInfo?.privacy_options ?? [];
    if (opts.length && !opts.includes(privacy)) setPrivacy(opts.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : opts[0]);
  }, [tiktokInfo, privacy]);

  const toggle = (n: Network) => setChannels(c => (c.includes(n) ? c.filter(x => x !== n) : [...c, n]));

  const pickFile = async (file: File) => {
    const isVideo = file.type.startsWith('video/');
    if (!isVideo && !file.type.startsWith('image/')) return toast.error('Envie uma foto ou um vídeo');
    if (file.size > MAX_MEDIA_MB * 1024 * 1024) return toast.error(`O arquivo passa de ${MAX_MEDIA_MB} MB`);
    setPreparing(true);
    try {
      if (isVideo) {
        const duration = await videoDuration(file);
        setMedia({ type: 'video', file, blob: file, preview: URL.createObjectURL(file), duration, ext: file.type === 'video/quicktime' ? 'mov' : 'mp4' });
      } else {
        const { blob, ratio } = await prepareImage(file);
        setMedia({ type: 'image', file, blob, preview: URL.createObjectURL(blob), ratio, ext: 'jpg' });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler o arquivo');
    } finally {
      setPreparing(false);
    }
  };

  // Regras de cada rede, checadas antes de enviar
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!channels.length) out.push('Escolha pelo menos uma rede.');
    if (!caption.trim() && !media) out.push('Escreva um texto ou adicione uma foto/vídeo.');
    for (const n of channels) {
      const cfg = NETWORKS[n];
      if (cfg.needsMedia && !media) out.push(`O ${cfg.label} exige uma foto ou vídeo.`);
      if (caption.length > cfg.captionLimit) out.push(`O texto passa do limite do ${cfg.label} (${cfg.captionLimit} caracteres).`);
    }
    if (channels.includes('instagram') && media?.type === 'image' && media.ratio && !instagramRatioOk(media.ratio)) {
      out.push('O Instagram aceita fotos entre 4:5 (em pé) e 1,91:1 (deitada). Recorte a imagem ou desmarque o Instagram.');
    }
    if (channels.includes('instagram') && media?.type === 'video' && media.duration && (media.duration < 3 || media.duration > 900)) {
      out.push('O Instagram aceita vídeos de 3 segundos a 15 minutos.');
    }
    if (tiktokOn && tiktokError) out.push(`TikTok: ${(tiktokError as Error).message}`);
    if (tiktokOn && media?.type === 'video' && tiktokInfo?.max_video_seconds && media.duration && media.duration > tiktokInfo.max_video_seconds) {
      out.push(`Esta conta do TikTok aceita vídeos de até ${Math.floor(tiktokInfo.max_video_seconds / 60)} min.`);
    }
    if (when === 'schedule' && (!scheduledFor || new Date(scheduledFor).getTime() < Date.now() + 60_000)) {
      out.push('Escolha um horário no futuro para agendar.');
    }
    return out;
  }, [channels, caption, media, when, scheduledFor, tiktokOn, tiktokInfo, tiktokError]);

  const submit = useMutation({
    mutationFn: async () => {
      const path = media ? await uploadMedia(restaurantId!, media.blob, media.ext) : null;
      const scheduled = when === 'schedule';
      const { data: post, error } = await supabase.from('marketing_posts').insert({
        restaurant_id: restaurantId!,
        channels,
        caption: caption.trim(),
        image_path: path,
        media_type: media?.type ?? 'none',
        options: tiktokOn && privacy ? { tiktok_privacy: privacy } : {},
        status: scheduled ? 'scheduled' : 'draft',
        scheduled_for: scheduled ? new Date(scheduledFor).toISOString() : null,
        created_by: user?.id ?? null,
      }).select('id').single();
      if (error) throw error;
      if (scheduled) return { scheduled: true };
      const res = await marketingApi(restaurantId!, 'publish_post', { postId: post.id });
      return { scheduled: false, results: res.results as Record<string, { status: string }> | null };
    },
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['marketing-posts'] });
      qc.invalidateQueries({ queryKey: ['marketing-overview'] });
      if (r.scheduled) toast.success('Publicação agendada');
      else {
        const st = Object.values(r.results ?? {}).map(x => x.status);
        if (st.length && st.every(s => s === 'published')) toast.success('Publicado em todas as redes');
        else if (st.some(s => s === 'error')) toast.error('Algumas redes falharam. Veja os detalhes em Publicações.');
        else toast.success('Enviado! As redes ainda estão processando a mídia.');
      }
      navigate('/marketing/posts');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  const noneConnected = connected && NETWORK_ORDER.every(n => !connected[n]);

  return (
    <ModuleGate module="marketing">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Publicar</h1>
          <p className="text-muted-foreground">Crie uma vez e publique em todas as redes escolhidas.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : noneConnected ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-muted-foreground">Nenhuma rede conectada ainda.</p>
              <Button asChild><Link to="/marketing/connections">Conectar redes</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Onde publicar</CardTitle></CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-3">
                  {NETWORK_ORDER.map(n => {
                    const account = connected?.[n];
                    const on = channels.includes(n);
                    return (
                      <button key={n} type="button" disabled={!account} onClick={() => toggle(n)}
                        className={cn('flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                          on ? 'border-primary bg-primary/10' : 'hover:bg-muted/50',
                          !account && 'cursor-not-allowed opacity-50')}>
                        <NetworkIcon network={n} className="h-5 w-5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{NETWORKS[n].label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{account ?? 'Não conectado'}</span>
                        </span>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Conteúdo</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="caption">Legenda</Label>
                      <span className="text-xs text-muted-foreground">{caption.length} caracteres</span>
                    </div>
                    <Textarea id="caption" rows={6} value={caption} onChange={e => setCaption(e.target.value)}
                      placeholder="Escreva a legenda, com hashtags se quiser..." />
                    {tiktokOn && media?.type === 'image' && caption.length > 90 && (
                      <p className="text-xs text-muted-foreground">No TikTok, fotos usam os primeiros 90 caracteres como título e o resto como descrição.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Foto ou vídeo</Label>
                    <input ref={fileInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickFile(f); }} />
                    {media ? (
                      <div className="relative w-fit">
                        {media.type === 'video'
                          ? <video src={media.preview} controls className="max-h-64 rounded-lg border" />
                          : <img src={media.preview} alt="Prévia" className="max-h-64 rounded-lg border object-contain" />}
                        <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-2 h-7 w-7"
                          onClick={() => setMedia(null)} aria-label="Remover mídia"><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => fileInput.current?.click()} disabled={preparing}
                        className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground hover:bg-muted/50">
                        {preparing ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                        Escolher foto ou vídeo (até {MAX_MEDIA_MB} MB)
                      </button>
                    )}
                  </div>

                  {tiktokOn && tiktokInfo && (
                    <div className="space-y-2">
                      <Label>Quem pode ver no TikTok ({tiktokInfo.nickname})</Label>
                      <Select value={privacy} onValueChange={setPrivacy}>
                        <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {tiktokInfo.privacy_options.map(o => <SelectItem key={o} value={o}>{TIKTOK_PRIVACY[o] ?? o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Quando</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <RadioGroup value={when} onValueChange={v => setWhen(v as 'now' | 'schedule')} className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="now" /> Publicar agora</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="schedule" /> Agendar</label>
                  </RadioGroup>
                  {when === 'schedule' && (
                    <Input type="datetime-local" className="sm:w-64" value={scheduledFor}
                      min={toLocalInput(new Date())} onChange={e => setScheduledFor(e.target.value)} />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <Card>
                <CardHeader><CardTitle className="text-base">Prévia</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {media && (media.type === 'video'
                    ? <video src={media.preview} muted className="w-full rounded-md border" />
                    : <img src={media.preview} alt="" className="w-full rounded-md border object-cover" />)}
                  <p className="whitespace-pre-wrap break-words text-sm">{caption || <span className="text-muted-foreground">Sua legenda aparece aqui.</span>}</p>
                  {channels.length > 0 && (
                    <div className="flex gap-2 text-muted-foreground">{channels.map(n => <NetworkIcon key={n} network={n} />)}</div>
                  )}
                </CardContent>
              </Card>

              {problems.length > 0 && (channels.length > 0 || caption || media) && (
                <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  {problems.map(p => <p key={p} className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{p}</p>)}
                </div>
              )}

              <Button className="w-full gap-2" size="lg" disabled={problems.length > 0 || submit.isPending || preparing}
                onClick={() => submit.mutate()}>
                {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : when === 'schedule' ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {submit.isPending ? (when === 'schedule' ? 'Agendando...' : 'Publicando...') : when === 'schedule' ? 'Agendar publicação' : 'Publicar agora'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModuleGate>
  );
}
