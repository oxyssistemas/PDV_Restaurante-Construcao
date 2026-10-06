import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Loader2, Lock, Pencil, RotateCcw, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MODULES, ModuleKey, moduleGroups, moduleLabels, defaultModuleAccess, modulesForRole,
} from '@/lib/modules';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { logAudit } from '@/lib/audit';
import { ROLE_LABELS, ROLE_PRIORITY } from '@/lib/roles';

interface PermRow { module: string; can_view: boolean; can_edit: boolean; user_id: string }
type Access = { view: boolean; edit: boolean };
type Member = { userId: string; roles: string[]; email: string | null; modules: ModuleKey[] };

const levelOf = (a: Access) => (a.edit ? 'edit' : a.view ? 'view' : 'none');

export default function PermissionsPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();
  const { hasFeature } = usePlanFeatures();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: roleRows, isLoading } = useQuery({
    queryKey: ['perm-users', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('restaurant_id', restaurantId!)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const { data: emails } = useQuery({
    queryKey: ['staff-emails', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.rpc('staff_emails', { _restaurant_id: restaurantId! });
      return Object.fromEntries((data || []).map(r => [r.user_id, r.email])) as Record<string, string>;
    },
  });

  const { data: perms } = useQuery({
    queryKey: ['perm-rows', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_permissions')
        .select('user_id, module, can_view, can_edit')
        .eq('restaurant_id', restaurantId!);
      if (error) throw error;
      return data as PermRow[];
    },
  });

  // uma pessoa pode ter mais de um cargo na loja: junta as telas de todos
  const members = useMemo<Member[]>(() => {
    const map = new Map<string, string[]>();
    (roleRows || []).forEach(r => map.set(r.user_id, [...(map.get(r.user_id) || []), r.role]));
    return Array.from(map.entries())
      .filter(([, roles]) => !roles.includes('admin') && !roles.includes('super_admin'))
      .map(([userId, roles]) => ({
        userId,
        roles: [...roles].sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b)),
        email: emails?.[userId] ?? null,
        modules: Array.from(new Set(roles.flatMap(modulesForRole))),
      }));
  }, [roleRows, emails]);

  useEffect(() => {
    if (!members.length) return;
    if (!selected || !members.some(m => m.userId === selected)) setSelected(members[0].userId);
  }, [members, selected]);

  const permMap = useMemo(() => {
    const map: Record<string, Access> = {};
    (perms || []).forEach(p => { map[`${p.user_id}:${p.module}`] = { view: p.can_view || p.can_edit, edit: p.can_edit }; });
    return map;
  }, [perms]);

  const accessOf = (m: Member, mod: ModuleKey) => permMap[`${m.userId}:${mod}`] ?? defaultModuleAccess(m.roles, mod);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['perm-rows'] });
    queryClient.invalidateQueries({ queryKey: ['module-permissions'] });
  };

  const save = useMutation({
    mutationFn: async (input: { member: Member; modules: ModuleKey[]; access: Access }) => {
      const { error } = await supabase.from('module_permissions').upsert(
        input.modules.map(module => ({
          restaurant_id: restaurantId!,
          user_id: input.member.userId,
          module,
          can_view: input.access.view || input.access.edit,
          can_edit: input.access.edit,
        })),
        { onConflict: 'restaurant_id,user_id,module' },
      );
      if (error) throw error;
      const what = input.modules.length === 1 ? moduleLabels[input.modules[0]] : `${input.modules.length} telas`;
      const level = input.access.edit ? 'ver e editar' : input.access.view ? 'só ver' : 'sem acesso';
      await logAudit({
        restaurantId: restaurantId!,
        action: 'update',
        entity: 'module_permission',
        entityId: input.member.userId,
        summary: `Permissão de ${input.member.email ?? input.member.userId.slice(0, 8)} em ${what}: ${level}`,
        role: currentRole?.role,
      });
    },
    onSuccess: () => { invalidate(); toast.success('Permissão atualizada.'); },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar permissão.'),
  });

  const reset = useMutation({
    mutationFn: async (member: Member) => {
      const { error } = await supabase.from('module_permissions').delete()
        .eq('restaurant_id', restaurantId!).eq('user_id', member.userId);
      if (error) throw error;
      await logAudit({
        restaurantId: restaurantId!, action: 'update', entity: 'module_permission', entityId: member.userId,
        summary: `Permissões de ${member.email ?? member.userId.slice(0, 8)} voltaram ao padrão do cargo`, role: currentRole?.role,
      });
    },
    onSuccess: () => { invalidate(); toast.success('Permissões voltaram ao padrão do cargo.'); },
    onError: (e: Error) => toast.error(e.message || 'Erro ao restaurar.'),
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const member = members.find(m => m.userId === selected) ?? null;
  const busy = save.isPending || reset.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ShieldCheck className="h-7 w-7" /> Permissões
        </h1>
        <p className="text-muted-foreground">
          Escolha a pessoa e marque o que ela pode ver e o que pode editar em cada tela do sistema.
          Quem só pode ver abre a tela, mas os botões de gravar ficam travados. Administradores têm acesso total e não aparecem aqui.
        </p>
      </div>

      {members.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Nenhum funcionário para configurar. Cadastre em Usuários.</CardContent></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardHeader className="pb-2"><CardTitle className="text-base">Funcionários</CardTitle></CardHeader>
            <CardContent className="space-y-1 p-2">
              {members.map(m => {
                const custom = (perms || []).some(p => p.user_id === m.userId);
                return (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => setSelected(m.userId)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      selected === m.userId ? 'bg-primary/10 text-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.email ?? `${m.userId.slice(0, 8)}…`}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.roles.map(r => ROLE_LABELS[r] ?? r).join(', ')}{custom ? ' · personalizado' : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {member && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate text-lg">{member.email ?? member.userId.slice(0, 8)}</CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap gap-1">
                    {member.roles.map(r => <Badge key={r} variant="secondary">{ROLE_LABELS[r] ?? r}</Badge>)}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-2" disabled={busy} onClick={() => reset.mutate(member)}>
                  <RotateCcw className="h-4 w-4" /> Voltar ao padrão do cargo
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {member.modules.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    O cargo {member.roles.map(r => ROLE_LABELS[r] ?? r).join(', ')} usa só a tela de operação dele
                    (mesas, cozinha, caixa ou entregas). Para dar acesso a outras telas, mude o cargo em Usuários.
                  </p>
                ) : moduleGroups.map(group => {
                  const mods = member.modules.filter(k => MODULES[k].group === group);
                  if (!mods.length) return null;
                  return (
                    <div key={group} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">{group}</h3>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy}
                            onClick={() => save.mutate({ member, modules: mods, access: { view: true, edit: true } })}>
                            <Pencil className="h-3 w-3" /> Liberar tudo
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy}
                            onClick={() => save.mutate({ member, modules: mods, access: { view: true, edit: false } })}>
                            <Eye className="h-3 w-3" /> Só ver
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy}
                            onClick={() => save.mutate({ member, modules: mods, access: { view: false, edit: false } })}>
                            <Lock className="h-3 w-3" /> Bloquear
                          </Button>
                        </div>
                      </div>
                      <div className="rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tela</TableHead>
                              <TableHead className="w-20 text-center">Ver</TableHead>
                              <TableHead className="w-20 text-center">Editar</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mods.map(mod => {
                              const access = accessOf(member, mod);
                              const custom = !!permMap[`${member.userId}:${mod}`];
                              const feature = MODULES[mod].feature;
                              const outOfPlan = !!feature && !hasFeature(feature);
                              return (
                                <TableRow key={mod} className={cn(outOfPlan && 'opacity-60')}>
                                  <TableCell>
                                    <span className="text-sm">{moduleLabels[mod]}</span>
                                    {outOfPlan
                                      ? <span className="ml-2 text-xs text-muted-foreground">(fora do plano)</span>
                                      : !custom && levelOf(access) !== 'none' && <span className="ml-2 text-xs text-muted-foreground">(padrão do cargo)</span>}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Checkbox
                                      aria-label={`Ver ${moduleLabels[mod]}`}
                                      checked={access.view}
                                      disabled={busy}
                                      onCheckedChange={c => save.mutate({ member, modules: [mod], access: { view: !!c, edit: !!c && access.edit } })}
                                    />
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Checkbox
                                      aria-label={`Editar ${moduleLabels[mod]}`}
                                      checked={access.edit}
                                      disabled={busy}
                                      onCheckedChange={c => save.mutate({ member, modules: [mod], access: { view: true, edit: !!c } })}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
