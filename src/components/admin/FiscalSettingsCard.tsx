import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, CircleAlert, FileCheck2, Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import {
  certificateDaysLeft, csosnOptions, cstOptions, environmentLabels, fiscalReadiness,
  formatCnpj, isSimples, ncmSuggestions, onlyDigits, originOptions, providerLabels,
  taxRegimeLabels, unitOptions, type FiscalEnvironment, type TaxRegime,
} from '@/lib/fiscal';

interface Props { restaurantId: string; role?: string | null }

interface FormState {
  cnpj: string; legal_name: string; trade_name: string; state_registration: string;
  municipal_registration: string; tax_regime: TaxRegime;
  street: string; number: string; complement: string; district: string;
  city: string; city_code: string; state: string; zip_code: string; phone: string;
  environment: FiscalEnvironment; provider: string; nfce_series: string; nfce_next_number: string;
  csc_id: string; auto_emit_on_payment: boolean;
  default_ncm: string; default_cfop: string; default_csosn: string;
  default_origin: string; default_unit: string;
}

const emptyForm: FormState = {
  cnpj: '', legal_name: '', trade_name: '', state_registration: '', municipal_registration: '',
  tax_regime: 'simples_nacional', street: '', number: '', complement: '', district: '',
  city: '', city_code: '', state: '', zip_code: '', phone: '',
  environment: 'homologation', provider: 'focus_nfe', nfce_series: '1', nfce_next_number: '1',
  csc_id: '', auto_emit_on_payment: false,
  default_ncm: '', default_cfop: '5102', default_csosn: '', default_origin: '0', default_unit: 'UN',
};

export default function FiscalSettingsCard({ restaurantId, role }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [cscToken, setCscToken] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['fiscal-profile', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscal_profiles')
        .select('id, restaurant_id, cnpj, legal_name, trade_name, state_registration, municipal_registration, tax_regime, street, number, complement, district, city, city_code, state, zip_code, phone, environment, provider, nfce_series, nfce_next_number, csc_id, certificate_path, certificate_expires_at, certificate_uploaded_at, auto_emit_on_payment, default_ncm, default_cfop, default_csosn, default_origin, default_unit, active, created_at, updated_at')
        .eq('restaurant_id', restaurantId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: itemsMissingNcm = 0 } = useQuery({
    queryKey: ['fiscal-items-missing-ncm', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('menu_items').select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId).is('ncm', null);
      if (error) throw error;
      return count || 0;
    },
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      cnpj: formatCnpj(profile.cnpj), legal_name: profile.legal_name || '',
      trade_name: profile.trade_name || '', state_registration: profile.state_registration || '',
      municipal_registration: profile.municipal_registration || '',
      tax_regime: profile.tax_regime as TaxRegime,
      street: profile.street || '', number: profile.number || '', complement: profile.complement || '',
      district: profile.district || '', city: profile.city || '', city_code: profile.city_code || '',
      state: profile.state || '', zip_code: profile.zip_code || '', phone: profile.phone || '',
      environment: profile.environment as FiscalEnvironment, provider: profile.provider,
      nfce_series: profile.nfce_series, nfce_next_number: String(profile.nfce_next_number),
      csc_id: profile.csc_id || '', auto_emit_on_payment: profile.auto_emit_on_payment,
      default_ncm: profile.default_ncm || '', default_cfop: profile.default_cfop || '5102',
      default_csosn: profile.default_csosn || '', default_origin: profile.default_origin,
      default_unit: profile.default_unit,
    });
  }, [profile]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(p => ({ ...p, [k]: v }));

  const checks = fiscalReadiness(
    { ...profile, cnpj: form.cnpj, city_code: form.city_code, state: form.state, csc_id: form.csc_id,
      default_ncm: form.default_ncm, default_cfop: form.default_cfop, default_csosn: form.default_csosn },
    itemsMissingNcm,
  );
  const ready = checks.every(c => c.done);
  const daysLeft = certificateDaysLeft(profile?.certificate_expires_at);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        restaurant_id: restaurantId,
        cnpj: onlyDigits(form.cnpj) || null,
        legal_name: form.legal_name.trim() || null,
        trade_name: form.trade_name.trim() || null,
        state_registration: form.state_registration.trim() || null,
        municipal_registration: form.municipal_registration.trim() || null,
        tax_regime: form.tax_regime,
        street: form.street.trim() || null,
        number: form.number.trim() || null,
        complement: form.complement.trim() || null,
        district: form.district.trim() || null,
        city: form.city.trim() || null,
        city_code: onlyDigits(form.city_code) || null,
        state: form.state.trim().toUpperCase() || null,
        zip_code: onlyDigits(form.zip_code) || null,
        phone: form.phone.trim() || null,
        environment: form.environment,
        provider: form.provider,
        nfce_series: form.nfce_series.trim() || '1',
        nfce_next_number: Math.max(1, Number(form.nfce_next_number) || 1),
        csc_id: form.csc_id.trim() || null,
        auto_emit_on_payment: form.auto_emit_on_payment,
        default_ncm: onlyDigits(form.default_ncm) || null,
        default_cfop: onlyDigits(form.default_cfop) || null,
        default_csosn: form.default_csosn || null,
        default_origin: form.default_origin,
        default_unit: form.default_unit,
      };
      // O token só é gravado quando o admin digita um novo — nunca é lido de volta.
      if (cscToken.trim()) payload.csc_token = cscToken.trim();

      if (profile?.id) {
        const { error } = await supabase.from('fiscal_profiles')
          .update(payload as never).eq('id', profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fiscal_profiles').insert(payload as never);
        if (error) throw error;
      }
      await logAudit({
        restaurantId, role, action: profile?.id ? 'update' : 'create', entity: 'fiscal_profile',
        entityId: profile?.id, summary: 'Configuração fiscal (NFC-e) atualizada',
      });
    },
    onSuccess: () => {
      setCscToken('');
      qc.invalidateQueries({ queryKey: ['fiscal-profile'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      toast.success('Configuração fiscal salva');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadCertificate = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pfx') && !file.name.toLowerCase().endsWith('.p12')) {
      toast.error('Envie o arquivo .pfx ou .p12 do certificado A1');
      return;
    }
    setUploading(true);
    const path = `${restaurantId}/certificate.pfx`;
    const { error } = await supabase.storage
      .from('fiscal-certificates').upload(path, file, { upsert: true, contentType: 'application/x-pkcs12' });
    if (error) {
      toast.error('Falha no envio', { description: error.message });
      setUploading(false);
      return;
    }
    const patch = { certificate_path: path, certificate_uploaded_at: new Date().toISOString() };
    if (profile?.id) {
      await supabase.from('fiscal_profiles').update(patch).eq('id', profile.id);
    } else {
      await supabase.from('fiscal_profiles').insert({ restaurant_id: restaurantId, ...patch } as never);
    }
    await logAudit({
      restaurantId, role, action: 'update', entity: 'fiscal_profile',
      entityId: profile?.id, summary: 'Certificado digital A1 enviado',
    });
    qc.invalidateQueries({ queryKey: ['fiscal-profile'] });
    toast.success('Certificado enviado', { description: 'A senha deve ser cadastrada em segredo pelo suporte.' });
    setUploading(false);
  };

  if (isLoading) {
    return (
      <Card><CardContent className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Configuração Fiscal (NFC-e)
          </CardTitle>
          <Badge variant={ready ? 'secondary' : 'outline'}>
            {ready ? 'Pronto para homologar' : 'Configuração incompleta'}
          </Badge>
          <Badge variant={form.environment === 'production' ? 'default' : 'outline'}>
            {environmentLabels[form.environment]}
          </Badge>
        </div>
        <CardDescription>
          Dados do emitente, certificado digital e padrões fiscais dos itens. Enquanto a configuração não
          estiver completa, o sistema continua gerando pré-notas sem valor fiscal.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Checklist de prontidão */}
        <div className="space-y-2 rounded-lg border p-3">
          <Label className="text-sm font-medium">Checklist de prontidão</Label>
          {checks.map(c => (
            <div key={c.key} className="flex items-start gap-2 text-sm">
              {c.done
                ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                : <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
              <div>
                <span className={c.done ? '' : 'font-medium'}>{c.label}</span>
                {!c.done && c.hint && <p className="text-xs text-muted-foreground">{c.hint}</p>}
              </div>
            </div>
          ))}
          {daysLeft !== null && daysLeft > 0 && daysLeft <= 30 && (
            <Alert variant="destructive">
              <CircleAlert className="h-4 w-4" />
              <AlertDescription>Certificado digital vence em {daysLeft} dia(s).</AlertDescription>
            </Alert>
          )}
        </div>

        <Tabs defaultValue="emitter">
          <TabsList className="flex-wrap">
            <TabsTrigger value="emitter">Emitente</TabsTrigger>
            <TabsTrigger value="address">Endereço</TabsTrigger>
            <TabsTrigger value="certificate">Certificado & SEFAZ</TabsTrigger>
            <TabsTrigger value="defaults">Padrões dos itens</TabsTrigger>
          </TabsList>

          <TabsContent value="emitter" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={e => set('cnpj', formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label>Regime tributário</Label>
                <Select value={form.tax_regime} onValueChange={v => set('tax_regime', v as TaxRegime)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(taxRegimeLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Razão social</Label>
                <Input value={form.legal_name} onChange={e => set('legal_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nome fantasia</Label>
                <Input value={form.trade_name} onChange={e => set('trade_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Inscrição estadual</Label>
                <Input value={form.state_registration} onChange={e => set('state_registration', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Inscrição municipal</Label>
                <Input value={form.municipal_registration} onChange={e => set('municipal_registration', e.target.value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="address" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Logradouro</Label>
                <Input value={form.street} onChange={e => set('street', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input value={form.number} onChange={e => set('number', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input value={form.complement} onChange={e => set('complement', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.district} onChange={e => set('district', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input value={form.zip_code} onChange={e => set('zip_code', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Município</Label>
                <Input value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Código IBGE do município</Label>
                <Input value={form.city_code} onChange={e => set('city_code', e.target.value)} placeholder="Ex.: 3550308" />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Input maxLength={2} value={form.state} onChange={e => set('state', e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-2">
                <Label>Telefone fiscal</Label>
                <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="certificate" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <FileCheck2 className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Certificado digital A1</p>
                <p className="text-xs text-muted-foreground">
                  {profile?.certificate_path
                    ? `Enviado em ${new Date(profile.certificate_uploaded_at!).toLocaleDateString('pt-BR')}`
                    : 'Arquivo .pfx fornecido pela certificadora. Fica armazenado de forma privada no servidor.'}
                </p>
              </div>
              <input
                ref={fileRef} type="file" accept=".pfx,.p12" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadCertificate(f); }}
              />
              <Button type="button" variant="outline" className="gap-2" disabled={uploading}
                onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {profile?.certificate_path ? 'Substituir' : 'Enviar certificado'}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Validade do certificado</Label>
                <Input
                  type="date"
                  value={profile?.certificate_expires_at || ''}
                  onChange={async e => {
                    const v = e.target.value || null;
                    if (profile?.id) {
                      await supabase.from('fiscal_profiles').update({ certificate_expires_at: v }).eq('id', profile.id);
                      qc.invalidateQueries({ queryKey: ['fiscal-profile'] });
                    }
                  }}
                  disabled={!profile?.id}
                />
              </div>
              <div className="space-y-2">
                <Label>Emissor fiscal</Label>
                <Select value={form.provider} onValueChange={v => set('provider', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(providerLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>CSC — Identificador (ID do token)</Label>
                <Input value={form.csc_id} onChange={e => set('csc_id', e.target.value)} placeholder="Ex.: 000001" />
              </div>
              <div className="space-y-2">
                <Label>CSC — Token</Label>
                <Input
                  type="password" value={cscToken} onChange={e => setCscToken(e.target.value)}
                  placeholder={profile?.csc_id ? '•••••••• (mantém o atual)' : 'Cole o token da SEFAZ'}
                />
                <p className="text-xs text-muted-foreground">Gravado com segurança e nunca exibido novamente.</p>
              </div>
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select value={form.environment} onValueChange={v => set('environment', v as FiscalEnvironment)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(environmentLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Série</Label>
                  <Input value={form.nfce_series} onChange={e => set('nfce_series', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Próximo número</Label>
                  <Input type="number" min="1" value={form.nfce_next_number} onChange={e => set('nfce_next_number', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Emitir automaticamente ao quitar o pedido</Label>
                <p className="text-xs text-muted-foreground">
                  Requer o checklist completo. A emissão roda em segundo plano e nunca trava o caixa.
                </p>
              </div>
              <Switch
                checked={form.auto_emit_on_payment}
                disabled={!ready}
                onCheckedChange={v => set('auto_emit_on_payment', v)}
              />
            </div>
          </TabsContent>

          <TabsContent value="defaults" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Todo item do cardápio sem configuração própria herda estes valores. Peça ao contador do
              restaurante os códigos corretos para o regime e o estado.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>NCM padrão</Label>
                <Input value={form.default_ncm} onChange={e => set('default_ncm', e.target.value)} placeholder="Ex.: 21069090" />
                <div className="flex flex-wrap gap-1">
                  {ncmSuggestions.slice(0, 3).map(n => (
                    <button key={n.value} type="button"
                      className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                      onClick={() => set('default_ncm', n.value)}>
                      {n.value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>CFOP padrão</Label>
                <Input value={form.default_cfop} onChange={e => set('default_cfop', e.target.value)} placeholder="5102" />
              </div>
              <div className="space-y-2">
                <Label>{isSimples(form.tax_regime) ? 'CSOSN padrão' : 'CST padrão'}</Label>
                <Select value={form.default_csosn} onValueChange={v => set('default_csosn', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(isSimples(form.tax_regime) ? csosnOptions : cstOptions).map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Origem padrão</Label>
                <Select value={form.default_origin} onValueChange={v => set('default_origin', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {originOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unidade comercial padrão</Label>
                <Select value={form.default_unit} onValueChange={v => set('default_unit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {unitOptions.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {itemsMissingNcm > 0 && (
              <Alert>
                <CircleAlert className="h-4 w-4" />
                <AlertDescription>
                  {itemsMissingNcm} item(ns) do cardápio ainda não têm NCM próprio e usarão o padrão acima.
                  Ajuste as exceções (bebidas com substituição tributária, por exemplo) na tela de Cardápio.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar configuração fiscal
        </Button>
      </CardContent>
    </Card>
  );
}
