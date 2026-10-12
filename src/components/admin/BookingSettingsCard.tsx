import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarCheck, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { WEEKDAYS } from '@/lib/menuOptions';
import { SLUG_RE, slugify } from '@/lib/deliveryStore';
import { PUBLIC_ORIGIN } from '@/lib/native';

type Hours = Record<string, [string, string]>;

/** Reserva online e fila de espera pelo celular (página pública /reservar/<endereço>). */
export default function BookingSettingsCard({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { branding } = useBranding();
  const { data, isLoading } = useQuery({
    queryKey: ['booking-settings', restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from('booking_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle();
      return data;
    },
  });
  const [f, setF] = useState({
    slug: '', online_enabled: false, waitlist_online: false, duration_minutes: '120', slot_minutes: '30',
    min_party: '1', max_party: '12', advance_days: '30', min_notice_minutes: '60', notice: '', hours: {} as Hours,
  });
  useEffect(() => {
    if (isLoading) return;
    if (!data) { setF(x => ({ ...x, slug: slugify(branding?.brand_name || '') })); return; }
    setF({
      slug: data.slug, online_enabled: data.online_enabled, waitlist_online: data.waitlist_online,
      duration_minutes: String(data.duration_minutes), slot_minutes: String(data.slot_minutes), min_party: String(data.min_party),
      max_party: String(data.max_party), advance_days: String(data.advance_days), min_notice_minutes: String(data.min_notice_minutes),
      notice: data.notice ?? '', hours: (data.hours as Hours) ?? {},
    });
  }, [data, isLoading, branding]);

  const save = useMutation({
    mutationFn: async () => {
      if (!SLUG_RE.test(f.slug)) throw new Error('O endereço deve ter de 3 a 40 letras minúsculas, números ou hífen.');
      const n = (v: string, d: number) => Math.trunc(Number(v)) || d;
      const { error } = await supabase.from('booking_settings').upsert({
        restaurant_id: restaurantId, slug: f.slug, online_enabled: f.online_enabled, waitlist_online: f.waitlist_online,
        duration_minutes: n(f.duration_minutes, 120), slot_minutes: n(f.slot_minutes, 30), min_party: n(f.min_party, 1), max_party: n(f.max_party, 12),
        advance_days: n(f.advance_days, 30), min_notice_minutes: Math.max(0, Math.trunc(Number(f.min_notice_minutes)) || 0), notice: f.notice.trim() || null, hours: f.hours,
      });
      if (error) throw new Error(error.code === '23505' ? 'Esse endereço já está em uso. Escolha outro.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['booking-settings', restaurantId] }); toast.success('Reserva online salva'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const url = `${PUBLIC_ORIGIN}/reservar/${f.slug}`;
  const setDay = (d: number, v: [string, string] | null) => setF(x => {
    const hours = { ...x.hours };
    if (v) hours[String(d)] = v; else delete hours[String(d)];
    return { ...x, hours };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" /> Reserva online e fila de espera</CardTitle>
        <CardDescription>O cliente reserva pelo link (a mesa é escolhida sozinha, sem conflito de horário) ou entra na fila pelo celular, lendo um QR na porta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Reserva online <Switch checked={f.online_enabled} onCheckedChange={v => setF({ ...f, online_enabled: v })} /></label>
              <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Fila pelo celular <Switch checked={f.waitlist_online} onCheckedChange={v => setF({ ...f, waitlist_online: v })} /></label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-slug">Endereço da página</Label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{PUBLIC_ORIGIN}/reservar/</span>
                <Input id="bk-slug" className="w-48" value={f.slug} maxLength={40} onChange={e => setF({ ...f, slug: slugify(e.target.value) })} />
                {data && (f.online_enabled || f.waitlist_online) && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => { navigator.clipboard?.writeText(url); toast.success('Link copiado'); }}><Copy className="h-3.5 w-3.5" /> Copiar</Button>
                    <Button size="sm" variant="ghost" className="gap-1" asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a></Button>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Horários que aceitam reserva (início da reserva)</Label>
              {WEEKDAYS.map((d, i) => {
                const h = f.hours[String(i)];
                return (
                  <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                    <Switch aria-label={`Abrir ${d}`} checked={!!h} onCheckedChange={v => setDay(i, v ? ['18:00', '22:00'] : null)} />
                    <span className="w-10">{d}</span>
                    {h ? (
                      <>
                        <Input type="time" aria-label={`${d} das`} className="h-9 w-[115px]" value={h[0]} onChange={e => setDay(i, [e.target.value, h[1]])} />
                        <span className="text-muted-foreground">às</span>
                        <Input type="time" aria-label={`${d} até`} className="h-9 w-[115px]" value={h[1]} onChange={e => setDay(i, [h[0], e.target.value])} />
                      </>
                    ) : <span className="text-muted-foreground">fechado</span>}
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Duração da reserva (min)</Label><Input type="number" min={30} max={480} value={f.duration_minutes} onChange={e => setF({ ...f, duration_minutes: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Intervalo dos horários (min)</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.slot_minutes} onChange={e => setF({ ...f, slot_minutes: e.target.value })}>
                  <option value="15">15</option><option value="30">30</option><option value="60">60</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Antecedência mínima (min)</Label><Input type="number" min={0} value={f.min_notice_minutes} onChange={e => setF({ ...f, min_notice_minutes: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Pessoas (mínimo)</Label><Input type="number" min={1} value={f.min_party} onChange={e => setF({ ...f, min_party: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Pessoas (máximo)</Label><Input type="number" min={1} max={50} value={f.max_party} onChange={e => setF({ ...f, max_party: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Reservar até (dias à frente)</Label><Input type="number" min={0} max={365} value={f.advance_days} onChange={e => setF({ ...f, advance_days: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="bk-notice">Aviso na página (opcional)</Label><Input id="bk-notice" maxLength={200} placeholder="Ex.: tolerância de 15 minutos" value={f.notice} onChange={e => setF({ ...f, notice: e.target.value })} /></div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
