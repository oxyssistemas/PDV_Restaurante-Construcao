import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Palette, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import FeatureGate from '@/components/FeatureGate';

const defaults = {
  brand_name: '', logo_light_url: '', logo_dark_url: '', favicon_url: '', login_background_url: '',
  primary_color: '#3b82f6', secondary_color: '#1e293b', accent_color: '#22c55e',
  background_color: '#0b1120', foreground_color: '#f8fafc', sidebar_color: '#0f172a',
  font_heading: 'Space Grotesk', font_body: 'Inter', radius: 'soft', density: 'comfortable',
  theme_mode: 'dark', login_message: '', footer_text: '', receipt_header: '', receipt_footer: '',
};

const fontOptions = ['Space Grotesk', 'Inter', 'Poppins', 'Montserrat', 'Roboto', 'Lato'];
const radiusOptions = { sharp: 'Cantos retos', soft: 'Cantos suaves', round: 'Cantos arredondados' };
const densityOptions = { compact: 'Compacta', comfortable: 'Confortável', spacious: 'Espaçada' };
const themeOptions = { dark: 'Escuro', light: 'Claro', system: 'Seguir sistema' };

export default function BrandingPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const role = currentRole?.role;
  const qc = useQueryClient();
  const [form, setForm] = useState(defaults);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['branding-settings', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('branding_settings').select('*')
        .eq('restaurant_id', restaurantId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        ...defaults,
        ...Object.fromEntries(Object.keys(defaults).map(k => [k, (settings as Record<string, unknown>)[k] ?? defaults[k as keyof typeof defaults]])),
      } as typeof defaults);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { restaurant_id: restaurantId!, ...form };
      if (settings) {
        const { error } = await supabase.from('branding_settings').update(payload).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('branding_settings').insert(payload);
        if (error) throw error;
      }
      await logAudit({
        restaurantId: restaurantId!, role, action: 'update', entity: 'branding',
        summary: 'Identidade visual atualizada', before: settings, after: payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branding-settings'] });
      qc.invalidateQueries({ queryKey: ['branding'] });
      toast.success('Interface atualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadImage = async (field: keyof typeof defaults, file: File) => {
    const path = `${restaurantId}/${field}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from('menu-images').getPublicUrl(path);
    setForm(f => ({ ...f, [field]: data.publicUrl }));
    toast.success('Imagem enviada — salve para aplicar');
  };

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const colorField = (key: keyof typeof defaults, label: string) => (
    <div className="space-y-2" key={key}>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="color" className="h-10 w-14 p-1" value={form[key] as string} onChange={e => setForm({ ...form, [key]: e.target.value })} />
        <Input value={form[key] as string} onChange={e => setForm({ ...form, [key]: e.target.value })} />
      </div>
    </div>
  );

  const imageField = (key: keyof typeof defaults, label: string) => (
    <div className="space-y-2" key={key}>
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={form[key] as string} placeholder="URL da imagem" onChange={e => setForm({ ...form, [key]: e.target.value })} />
        <Input type="file" accept="image/*" className="max-w-[220px]" onChange={e => e.target.files?.[0] && uploadImage(key, e.target.files[0])} />
      </div>
      {form[key] ? <img src={form[key] as string} alt={label} className="h-12 rounded border object-contain" /> : null}
    </div>
  );

  return (
    <FeatureGate feature="branding">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Palette className="h-7 w-7" /> Identidade visual</h1>
            <p className="text-muted-foreground">Personalize logos, cores e textos da interface do seu restaurante.</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => setForm(defaults)}><RotateCcw className="h-4 w-4" /> Restaurar padrão</Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Marca</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome exibido</Label>
                <Input value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} placeholder="Oxys Restaurante" />
              </div>
              {imageField('logo_light_url', 'Logo (fundo claro)')}
              {imageField('logo_dark_url', 'Logo (fundo escuro)')}
              {imageField('favicon_url', 'Favicon')}
              {imageField('login_background_url', 'Fundo da tela de login')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cores</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {colorField('primary_color', 'Cor primária')}
              {colorField('secondary_color', 'Cor secundária')}
              {colorField('accent_color', 'Cor de destaque')}
              {colorField('background_color', 'Fundo')}
              {colorField('foreground_color', 'Texto')}
              {colorField('sidebar_color', 'Menu lateral')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tipografia e layout</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fonte dos títulos</Label>
                <Select value={form.font_heading} onValueChange={v => setForm({ ...form, font_heading: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{fontOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fonte do texto</Label>
                <Select value={form.font_body} onValueChange={v => setForm({ ...form, font_body: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{fontOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cantos</Label>
                <Select value={form.radius} onValueChange={v => setForm({ ...form, radius: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(radiusOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Densidade</Label>
                <Select value={form.density} onValueChange={v => setForm({ ...form, density: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(densityOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Tema</Label>
                <Select value={form.theme_mode} onValueChange={v => setForm({ ...form, theme_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(themeOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Textos</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Mensagem da tela de login</Label><Input value={form.login_message} onChange={e => setForm({ ...form, login_message: e.target.value })} /></div>
              <div className="space-y-2"><Label>Rodapé do sistema</Label><Input value={form.footer_text} onChange={e => setForm({ ...form, footer_text: e.target.value })} /></div>
              <div className="space-y-2"><Label>Cabeçalho do recibo</Label><Textarea rows={2} value={form.receipt_header} onChange={e => setForm({ ...form, receipt_header: e.target.value })} /></div>
              <div className="space-y-2"><Label>Rodapé do recibo</Label><Textarea rows={2} value={form.receipt_footer} onChange={e => setForm({ ...form, receipt_footer: e.target.value })} /></div>
            </CardContent>
          </Card>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar interface
        </Button>
      </div>
    </FeatureGate>
  );
}
