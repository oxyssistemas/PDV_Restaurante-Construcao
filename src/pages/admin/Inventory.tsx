import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function InventoryPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['admin-inventory', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      toast({ title: 'Produto removido' });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Estoque</h1>
        <InventoryDialog restaurantId={restaurantId!} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Custo/Un</TableHead>
                  <TableHead>Estoque Mín.</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory?.map(item => {
                  const lowStock = Number(item.quantity) <= Number(item.minimum_stock);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {item.name}
                          {lowStock && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={lowStock ? 'destructive' : 'secondary'}>{Number(item.quantity)}</Badge>
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>{item.cost_per_unit ? `R$ ${Number(item.cost_per_unit).toFixed(2)}` : '—'}</TableCell>
                      <TableCell>{Number(item.minimum_stock)}</TableCell>
                      <TableCell className="text-right">
                        <InventoryDialog restaurantId={restaurantId!} editItem={item} />
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteItem.mutate(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {inventory?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum produto cadastrado</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InventoryDialog({ restaurantId, editItem }: { restaurantId: string; editItem?: any }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editItem?.name || '');
  const [quantity, setQuantity] = useState(editItem ? String(editItem.quantity) : '0');
  const [unit, setUnit] = useState(editItem?.unit || 'un');
  const [costPerUnit, setCostPerUnit] = useState(editItem?.cost_per_unit ? String(editItem.cost_per_unit) : '');
  const [minimumStock, setMinimumStock] = useState(editItem ? String(editItem.minimum_stock) : '0');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      name,
      quantity: Number(quantity),
      unit,
      cost_per_unit: costPerUnit ? Number(costPerUnit) : null,
      minimum_stock: Number(minimumStock),
      restaurant_id: restaurantId,
    };

    const { error } = editItem
      ? await supabase.from('inventory').update(payload).eq('id', editItem.id)
      : await supabase.from('inventory').insert(payload);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      toast({ title: editItem ? 'Produto atualizado' : 'Produto criado' });
      setOpen(false);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editItem ? (
          <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Produto</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{editItem ? 'Editar' : 'Novo'} Produto</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="un, kg, L..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Custo por Unidade (R$)</Label>
              <Input type="number" min="0" step="0.01" value={costPerUnit} onChange={e => setCostPerUnit(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Estoque Mínimo</Label>
              <Input type="number" min="0" value={minimumStock} onChange={e => setMinimumStock(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
