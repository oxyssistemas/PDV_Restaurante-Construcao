import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ExternalLink, Film, Loader2, Plus, RotateCw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ModuleGate from '@/components/ModuleGate';
import NetworkIcon from '@/components/marketing/NetworkIcon';
import { MEDIA_BUCKET, marketingApi, NETWORKS, POST_STATUS, type ChannelResult, type Network } from '@/lib/marketing';

type Post = {
  id: string; caption: string; channels: string[]; status: string; media_type: string; image_path: string | null;
  scheduled_for: string | null; published_at: string | null; created_at: string; results: Record<string, ChannelResult>;
  thumb?: string | null;
};

const CHANNEL_STATUS: Record<ChannelResult['status'], { label: string; className: string }> = {
  pending: { label: 'Na fila', className: 'text-muted-foreground' },
  processing: { label: 'Processando', className: 'text-amber-600 dark:text-amber-400' },
  published: { label: 'Publicado', className: 'text-emerald-600 dark:text-emerald-400' },
  error: { label: 'Falhou', className: 'text-destructive' },
};

const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function MarketingPosts() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const qc = useQueryClient();

  const { data: posts, isLoading } = useQuery({
    queryKey: ['marketing-posts', restaurantId],
    enabled: !!restaurantId,
    // Enquanto alguma rede processa, atualiza sozinho.
    refetchInterval: q => ((q.state.data as Post[] | undefined)?.some(p => p.status === 'publishing') ? 10_000 : false),
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_posts')
        .select('id, caption, channels, status, media_type, image_path, scheduled_for, published_at, created_at, results')
        .eq('restaurant_id', restaurantId!).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      const rows = (data || []) as unknown as Post[];
      const images = rows.filter(p => p.image_path && p.media_type === 'image').map(p => p.image_path!);
      if (images.length) {
        const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(images, 60 * 60);
        const byPath = Object.fromEntries((signed || []).map(s => [s.path, s.signedUrl]));
        rows.forEach(p => { p.thumb = p.image_path ? byPath[p.image_path] ?? null : null; });
      }
      return rows;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['marketing-posts'] });
    qc.invalidateQueries({ queryKey: ['marketing-overview'] });
  };

  const publish = useMutation({
    mutationFn: (postId: string) => marketingApi(restaurantId!, 'publish_post', { postId }),
    onSuccess: () => { refresh(); toast.success('Enviado para as redes'); },
    onError: (e: Error) => { refresh(); toast.error(e.message); },
  });

  const remove = useMutation({
    mutationFn: async (post: Post) => {
      const { error } = await supabase.from('marketing_posts').delete().eq('id', post.id);
      if (error) throw error;
      if (post.image_path) await supabase.storage.from(MEDIA_BUCKET).remove([post.image_path]);
    },
    onSuccess: () => { refresh(); toast.success('Publicação removida'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  return (
    <ModuleGate module="marketing">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Publicações</h1>
            <p className="text-muted-foreground">Acompanhe o que foi publicado, o que está agendado e o que falhou.</p>
          </div>
          <Button asChild className="gap-2"><Link to="/marketing/publish"><Plus className="h-4 w-4" /> Nova publicação</Link></Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !posts?.length ? (
          <p className="py-10 text-center text-muted-foreground">Nenhuma publicação ainda.</p>
        ) : (
          <div className="space-y-3">
            {posts.map(p => {
              const st = POST_STATUS[p.status] ?? { label: p.status, tone: 'outline' as const };
              const busy = (publish.isPending && publish.variables === p.id) || (remove.isPending && remove.variables?.id === p.id);
              const canPublish = p.status === 'draft' || p.status === 'scheduled';
              const canRetry = p.status === 'error' || p.status === 'partial';
              const canRemove = p.status !== 'publishing' && p.status !== 'published' && p.status !== 'partial';
              return (
                <Card key={p.id}>
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {p.thumb ? <img src={p.thumb} alt="" className="h-full w-full object-cover" />
                        : p.media_type === 'video' ? <Film className="h-6 w-6 text-muted-foreground" />
                        : <span className="px-1 text-center text-[10px] text-muted-foreground">Só texto</span>}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={st.tone}>{st.label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {p.status === 'scheduled' && p.scheduled_for ? `Agendada para ${fmt(p.scheduled_for)}`
                            : p.published_at ? `Publicada em ${fmt(p.published_at)}` : `Criada em ${fmt(p.created_at)}`}
                        </span>
                      </div>
                      <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm">{p.caption || <span className="text-muted-foreground">Sem legenda</span>}</p>
                      <div className="space-y-1">
                        {p.channels.map(ch => {
                          const r = p.results?.[ch] ?? { status: 'pending' as const };
                          const cs = CHANNEL_STATUS[r.status];
                          return (
                            <div key={ch} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                              <NetworkIcon network={ch as Network} />
                              <span className="font-medium">{NETWORKS[ch as Network]?.label ?? ch}</span>
                              <span className={cs.className}>
                                {p.status === 'scheduled' || p.status === 'draft' ? 'Aguardando' : cs.label}
                              </span>
                              {r.url && (
                                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                  Ver post <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              {r.error && <span className="w-full text-xs text-destructive sm:w-auto">{r.error}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-start gap-2 sm:flex-col sm:items-end">
                      {canPublish && (
                        <Button size="sm" className="gap-2" disabled={busy} onClick={() => publish.mutate(p.id)}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publicar agora
                        </Button>
                      )}
                      {canRetry && (
                        <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={() => publish.mutate(p.id)}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />} Tentar de novo
                        </Button>
                      )}
                      {canRemove && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="gap-2" disabled={busy}>
                              <Trash2 className="h-4 w-4" /> {p.status === 'scheduled' ? 'Cancelar' : 'Excluir'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{p.status === 'scheduled' ? 'Cancelar agendamento?' : 'Excluir publicação?'}</AlertDialogTitle>
                              <AlertDialogDescription>A publicação e a mídia enviada serão apagadas daqui. Nada é removido das redes sociais.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Voltar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(p)}>Confirmar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ModuleGate>
  );
}
