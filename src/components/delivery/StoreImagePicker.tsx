import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImageIcon, Images, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { prepareImage } from '@/lib/marketing';
import { STORE_MEDIA, storeMediaUrl, SUGGESTIONS_FOLDER } from '@/lib/deliveryStore';

type Suggestion = { path: string; group: string };

/** Lista a galeria de sugestões (pasta "sugestoes", com ou sem subpastas por tema). */
async function listSuggestions(): Promise<Suggestion[]> {
  const bucket = supabase.storage.from(STORE_MEDIA);
  const isImage = (n: string) => /\.(jpe?g|png|webp)$/i.test(n);
  const { data: root, error } = await bucket.list(SUGGESTIONS_FOLDER, { limit: 500, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  const out: Suggestion[] = (root ?? []).filter(f => f.id && isImage(f.name)).map(f => ({ path: `${SUGGESTIONS_FOLDER}/${f.name}`, group: 'Geral' }));
  for (const folder of (root ?? []).filter(f => !f.id)) {
    const { data } = await bucket.list(`${SUGGESTIONS_FOLDER}/${folder.name}`, { limit: 500, sortBy: { column: 'name', order: 'asc' } });
    out.push(...(data ?? []).filter(f => f.id && isImage(f.name)).map(f => ({ path: `${SUGGESTIONS_FOLDER}/${folder.name}/${f.name}`, group: folder.name })));
  }
  return out;
}

/** Foto da vitrine: a loja envia a dela ou escolhe uma das sugestões da Oxys. Guarda o caminho no bucket. */
export default function StoreImagePicker({ restaurantId, value, onChange, fallbackUrl, fallbackLabel, className }: {
  restaurantId: string; value: string | null; onChange: (path: string | null) => void;
  fallbackUrl?: string | null; fallbackLabel?: string; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [gallery, setGallery] = useState(false);
  const { data: suggestions, isLoading } = useQuery({ queryKey: ['store-suggestions'], enabled: gallery, queryFn: listSuggestions });

  const upload = async (file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error('Use uma foto JPG, PNG ou WEBP.'); return; }
    setUploading(true);
    try {
      const { blob } = await prepareImage(file); // JPEG leve, até 1440 px
      const path = `${restaurantId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error } = await supabase.storage.from(STORE_MEDIA).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) throw error;
      onChange(path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar a foto.');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  const url = storeMediaUrl(value) ?? fallbackUrl ?? null;
  const groups = [...new Set((suggestions ?? []).map(s => s.group))];

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl border bg-muted">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground"><ImageIcon className="h-6 w-6" /> Sem foto</div>
        )}
        {!value && url && fallbackLabel && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">{fallbackLabel}</span>
        )}
        {uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-2" disabled={uploading} onClick={() => input.current?.click()}>
          <Upload className="h-4 w-4" /> Enviar foto
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => setGallery(true)}>
          <Images className="h-4 w-4" /> Sugestões
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" className="gap-2 text-destructive" onClick={() => onChange(null)}>
            <Trash2 className="h-4 w-4" /> Remover
          </Button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>

      <Dialog open={gallery} onOpenChange={setGallery}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sugestões de fotos</DialogTitle>
            <DialogDescription>Fotos prontas para usar no banner e nas promoções.</DialogDescription>
          </DialogHeader>
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : !suggestions?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma sugestão disponível ainda.</p>
          ) : groups.map(g => (
            <section key={g} className="space-y-2">
              {groups.length > 1 && <h3 className="text-sm font-semibold capitalize">{g.replace(/[-_]/g, ' ')}</h3>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {suggestions.filter(s => s.group === g).map(s => (
                  <button key={s.path} type="button" onClick={() => { onChange(s.path); setGallery(false); }}
                    className={cn('aspect-[16/9] overflow-hidden rounded-lg border-2 transition-colors', value === s.path ? 'border-primary' : 'border-transparent hover:border-primary/50')}>
                    <img src={storeMediaUrl(s.path)!} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
