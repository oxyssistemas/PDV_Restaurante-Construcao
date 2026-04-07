import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function MenuPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ['menu-categories', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_categories')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['menu-items', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*, menu_categories(name)')
        .eq('restaurant_id', restaurantId!)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] });
      toast({ title: 'Categoria removida' });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: 'Item removido' });
    },
  });

  const toggleAvailable = useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) => {
      const { error } = await supabase.from('menu_items').update({ available }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items'] }),
  });

  const isLoading = catLoading || itemsLoading;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Cardápio</h1>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <Tabs defaultValue="items">
          <TabsList className="mb-4">
            <TabsTrigger value="items">Itens ({items?.length || 0})</TabsTrigger>
            <TabsTrigger value="categories">Categorias ({categories?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="items">
            <div className="flex justify-end mb-4">
              <ItemDialog restaurantId={restaurantId!} categories={categories || []} />
            </div>
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Disponível</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items?.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <div>{item.name}</div>
                          {item.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</div>}
                        </TableCell>
                        <TableCell>{(item as any).menu_categories?.name || '—'}</TableCell>
                        <TableCell>R$ {Number(item.price).toFixed(2)}</TableCell>
                        <TableCell>
                          <Switch
                            checked={item.available}
                            onCheckedChange={(v) => toggleAvailable.mutate({ id: item.id, available: v })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <ItemDialog restaurantId={restaurantId!} categories={categories || []} editItem={item} />
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteItem.mutate(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {items?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum item cadastrado</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories">
            <div className="flex justify-end mb-4">
              <CategoryDialog restaurantId={restaurantId!} />
            </div>
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Ordem</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories?.map(cat => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell>{cat.sort_order}</TableCell>
                        <TableCell className="text-right">
                          <CategoryDialog restaurantId={restaurantId!} editCategory={cat} />
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteCategory.mutate(cat.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {categories?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhuma categoria cadastrada</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function CategoryDialog({ restaurantId, editCategory }: { restaurantId: string; editCategory?: any }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editCategory?.name || '');
  const [sortOrder, setSortOrder] = useState(String(editCategory?.sort_order || 0));
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = { name, sort_order: Number(sortOrder), restaurant_id: restaurantId };

    const { error } = editCategory
      ? await supabase.from('menu_categories').update(payload).eq('id', editCategory.id)
      : await supabase.from('menu_categories').insert(payload);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] });
      toast({ title: editCategory ? 'Categoria atualizada' : 'Categoria criada' });
      setOpen(false);
      if (!editCategory) { setName(''); setSortOrder('0'); }
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editCategory ? (
          <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button className="gap-2"><Plus className="h-4 w-4" /> Nova Categoria</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{editCategory ? 'Editar' : 'Nova'} Categoria</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Ordem</Label>
            <Input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
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

function ItemDialog({ restaurantId, categories, editItem }: { restaurantId: string; categories: any[]; editItem?: any }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editItem?.name || '');
  const [description, setDescription] = useState(editItem?.description || '');
  const [price, setPrice] = useState(editItem ? String(editItem.price) : '');
  const [categoryId, setCategoryId] = useState(editItem?.category_id || '');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      name,
      description: description || null,
      price: Number(price),
      category_id: categoryId || null,
      restaurant_id: restaurantId,
    };

    const { error } = editItem
      ? await supabase.from('menu_items').update(payload).eq('id', editItem.id)
      : await supabase.from('menu_items').insert(payload);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast({ title: editItem ? 'Item atualizado' : 'Item criado' });
      setOpen(false);
      if (!editItem) { setName(''); setDescription(''); setPrice(''); setCategoryId(''); }
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editItem ? (
          <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Item</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{editItem ? 'Editar' : 'Novo'} Item</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Preço (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
