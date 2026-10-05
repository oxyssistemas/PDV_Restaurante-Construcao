import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Copy, Download, FileArchive, Loader2, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { brl } from '@/lib/finance';
import { fiscalApi } from '@/lib/fiscalApi';

const monthLabel = (iso: string) => {
  const t = format(new Date(`${iso.slice(0, 7)}-15T12:00:00`), "MMMM 'de' yyyy", { locale: ptBR });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const sizeLabel = (b: number | null) => (!b ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Pacote do mês para o contador: XMLs das NFC-e + planilhas, com link para enviar. */
export default function AccountantPage() {
  const { currentRole } = useAuth();
  const rid = currentRole?.restaurant_id;
  const qc = useQueryClient();
  const months = useMemo(() => Array.from({ length: 13 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM')), []);
  const [month, setMonth] = useState(months[1]); // mês passado é o que o contador costuma pedir
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });

  const { data: profile } = useQuery({
    queryKey: ['accountant-contact', rid],
    enabled: !!rid,
    queryFn: async () => (await supabase.from('fiscal_profiles').select('accountant_name, accountant_email, accountant_phone, legal_name').eq('restaurant_id', rid!).maybeSingle()).data,
  });
  useEffect(() => {
    if (profile) setContact({ name: profile.accountant_name ?? '', email: profile.accountant_email ?? '', phone: profile.accountant_phone ?? '' });
  }, [profile]);

  const { data: exports, isLoading } = useQuery({
    queryKey: ['accountant-exports', rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data, error } = await supabase.from('accountant_exports').select('*').eq('restaurant_id', rid!).order('created_at', { ascending: false }).limit(24);
      if (error) throw error;
      return data;
    },
  });

  const saveContact = useMutation({
    mutationFn: () => fiscalApi.accountantContact(rid!, contact),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accountant-contact'] }); toast.success('Contato do contador salvo.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: () => fiscalApi.accountantPackage(rid!, month),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accountant-exports'] }); toast.success('Pacote gerado. Envie o link ao contador ou baixe o arquivo.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const link = async (id: string) => (await fiscalApi.accountantLink(rid!, id)).url;
  const message = (period: string, url: string) =>
    `Olá${contact.name ? `, ${contact.name.split(' ')[0]}` : ''}! Segue o pacote fiscal de ${monthLabel(period)}${profile?.legal_name ? ` da ${profile.legal_name}` : ''} (XMLs das NFC-e e planilhas). O link vale por 7 dias: ${url}`;

  const share = async (id: string, period: string, how: 'copy' | 'whatsapp' | 'email' | 'download') => {
    try {
      const url = await link(id);
      if (how === 'download') { window.location.href = url; return; }
      const text = message(period, url);
      if (how === 'copy') { await navigator.clipboard.writeText(text); toast.success('Mensagem com o link copiada.'); return; }
      if (how === 'whatsapp') {
        const phone = contact.phone.replace(/\D/g, '');
        window.open(`https://wa.me/${phone ? (phone.length <= 11 ? `55${phone}` : phone) : ''}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        return;
      }
      window.location.href = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(`Pacote fiscal ${monthLabel(period)}`)}&body=${encodeURIComponent(text)}`;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!rid) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><FileArchive className="h-7 w-7 text-primary" /> Pacote do contador</h1>
        <p className="text-sm text-muted-foreground">Um arquivo .zip por mês com os XMLs das NFC-e, a lista de notas, vendas por dia e forma de pagamento, produtos com NCM/CFOP, despesas e folha.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Gerar pacote</CardTitle><CardDescription>Os XMLs também ficam guardados no sistema, como a lei exige.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Mês</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map(m => <SelectItem key={m} value={m} >{monthLabel(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending} className="gap-2">
              {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} Gerar pacote
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Contador</CardTitle><CardDescription>Para mandar o link pelo WhatsApp ou email com um clique.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>WhatsApp</Label><Input inputMode="tel" value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></div>
            <Button variant="outline" className="w-fit" onClick={() => saveContact.mutate()} disabled={saveContact.isPending}>Salvar contato</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Pacotes gerados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : !exports?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pacote gerado ainda.</p>
          ) : exports.map(x => (
            <div key={x.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{monthLabel(x.period)}</span>
                <Badge variant="outline">{x.invoices_count} nota(s) · {x.xml_count} XML</Badge>
                <span className="text-xs text-muted-foreground">Recebido {brl(Number(x.revenue))} · em NFC-e {brl(Number(x.invoiced))}</span>
                <span className="ml-auto text-xs text-muted-foreground">{new Date(x.created_at).toLocaleString('pt-BR')} {sizeLabel(x.file_size)}</span>
              </div>
              {!!x.warnings?.length && (
                <ul className="mt-2 space-y-0.5 text-xs text-amber-500">
                  {x.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}</li>)}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => share(x.id, x.period, 'download')}><Download className="h-3.5 w-3.5" /> Baixar</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => share(x.id, x.period, 'whatsapp')}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => share(x.id, x.period, 'email')} disabled={!contact.email}><Mail className="h-3.5 w-3.5" /> Email</Button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => share(x.id, x.period, 'copy')}><Copy className="h-3.5 w-3.5" /> Copiar link</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
