import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Loader2, Lock, Unlock, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function Restaurants() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState<string | null>(null);

  const { data: restaurants, isLoading } = useQuery({
    queryKey: ['super-admin-restaurants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'blocked' }) => {
      const { error } = await supabase
        .from('restaurants')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-restaurants'] });
      toast({ title: 'Status atualizado' });
    },
    onError: (e: any) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Restaurantes</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Novo Restaurante
            </Button>
          </DialogTrigger>
          <DialogContent>
            <CreateRestaurantForm onSuccess={() => {
              setCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: ['super-admin-restaurants'] });
            }} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restaurants?.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.phone || '—'}</TableCell>
                    <TableCell className="capitalize">{r.subscription_plan}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'active' ? 'default' : 'destructive'}>
                        {r.status === 'active' ? 'Ativo' : 'Bloqueado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Dialog open={adminOpen === r.id} onOpenChange={(o) => setAdminOpen(o ? r.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1">
                            <UserPlus className="h-3.5 w-3.5" /> Admin
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <CreateAdminForm
                            restaurantId={r.id}
                            restaurantName={r.name}
                            onSuccess={() => setAdminOpen(null)}
                          />
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant={r.status === 'active' ? 'destructive' : 'outline'}
                        size="sm"
                        className="gap-1"
                        onClick={() => toggleStatus.mutate({
                          id: r.id,
                          status: r.status === 'active' ? 'blocked' : 'active',
                        })}
                      >
                        {r.status === 'active' ? (
                          <><Lock className="h-3.5 w-3.5" /> Bloquear</>
                        ) : (
                          <><Unlock className="h-3.5 w-3.5" /> Desbloquear</>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {restaurants?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum restaurante cadastrado
                    </TableCell>
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

function CreateRestaurantForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('restaurants').insert({ name, address, phone });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Restaurante criado com sucesso!' });
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo Restaurante</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Nome *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Endereço</Label>
          <Input value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Telefone</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} />
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

function CreateAdminForm({ restaurantId, restaurantName, onSuccess }: {
  restaurantId: string;
  restaurantName: string;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Create user via edge function
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { email, password, role: 'admin', restaurant_id: restaurantId },
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else if (data?.error) {
      toast({ title: 'Erro', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: `Admin criado para ${restaurantName}!` });
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Criar Admin — {restaurantName}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Senha *</Label>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar Admin
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
