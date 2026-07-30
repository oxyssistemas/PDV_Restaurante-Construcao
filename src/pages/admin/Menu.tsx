import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Loader2, Pencil, Trash2, Upload, Boxes } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import MenuImage, { useMenuImageUrl } from '@/components/MenuImage';

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

  const { data: inventory } = useQuery({
    queryKey: ['inventory-list', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory')
        .select('id, name, unit, quantity')
        .eq('restaurant_id', restaurantId!)
        .order('name');
      return data || [];
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
                      <TableHead className="w-16">Foto</TableHead>
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
                        <TableCell>
                          <MenuImage path={item.image_url} alt={item.name} className="h-11 w-11" />
                        </TableCell>
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
                        <TableCell className="text-right whitespace-nowrap">
                          <RecipeDialog restaurantId={restaurantId!} item={item} inventory={inventory || []} />
                          <ItemDialog restaurantId={restaurantId!} categories={categories || []} editItem={item} />
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteItem.mutate(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {items?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum item cadastrado</TableCell>
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
  const [imagePath, setImagePath] = useState<string | null>(editItem?.image_url || null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { data: previewUrl } = useMenuImageUrl(imagePath);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: false });
    if (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    } else {
      setImagePath(path);
      toast({ title: 'Foto carregada' });
    }
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      name,
      description: description || null,
      price: Number(price),
      category_id: categoryId || null,
      image_url: imagePath,
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
      if (!editItem) { setName(''); setDescription(''); setPrice(''); setCategoryId(''); setImagePath(null); }
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
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>{editItem ? 'Editar' : 'Novo'} Item</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            {previewUrl ? (
              <img src={previewUrl} alt={name || 'Prévia do item'} className="h-20 w-20 rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">Sem foto</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="item-photo" className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {imagePath ? 'Trocar foto' : 'Enviar foto'}
                </span>
              </Label>
              <input
                id="item-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
              />
              {imagePath && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setImagePath(null)}>
                  Remover foto
                </Button>
              )}
            </div>
          </div>
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
            <Button type="submit" disabled={loading || uploading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecipeDialog({ restaurantId, item, inventory }: { restaurantId: string; item: any; inventory: any[] }) {
  const [open, setOpen] = useState(false);
  const [inventoryId, setInventoryId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const queryClient = useQueryClient();

  const { data: recipe } = useQuery({
    queryKey: ['recipe', item.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_item_ingredients')
        .select('*, inventory(name, unit)')
        .eq('menu_item_id', item.id);
      return data || [];
    },
  });

  const addIngredient = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('menu_item_ingredients').insert({
        restaurant_id: restaurantId,
        menu_item_id: item.id,
        inventory_id: inventoryId,
        quantity: Number(quantity),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', item.id] });
      setInventoryId(''); setQuantity('1');
      toast({ title: 'Ingrediente vinculado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const removeIngredient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_item_ingredients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipe', item.id] }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Ficha técnica (baixa de estoque)">
          <Boxes className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>Ficha técnica — {item.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Os insumos abaixo têm baixa automática no estoque a cada pedido lançado.
        </p>

        <div className="space-y-2">
          {recipe?.length ? recipe.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span>{(r as any).inventory?.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  {Number(r.quantity)} {(r as any).inventory?.unit} / unidade
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeIngredient.mutate(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">Nenhum insumo vinculado.</p>}
        </div>

        <div className="grid grid-cols-[1fr_100px_auto] items-end gap-2 border-t pt-4">
          <div className="space-y-1">
            <Label className="text-xs">Insumo</Label>
            <Select value={inventoryId} onValueChange={setInventoryId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {inventory.map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Qtd.</Label>
            <Input type="number" step="0.001" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <Button disabled={!inventoryId || addIngredient.isPending} onClick={() => addIngredient.mutate()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
