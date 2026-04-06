import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function SuperAdminDashboard() {
  const { data: restaurants, isLoading } = useQuery({
    queryKey: ['super-admin-restaurants-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('id, status');
      if (error) throw error;
      return data;
    },
  });

  const total = restaurants?.length ?? 0;
  const active = restaurants?.filter(r => r.status === 'active').length ?? 0;
  const blocked = restaurants?.filter(r => r.status === 'blocked').length ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = [
    { label: 'Total de Restaurantes', value: total, icon: Store, color: 'text-primary' },
    { label: 'Ativos', value: active, icon: CheckCircle, color: 'text-accent' },
    { label: 'Bloqueados', value: blocked, icon: XCircle, color: 'text-destructive' },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(s => (
          <Card key={s.label} className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={cn('h-5 w-5', s.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
