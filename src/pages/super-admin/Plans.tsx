import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { brl } from '@/lib/finance';
import { FEATURES, FeatureKey, PLAN_SUGGESTION, featureGroups, featureKeys, planLabels } from '@/lib/plans';
import type { Tables } from '@/integrations/supabase/types';

type Plan = Tables<'plans'>;
const featuresOf = (p: Plan) => ((p.features as Record<string, boolean> | null) ?? {});

export default function PlansPage() {
  const qc = useQueryClient();
  const [confirmSuggestion, setConfirmSuggestion] = useState(false);

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
      const { data, error } = await supabase.from('restaurants').select('id, name, plan_code, status, parent_id').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['plans'] }); qc.invalidateQueries({ queryKey: ['plan-features'] }); };

  const savePlan = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Plan> }) => {
      const { error } = await supabase.from('plans').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (p: Plan, keys: FeatureKey[], on: boolean) =>
    savePlan.mutate({ id: p.id, patch: { features: { ...featuresOf(p), ...Object.fromEntries(keys.map(k => [k, on])) } } });

  const applySuggestion = useMutation({
    mutationFn: async () => {
      for (const p of plans || []) {
        const s = PLAN_SUGGESTION[p.code];
        if (!s) continue;
        const { error } = await supabase.from('plans')
          .update({ features: { ...featuresOf(p), ...s.features }, price_month: s.price, description: s.description })
          .eq('id', p.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(); setConfirmSuggestion(false); toast.success('Sugestão aplicada aos 3 planos.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPlan = useMutation({
    mutationFn: async ({ id, plan_code }: { id: string; plan_code: string }) => {
      // as filiais seguem o plano da matriz
      const { error } = await supabase.from('restaurants').update({ plan_code }).or(`id.eq.${id},parent_id.eq.${id}`);
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
  const list = plans || [];
  const countOn = (p: Plan) => featureKeys.filter(k => featuresOf(p)[k] !== false).length;
  const restaurantsOn = (code: string) => (restaurants || []).filter(r => r.plan_code === code && !r.parent_id).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Planos</h1>
          <p className="text-muted-foreground">
            Ligue ou desligue cada função em cada plano. A mudança vale na hora para todos os restaurantes do plano
            (telas, loja online, QR da mesa, totem, avaliação, iFood, WhatsApp e apps de delivery).
          </p>
        </div>
        {confirmSuggestion ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2 text-sm">
            <span>Trocar funções, preços e descrições dos 3 planos pela sugestão?</span>
            <Button size="sm" disabled={applySuggestion.isPending} onClick={() => applySuggestion.mutate()}>
              {applySuggestion.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Aplicar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmSuggestion(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button variant="outline" className="gap-2" onClick={() => setConfirmSuggestion(true)}>
            <Sparkles className="h-4 w-4" /> Aplicar sugestão de mercado
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {list.map(p => (
          <PlanHeader key={p.id} plan={p} enabled={countOn(p)} restaurants={restaurantsOn(p.code)}
            onSave={patch => savePlan.mutate({ id: p.id, patch }, { onSuccess: () => toast.success('Plano salvo') })} saving={savePlan.isPending} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funções por plano</CardTitle>
          <CardDescription>Use a chave do grupo para ligar ou desligar o grupo inteiro naquele plano.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-4 py-3 font-medium">Função</th>
                {list.map(p => <th key={p.id} className="w-32 px-2 py-3 text-center font-medium">{planLabels[p.code] ?? p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {featureGroups.map(group => {
                const keys = featureKeys.filter(k => FEATURES[k].group === group);
                return [
                  <tr key={group} className="border-b bg-muted/20">
                    <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</td>
                    {list.map(p => {
                      const on = keys.filter(k => featuresOf(p)[k] !== false).length;
                      return (
                        <td key={p.id} className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{on}/{keys.length}</span>
                            <Switch checked={on === keys.length} disabled={savePlan.isPending}
                              aria-label={`${group} no plano ${p.name}`}
                              onCheckedChange={v => toggle(p, keys, v)} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>,
                  ...keys.map(k => (
                    <tr key={k} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{FEATURES[k].label}</div>
                        <div className="text-xs text-muted-foreground">{FEATURES[k].hint}</div>
                      </td>
                      {list.map(p => (
                        <td key={p.id} className="px-2 py-2.5 text-center">
                          <Switch checked={featuresOf(p)[k] !== false} disabled={savePlan.isPending}
                            aria-label={`${FEATURES[k].label} no plano ${p.name}`}
                            onCheckedChange={v => toggle(p, [k], v)} />
                        </td>
                      ))}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Plano por restaurante</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(restaurants || []).filter(r => !r.parent_id).map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 border-b py-2 last:border-0">
              <div className="min-w-[160px] flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.status === 'active' ? 'Ativo' : 'Bloqueado'} · as filiais seguem o plano da matriz</p>
              </div>
              <Select value={r.plan_code} onValueChange={v => setPlan.mutate({ id: r.id, plan_code: v })}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {list.map(p => <SelectItem key={p.code} value={p.code}>{planLabels[p.code] ?? p.name}</SelectItem>)}
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

function PlanHeader({ plan, enabled, restaurants, onSave, saving }: {
  plan: Plan; enabled: number; restaurants: number; onSave: (patch: Partial<Plan>) => void; saving: boolean;
}) {
  const [price, setPrice] = useState(String(plan.price_month ?? 0));
  const [description, setDescription] = useState(plan.description ?? '');
  useEffect(() => { setPrice(String(plan.price_month ?? 0)); setDescription(plan.description ?? ''); }, [plan.price_month, plan.description]);
  const suggestion = PLAN_SUGGESTION[plan.code];
  const dirty = Number(price.replace(',', '.')) !== Number(plan.price_month) || description !== (plan.description ?? '');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{plan.name}</span>
          <Badge variant="secondary">{brl(Number(plan.price_month))}/mês</Badge>
        </CardTitle>
        <CardDescription>{enabled} de {featureKeys.length} funções · {restaurants} restaurante(s)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`price-${plan.id}`}>Preço mensal (R$)</label>
          <Input id={`price-${plan.id}`} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
          {suggestion && <p className="text-xs text-muted-foreground">Sugestão: {brl(suggestion.price)}/mês</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`desc-${plan.id}`}>Descrição (aparece para o cliente)</label>
          <Textarea id={`desc-${plan.id}`} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <Button size="sm" className="w-full" disabled={!dirty || saving}
          onClick={() => onSave({ price_month: Math.max(0, Number(price.replace(',', '.')) || 0), description: description.trim() || null })}>
          Salvar preço e descrição
        </Button>
      </CardContent>
    </Card>
  );
}
