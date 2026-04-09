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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, TrendingDown, TrendingUp, ArrowDownUp } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CashMovements() {
  const { user, currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [type, setType] = useState<'sangria' | 'suprimento'>('sangria');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const { data: activeRegister } = useQuery({
    queryKey: ['cash-register-active', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: movements, isLoading } = useQuery({
    queryKey: ['cash-movements-list', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const createMovement = useMutation({
    mutationFn: async () => {
      if (!activeRegister) throw new Error('Caixa não está aberto');
      if (!amount || !reason.trim()) throw new Error('Preencha todos os campos');

      const { error } = await supabase.from('cash_movements').insert({
        cash_register_id: activeRegister.id,
        restaurant_id: restaurantId!,
        type: type as any,
        amount: parseFloat(amount),
        reason: reason.trim(),
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-movements-list'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-movements'] });
      toast.success(type === 'sangria' ? 'Sangria registrada!' : 'Suprimento registrado!');
      setDialogOpen(false);
      setAmount('');
      setReason('');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao registrar movimentação.'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const openDialog = (t: 'sangria' | 'suprimento') => {
    setType(t);
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Movimentações de Caixa</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openDialog('sangria')} disabled={!activeRegister}>
            <TrendingDown className="h-4 w-4 mr-1 text-destructive" /> Sangria
          </Button>
          <Button variant="outline" onClick={() => openDialog('suprimento')} disabled={!activeRegister}>
            <TrendingUp className="h-4 w-4 mr-1 text-green-600" /> Suprimento
          </Button>
        </div>
      </div>

      {!activeRegister && (
        <Card className="mb-4 border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4 text-sm text-yellow-700">
            ⚠ Caixa não está aberto. Abra o caixa para registrar movimentações.
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {type === 'sangria' ? <TrendingDown className="h-5 w-5 text-destructive" /> : <TrendingUp className="h-5 w-5 text-green-600" />}
              {type === 'sangria' ? 'Registrar Sangria' : 'Registrar Suprimento'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Textarea placeholder={type === 'sangria' ? 'Ex: Retirada para troco...' : 'Ex: Reposição de troco...'} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant={type === 'sangria' ? 'destructive' : 'default'}
              onClick={() => createMovement.mutate()}
              disabled={!amount || !reason.trim() || createMovement.isPending}
            >
              {createMovement.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle className="text-lg">Histórico</CardTitle></CardHeader>
        <CardContent>
          {!movements?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowDownUp className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data/Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant="outline" className={m.type === 'sangria' ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-green-500/10 text-green-600 border-green-500/30'}>
                        {m.type === 'sangria' ? '↓ Sangria' : '↑ Suprimento'}
                      </Badge>
                    </TableCell>
                    <TableCell className={`font-medium ${m.type === 'sangria' ? 'text-destructive' : 'text-green-600'}`}>
                      {m.type === 'sangria' ? '-' : '+'} R$ {Number(m.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{m.reason}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
