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
import { Plus, Loader2, Trash2, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  free: { label: 'Livre', variant: 'secondary' },
  occupied: { label: 'Ocupada', variant: 'destructive' },
  reserved: { label: 'Reservada', variant: 'default' },
};

export default function TablesPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tables, isLoading } = useQuery({
    queryKey: ['admin-tables', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('number');
      if (error) throw error;
      return data;
    },
  });

  const deleteTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('restaurant_tables').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tables'] });
      toast({ title: 'Mesa removida' });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Mesas</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nova Mesa</Button>
          </DialogTrigger>
          <DialogContent>
            <CreateTableForm restaurantId={restaurantId!} onSuccess={() => {
              setCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: ['admin-tables'] });
            }} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {tables?.map(table => {
            const s = statusMap[table.status] || statusMap.free;
            return (
              <Card key={table.id} className="relative">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-bold">Mesa {table.number}</span>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> {table.capacity} lugares
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive"
                    onClick={() => deleteTable.mutate(table.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {tables?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">Nenhuma mesa cadastrada</div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateTableForm({ restaurantId, onSuccess }: { restaurantId: string; onSuccess: () => void }) {
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('restaurant_tables').insert({
      number: Number(number),
      capacity: Number(capacity),
      restaurant_id: restaurantId,
    });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Mesa criada!' });
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <>
      <DialogHeader><DialogTitle>Nova Mesa</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Número *</Label>
          <Input type="number" min="1" value={number} onChange={e => setNumber(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Capacidade (lugares)</Label>
          <Input type="number" min="1" value={capacity} onChange={e => setCapacity(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
