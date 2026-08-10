import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, History, Search } from 'lucide-react';
import { auditActionLabel, entityLabels } from '@/lib/audit';
import { downloadCsv } from '@/lib/finance';
import { roleLabels } from '@/lib/orders';

interface Props { restaurantId: string }

export default function AuditLogPanel({ restaurantId }: Props) {
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('all');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs').select('*').eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const entities = Array.from(new Set((logs || []).map(l => l.entity)));

  const list = (logs || []).filter(l => {
    if (entity !== 'all' && l.entity !== entity) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    return [l.summary, l.user_email, l.entity, l.action].some(v => (v || '').toLowerCase().includes(t));
  });

  const exportCsv = () => downloadCsv('log-alteracoes.csv', [
    ['Data', 'Usuário', 'Função', 'Ação', 'Registro', 'Detalhe'],
    ...list.map(l => [
      new Date(l.created_at).toLocaleString('pt-BR'),
      l.user_email || '',
      l.user_role ? (roleLabels[l.user_role] || l.user_role) : '',
      auditActionLabel(l.action),
      entityLabels[l.entity] || l.entity,
      l.summary || '',
    ]),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por usuário ou alteração..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os registros</SelectItem>
            {entities.map(e => <SelectItem key={e} value={e}>{entityLabels[e] || e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv}>Exportar CSV</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhuma alteração registrada ainda.</p>
      ) : (
        <div className="space-y-2">
          {list.map(l => (
            <Card key={l.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <History className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-[220px] flex-1">
                  <div className="text-sm font-medium">{l.summary || `${auditActionLabel(l.action)} ${entityLabels[l.entity] || l.entity}`}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.user_email || 'Usuário desconhecido'}
                    {l.user_role ? ` · ${roleLabels[l.user_role] || l.user_role}` : ''}
                    {' · '}{new Date(l.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
                <Badge variant="outline">{entityLabels[l.entity] || l.entity}</Badge>
                <Badge variant="secondary">{auditActionLabel(l.action)}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
