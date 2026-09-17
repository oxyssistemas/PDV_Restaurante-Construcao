import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, Download, Printer, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  tableNumber: number;
  qrToken: string;
  brandName?: string;
}

export default function TableQrDialog({ tableNumber, qrToken, brandName }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const link = `${window.location.origin}/mesa/${qrToken}`;

  useEffect(() => {
    QRCode.toDataURL(link, { width: 600, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [link]);

  const print = () => {
    if (!dataUrl) return;
    const win = window.open('', '_blank', 'width=420,height=620');
    if (!win) return;
    win.document.write(`
      <html><head><title>Mesa ${tableNumber}</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:24px">
        <h2 style="margin:0 0 4px">${brandName ?? 'Cardápio digital'}</h2>
        <p style="margin:0 0 16px">Mesa ${tableNumber}</p>
        <img src="${dataUrl}" style="width:280px;height:280px" />
        <p style="font-size:12px;margin-top:16px">Aponte a câmera do celular para ver o cardápio e pedir.</p>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <>
      <DialogHeader><DialogTitle>QR Code da Mesa {tableNumber}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="flex justify-center rounded-xl bg-white p-4">
          {dataUrl ? (
            <img src={dataUrl} alt={`QR Code da mesa ${tableNumber}`} className="h-56 w-56" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2">
          <Label>Link do cardápio</Label>
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={e => e.currentTarget.select()} />
            <Button variant="outline" size="icon" onClick={() => {
              navigator.clipboard.writeText(link);
              toast({ title: 'Link copiado' });
            }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={print} disabled={!dataUrl}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="outline" className="flex-1 gap-2" disabled={!dataUrl} asChild>
            <a href={dataUrl ?? '#'} download={`mesa-${tableNumber}-qrcode.png`}>
              <Download className="h-4 w-4" /> Baixar
            </a>
          </Button>
        </div>
      </div>
    </>
  );
}
