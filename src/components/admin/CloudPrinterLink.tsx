import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, Link2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cloudPrintUrl, type Printer } from '@/lib/printQueue';

const STEPS: Record<'cloudprnt' | 'epson_sdp', string[]> = {
  cloudprnt: [
    'Ligue a impressora na rede e descubra o IP dela (segure o botão FEED ao ligar para imprimir a configuração).',
    'No navegador de um computador da mesma rede, abra http://IP-DA-IMPRESSORA e entre (usuário root; a senha padrão vem na etiqueta ou é "public").',
    'Em CloudPRNT, marque "Enable", cole o link acima em "Server URL" e use intervalo de consulta de 5 segundos.',
    'Salve e reinicie a impressora. Ela aparece aqui como conectada em até um minuto.',
  ],
  epson_sdp: [
    'Ligue a impressora na rede e descubra o IP dela (segure o botão FEED ao ligar para imprimir a configuração).',
    'No navegador de um computador da mesma rede, abra http://IP-DA-IMPRESSORA (EpsonNet Config) e entre.',
    'Em Server Direct Print, marque "Enable", cole o link acima em "URL" (Print Request) e use intervalo de 5 segundos.',
    'Salve e reinicie a impressora. Ela aparece aqui como conectada em até um minuto.',
  ],
};

/** Link secreto que a impressora nuvem consulta, com o passo a passo da marca. */
export default function CloudPrinterLink({ printer }: { printer: Printer }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = printer.connection as 'cloudprnt' | 'epson_sdp';

  const load = async (rotate = false) => {
    setBusy(true);
    const { data, error } = rotate
      ? await supabase.rpc('rotate_printer_token', { _printer_id: printer.id })
      : await supabase.rpc('printer_device_token', { _printer_id: printer.id });
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? 'Só o administrador vê o link da impressora'); return; }
    setUrl(cloudPrintUrl(printer.connection, data));
    if (rotate) toast.success('Novo link gerado. Atualize na impressora.');
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-2" onClick={() => { setOpen(true); load(); }}>
        <Link2 className="h-4 w-4" /> Link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link da impressora {printer.name}</DialogTitle>
            <DialogDescription>Configure este endereço na própria impressora. Ele é secreto: quem tiver o link recebe os cupons.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={url ?? ''} placeholder="Carregando..." className="font-mono text-xs" onFocus={e => e.currentTarget.select()} />
            <Button size="icon" variant="outline" aria-label="Copiar" disabled={!url}
              onClick={() => url && navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'))}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            {STEPS[kind].map(s => <li key={s}>{s}</li>)}
          </ol>
          <Button variant="ghost" size="sm" className="w-fit gap-2" disabled={busy} onClick={() => load(true)}>
            <RefreshCw className="h-4 w-4" /> Gerar novo link (o atual para de funcionar)
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
