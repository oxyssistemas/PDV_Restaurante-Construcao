import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Lock, Unlock, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CashRegister() {
  const { user, currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const [openAmount, setOpenAmount] = useState('');
  const [openNotes, setOpenNotes] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);

  const { data: activeRegister, isLoading } = useQuery({
    queryKey: ['cash-register-active', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: todayPayments } = useQuery({
    queryKey: ['cashier-today-payments', restaurantId, activeRegister?.id],
    enabled: !!activeRegister,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, method')
        .eq('restaurant_id', restaurantId!)
        .eq('cash_register_id', activeRegister!.id);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: movements } = useQuery({
    queryKey: ['cashier-movements', activeRegister?.id],
    enabled: !!activeRegister,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('cash_register_id', activeRegister!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const openRegister = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cash_registers').insert({
        restaurant_id: restaurantId!,
        opened_by: user!.id,
        opening_amount: parseFloat(openAmount) || 0,
        notes_opening: openNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register-active'] });
      toast.success('Caixa aberto com sucesso!');
      setOpenDialog(false);
      setOpenAmount('');
      setOpenNotes('');
    },
    onError: () => toast.error('Erro ao abrir caixa.'),
  });

  const closeRegister = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('cash_registers')
        .update({
          closed_at: new Date().toISOString(),
          closed_by: user!.id,
          closing_amount: parseFloat(closeAmount) || 0,
          notes_closing: closeNotes || null,
        })
        .eq('id', activeRegister!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register-active'] });
      toast.success('Caixa fechado com sucesso!');
      setCloseDialog(false);
      setCloseAmount('');
      setCloseNotes('');
    },
    onError: () => toast.error('Erro ao fechar caixa.'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const totalPayments = todayPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
  const cashPayments = todayPayments?.filter(p => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0) || 0;
  const cardPayments = todayPayments?.filter(p => p.method === 'credit_card' || p.method === 'debit_card').reduce((s, p) => s + Number(p.amount), 0) || 0;
  const pixPayments = todayPayments?.filter(p => p.method === 'pix').reduce((s, p) => s + Number(p.amount), 0) || 0;

  const totalSangria = movements?.filter(m => m.type === 'sangria').reduce((s, m) => s + Number(m.amount), 0) || 0;
  const totalSuprimento = movements?.filter(m => m.type === 'suprimento').reduce((s, m) => s + Number(m.amount), 0) || 0;

  const expectedCash = (activeRegister ? Number(activeRegister.opening_amount) : 0) + cashPayments + totalSuprimento - totalSangria;

  if (!activeRegister) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card>
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>Caixa Fechado</CardTitle>
            <p className="text-sm text-muted-foreground">Abra o caixa para iniciar as operações</p>
          </CardHeader>
          <CardContent>
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button className="w-full" size="lg">
                  <Unlock className="h-4 w-4 mr-2" /> Abrir Caixa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Abrir Caixa</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Valor inicial (R$)</Label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={openAmount} onChange={e => setOpenAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Observações</Label>
                    <Textarea placeholder="Notas opcionais..." value={openNotes} onChange={e => setOpenNotes(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => openRegister.mutate()} disabled={openRegister.isPending}>
                    {openRegister.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Confirmar Abertura
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Caixa Aberto</h1>
          <p className="text-sm text-muted-foreground">
            Aberto em {format(new Date(activeRegister.opened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Lock className="h-4 w-4 mr-1" /> Fechar Caixa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Fechar Caixa</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Valor inicial</span><span>R$ {Number(activeRegister.opening_amount).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Recebido (dinheiro)</span><span className="text-green-600">+ R$ {cashPayments.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Suprimentos</span><span className="text-green-600">+ R$ {totalSuprimento.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Sangrias</span><span className="text-destructive">- R$ {totalSangria.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>Esperado em caixa</span><span>R$ {expectedCash.toFixed(2)}</span></div>
              </div>
              <div>
                <Label>Valor contado em caixa (R$)</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={closeAmount} onChange={e => setCloseAmount(e.target.value)} />
                {closeAmount && (
                  <p className={`text-xs mt-1 ${parseFloat(closeAmount) === expectedCash ? 'text-green-600' : 'text-destructive'}`}>
                    Diferença: R$ {(parseFloat(closeAmount) - expectedCash).toFixed(2)}
                  </p>
                )}
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea placeholder="Notas do fechamento..." value={closeNotes} onChange={e => setCloseNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="destructive" onClick={() => closeRegister.mutate()} disabled={closeRegister.isPending}>
                {closeRegister.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Confirmar Fechamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Recebido</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">R$ {totalPayments.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Dinheiro</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">R$ {cashPayments.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cartão</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">R$ {cardPayments.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">PIX</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">R$ {pixPayments.toFixed(2)}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <CardTitle className="text-sm">Sangrias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-destructive">- R$ {totalSangria.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <CardTitle className="text-sm">Suprimentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600">+ R$ {totalSuprimento.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-sm">Saldo Esperado em Caixa (dinheiro)</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">R$ {expectedCash.toFixed(2)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
