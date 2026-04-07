import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  waiter: 'Garçom',
  kitchen: 'Cozinha',
  cashier: 'Caixa',
  finance: 'Financeiro',
};

const creatableRoles = ['waiter', 'kitchen', 'cashier', 'finance'] as const;

export default function UsersPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <CreateUserForm restaurantId={restaurantId!} onSuccess={() => {
              setCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            }} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID do Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.user_id.slice(0, 8)}...</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{roleLabels[u.role] || u.role}</Badge>
                    </TableCell>
                    <TableCell>{new Date(u.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
                {users?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum usuário cadastrado</TableCell>
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

function CreateUserForm({ restaurantId, onSuccess }: { restaurantId: string; onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('waiter');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { email, password, role, restaurant_id: restaurantId },
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else if (data?.error) {
      toast({ title: 'Erro', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'Usuário criado com sucesso!' });
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <>
      <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Senha *</Label>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="space-y-2">
          <Label>Função *</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {creatableRoles.map(r => (
                <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar Usuário
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
