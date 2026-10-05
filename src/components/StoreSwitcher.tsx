import { useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

/**
 * Troca de loja para quem trabalha em mais de uma (dono: matriz e filiais; supervisor: as filiais dele).
 * Só aparece quando há mais de uma loja.
 */
export default function StoreSwitcher() {
  const { stores, currentRole, switchStore } = useAuth();
  const [busy, setBusy] = useState(false);
  if (stores.length < 2) return null;

  const change = async (id: string) => {
    if (id === currentRole?.restaurant_id) return;
    setBusy(true);
    try { await switchStore(id); } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível trocar de loja');
      setBusy(false);
    }
  };

  return (
    <div className="px-3 pt-3">
      <Select value={currentRole?.restaurant_id ?? undefined} onValueChange={change} disabled={busy}>
        <SelectTrigger className="h-10 w-full gap-2 bg-sidebar-accent/40 text-left">
          {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Building2 className="h-4 w-4 shrink-0 text-primary" />}
          <SelectValue placeholder="Escolha a loja" />
        </SelectTrigger>
        <SelectContent>
          {stores.map(s => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}{s.parent_id ? '' : ' · matriz'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
