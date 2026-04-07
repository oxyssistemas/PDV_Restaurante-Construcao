import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const { data: restaurant, isLoading } = useQuery({
    queryKey: ['admin-restaurant', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (restaurant) {
      setName(restaurant.name);
      setAddress(restaurant.address || '');
      setPhone(restaurant.phone || '');
    }
  }, [restaurant]);

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('restaurants')
        .update({ name, address, phone })
        .eq('id', restaurantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-restaurant'] });
      toast({ title: 'Configurações salvas!' });
    },
    onError: (e: any) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Configurações</h1>
      <Card className="max-w-lg">
        <CardHeader><CardTitle>Dados do Restaurante</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); update.mutate(); }} className="space-y-4">
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
            <Button type="submit" disabled={update.isPending} className="gap-2">
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
