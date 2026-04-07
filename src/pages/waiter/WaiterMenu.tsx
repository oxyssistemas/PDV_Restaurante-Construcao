import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function WaiterMenu() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const [search, setSearch] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['waiter-cat', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.from('menu_categories').select('*').eq('restaurant_id', restaurantId!).order('sort_order');
      return data || [];
    },
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ['waiter-menu', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId!).order('name');
      return data || [];
    },
  });

  const filtered = items?.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-4">Cardápio</h1>
      <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="mb-6 max-w-sm" />
      {categories?.map(cat => {
        const catItems = filtered?.filter(i => i.category_id === cat.id);
        if (!catItems?.length) return null;
        return (
          <div key={cat.id} className="mb-6">
            <h2 className="text-lg font-semibold mb-3">{cat.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catItems.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{item.name}</div>
                        {item.description && <div className="text-xs text-muted-foreground mt-1">{item.description}</div>}
                      </div>
                      <Badge variant={item.available ? 'default' : 'destructive'} className="text-xs ml-2">
                        {item.available ? 'Disponível' : 'Indisponível'}
                      </Badge>
                    </div>
                    <div className="text-primary font-bold mt-2">R$ {Number(item.price).toFixed(2)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
