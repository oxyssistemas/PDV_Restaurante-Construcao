import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ModuleKey, moduleKeys, moduleLabels, defaultModuleAccess } from '@/lib/modules';
import { logAudit } from '@/lib/audit';

const roleLabels: Record<string, string> = {
  admin: 'Admin', waiter: 'Garçom', kitchen: 'Cozinha', cashier: 'Caixa',
  finance: 'Financeiro', delivery: 'Delivery', courier: 'Entregador',
  hr: 'RH', marketing: 'Marketing',
};

interface PermRow { module: string; can_view: boolean; can_edit: boolean; user_id: string }

export default function PermissionsPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
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

  const permMap = useMemo(() => {
    const map: Record<string, { view: boolean; edit: boolean }> = {};
    (perms || []).forEach(p => { map[`${p.user_id}:${p.module}`] = { view: p.can_view, edit: p.can_edit }; });
    return map;
  }, [perms]);

  const save = useMutation({
    mutationFn: async (input: { userId: string; module: ModuleKey; view: boolean; edit: boolean }) => {
      const { error } = await supabase.from('module_permissions').upsert({
        restaurant_id: restaurantId!,
        user_id: input.userId,
        module: input.module,
        can_view: input.view || input.edit,
        can_edit: input.edit,
      }, { onConflict: 'restaurant_id,user_id,module' });
      if (error) throw error;
      await logAudit({
        restaurantId: restaurantId!,
        action: 'update',
        entity: 'module_permission',
        entityId: input.userId,
        summary: `Permissão de ${moduleLabels[input.module]}: ver=${input.view || input.edit ? 'sim' : 'não'}, editar=${input.edit ? 'sim' : 'não'}`,
        role: currentRole?.role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perm-rows'] });
      queryClient.invalidateQueries({ queryKey: ['module-permissions'] });
      toast.success('Permissão atualizada.');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar permissão.'),
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const rows = (members || []).filter(m => m.role !== 'admin' && m.role !== 'super_admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ShieldCheck className="h-7 w-7" /> Permissões por módulo
        </h1>
        <p className="text-muted-foreground">
          Defina quem pode ver e quem pode editar cada módulo. Administradores têm acesso total e não aparecem na lista.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Nenhum usuário para configurar.</CardContent></Card>
      ) : rows.map(member => (
        <Card key={member.user_id + member.role}>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base font-medium">
              <span className="font-mono text-xs text-muted-foreground">{member.user_id.slice(0, 8)}…</span>
            </CardTitle>
            <Badge variant="secondary">{roleLabels[member.role] ?? member.role}</Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Módulo</TableHead>
                  <TableHead className="w-24 text-center">Ver</TableHead>
                  <TableHead className="w-24 text-center">Editar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moduleKeys.map(m => {
                  const override = permMap[`${member.user_id}:${m}`];
                  const fallback = defaultModuleAccess([member.role], m);
                  const view = override ? override.view || override.edit : fallback.view;
                  const edit = override ? override.edit : fallback.edit;
                  return (
                    <TableRow key={m}>
                      <TableCell>
                        {moduleLabels[m]}
                        {!override && (view || edit) && (
                          <span className="ml-2 text-xs text-muted-foreground">(padrão do cargo)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={view}
                          onCheckedChange={c => save.mutate({ userId: member.user_id, module: m, view: !!c, edit: !!c && edit })}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={edit}
                          onCheckedChange={c => save.mutate({ userId: member.user_id, module: m, view: true, edit: !!c })}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
