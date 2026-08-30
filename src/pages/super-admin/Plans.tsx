import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { brl } from '@/lib/finance';
import { featureKeys, featureLabels, planLabels } from '@/lib/plans';

export default function PlansPage() {
  const qc = useQueryClient();

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: restaurants } = useQuery({
    queryKey: ['plans-restaurants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('id, name, plan_code, status').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const toggleFeature = useMutation({
    mutationFn: async ({ id, features }: { id: string; features: Record<string, boolean> }) => {
      const { error } = await supabase.from('plans').update({ features }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plans'] }); qc.invalidateQueries({ queryKey: ['plan-features'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPlan = useMutation({
    mutationFn: async ({ id, plan_code }: { id: string; plan_code: string }) => {
      const { error } = await supabase.from('restaurants').update({ plan_code }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans-restaurants'] });
      qc.invalidateQueries({ queryKey: ['plan-features'] });
      toast.success('Plano atualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Planos</h1>
        <p className="text-muted-foreground">Defina as funcionalidades de cada plano e o plano de cada restaurante.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(plans || []).map(p => {
          const features = (p.features as Record<string, boolean> | null) ?? {};
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{p.name}</span>
                  <Badge variant="secondary">{brl(Number(p.price_month))}/mês</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {featureKeys.map(k => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{featureLabels[k]}</span>
                    <Switch
                      checked={features[k] !== false}
                      onCheckedChange={v => toggleFeature.mutate({ id: p.id, features: { ...features, [k]: v } })}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>Plano por restaurante</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(restaurants || []).map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 border-b py-2 last:border-0">
              <div className="min-w-[160px] flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.status === 'active' ? 'Ativo' : 'Bloqueado'}</p>
              </div>
              <Select value={r.plan_code} onValueChange={v => setPlan.mutate({ id: r.id, plan_code: v })}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(plans || []).map(p => <SelectItem key={p.code} value={p.code}>{planLabels[p.code] ?? p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
          {(restaurants || []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum restaurante cadastrado.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
