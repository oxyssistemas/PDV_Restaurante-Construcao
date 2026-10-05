import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Building2, Loader2, LogIn, MapPin, Network, Phone, Plus, Send, ShieldCheck, UserCog, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentStore } from '@/hooks/useCurrentStore';
import { edgeErrorMessage } from '@/lib/functionError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Person = { user_id: string; email: string };
type Store = {
  id: string; name: string; address: string | null; phone: string | null; status: string; parent_id: string | null;
  managers: Person[]; supervisors: Person[];
};
type Group = { limit: number; used: number; stores: Store[] };
type RoleKind = 'manager' | 'supervisor';

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('branches', { body });
  if (error) throw new Error(await edgeErrorMessage(error, 'Não foi possível concluir.'));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const ROLE_TEXT: Record<RoleKind, { one: string; hint: string }> = {
  manager: { one: 'Gerente', hint: 'Administra esta loja (cardápio, equipe, caixa, relatórios) e só ela.' },
  supervisor: { one: 'Supervisor', hint: 'Acompanha e administra as lojas a que for ligado. Para várias lojas, use o mesmo email em cada uma.' },
};

/** Filiais da rede (plano Enterprise): só o dono, na matriz. */
export default function BranchesPage() {
  const qc = useQueryClient();
  const { switchStore } = useAuth();
  const { store, canManageBranches } = useCurrentStore();
  const parentId = store?.id ?? null;
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<{ store: Store; role: RoleKind } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['branches', parentId],
    enabled: !!parentId && canManageBranches,
    queryFn: () => call<Group>({ action: 'list', parentId }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['branches'] });

  const unassign = async (s: Store, role: RoleKind, p: Person) => {
    if (!confirm(`Tirar ${p.email} do cargo de ${ROLE_TEXT[role].one.toLowerCase()} de ${s.name}?`)) return;
    try { await call({ action: 'unassign', restaurantId: s.id, userId: p.user_id, role }); toast.success('Pronto'); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); }
  };

  if (!canManageBranches) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-muted-foreground">
        <Network className="mx-auto mb-3 h-10 w-10" />
        <p>Filiais ficam disponíveis no plano Enterprise e são gerenciadas pelo dono, na matriz.</p>
      </div>
    );
  }

  const branches = data?.stores.filter(s => s.parent_id) ?? [];
  const matriz = data?.stores.find(s => !s.parent_id);
  const full = !!data && data.used >= data.limit;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Filiais</h1>
          <p className="text-muted-foreground">
            Cada filial tem cardápio, equipe, caixa e relatórios próprios. Você administra todas; gerentes e supervisores, só as deles.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && <Badge variant="outline">{data.used} de {data.limit} filiais</Badge>}
          <Button variant="outline" onClick={() => setSyncing(true)} disabled={!data || !data.used} className="gap-2"><Send className="h-4 w-4" /> Enviar cardápio</Button>
          <Button onClick={() => setCreating(true)} disabled={!data || full} className="gap-2"><Plus className="h-4 w-4" /> Nova filial</Button>
        </div>
      </div>
      {data && full && (
        <p className="text-sm text-amber-500">
          {data.limit ? 'Limite de filiais do plano atingido.' : 'Filiais ainda não liberadas para esta loja.'} Fale com a Oxys para aumentar.
        </p>
      )}

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {[...(matriz ? [matriz] : []), ...branches].map(s => (
          <Card key={s.id} className="border-0 shadow-md">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5 shrink-0 text-primary" /> <span className="truncate">{s.name}</span>
                </CardTitle>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {s.address && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.address}</p>}
                  {s.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {s.phone}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Badge variant={s.parent_id ? 'secondary' : 'default'}>{s.parent_id ? 'Filial' : 'Matriz'}</Badge>
                {s.status !== 'active' && <Badge variant="destructive">Bloqueada</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(['manager', 'supervisor'] as RoleKind[]).map(role => {
                const list = role === 'manager' ? s.managers : s.supervisors;
                return (
                  <div key={role}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {role === 'manager' ? <UserCog className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                        {role === 'manager' ? 'Gerentes' : 'Supervisores'}
                      </p>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setAssigning({ store: s, role })}>
                        <Plus className="h-3 w-3" /> Adicionar
                      </Button>
                    </div>
                    {list.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {list.map(p => (
                          <span key={p.user_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                            {p.email}
                            <button type="button" onClick={() => unassign(s, role, p)} className="text-muted-foreground hover:text-destructive" aria-label="Remover">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : <p className="text-xs text-muted-foreground">Ninguém ainda.</p>}
                  </div>
                );
              })}
              {s.id !== store?.id && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => switchStore(s.id).catch(e => toast.error(e.message))}>
                  <LogIn className="h-4 w-4" /> Abrir esta filial
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {data && !branches.length && <p className="text-center text-sm text-muted-foreground">Nenhuma filial ainda. Clique em "Nova filial".</p>}

      <NewBranchDialog open={creating} onOpenChange={setCreating} parentId={parentId} onDone={refresh} />
      <AssignDialog target={assigning} onClose={() => setAssigning(null)} onDone={refresh} />
      <SyncMenuDialog open={syncing} onOpenChange={setSyncing} parentId={parentId} branches={branches} />
    </div>
  );
}

function NewBranchDialog({ open, onOpenChange, parentId, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; parentId: string | null; onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [copyMenu, setCopyMenu] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await call<{ branch: { name: string }; copiedItems: number }>({ action: 'create', parentId, name, address, phone, copyMenu });
      toast.success(`Filial ${r.branch.name} criada${r.copiedItems ? ` com ${r.copiedItems} itens do cardápio` : ''}`);
      setName(''); setAddress(''); setPhone(''); setCopyMenu(true);
      onOpenChange(false);
      onDone();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nova filial</DialogTitle>
            <DialogDescription>A filial tem cardápio, equipe, caixa e relatórios próprios. Você já entra como admin dela.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><Label>Nome *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Oxys Centro" required /></div>
          <div className="space-y-2"><Label>Endereço</Label><Input value={address} onChange={e => setAddress(e.target.value)} /></div>
          <div className="space-y-2"><Label>Telefone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <Checkbox checked={copyMenu} onCheckedChange={v => setCopyMenu(v === true)} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium">Começar com uma cópia do cardápio da matriz</span>
              <span className="block text-xs text-muted-foreground">Depois a filial muda o cardápio dela sem afetar a matriz.</span>
            </span>
          </label>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Criar filial</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ target, onClose, onDone }: {
  target: { store: Store; role: RoleKind } | null; onClose: () => void; onDone: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const role = target?.role ?? 'manager';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    try {
      const r = await call<{ created: boolean }>({ action: 'assign', restaurantId: target.store.id, role, email, password: password || undefined });
      toast.success(r.created ? `Acesso criado: ${email}` : `${email} ligado a ${target.store.name}`);
      setEmail(''); setPassword('');
      onClose();
      onDone();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{ROLE_TEXT[role].one} — {target?.store.name}</DialogTitle>
            <DialogDescription>{ROLE_TEXT[role].hint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="space-y-2">
            <Label>Senha (só se for um acesso novo)</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} placeholder="mínimo 8 caracteres" />
            <p className="text-xs text-muted-foreground">Se a pessoa já tem acesso em outra loja da rede (ex.: supervisor de outra filial), deixe em branco.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !email} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Envia o cardápio da matriz para as filiais escolhidas (cada filial continua podendo ter o seu). */
function SyncMenuDialog({ open, onOpenChange, parentId, branches }: {
  open: boolean; onOpenChange: (o: boolean) => void; parentId: string | null; branches: Store[];
}) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const [opt, setOpt] = useState({ newItems: true, details: true, prices: false, availability: false });
  const [busy, setBusy] = useState(false);
  const chosen = selected ?? branches.map(b => b.id);
  const toggle = (id: string) => setSelected(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]);
  const OPTIONS: { key: keyof typeof opt; label: string; hint: string }[] = [
    { key: 'newItems', label: 'Itens novos da matriz', hint: 'Adiciona nas filiais os itens e categorias que ainda não existem lá.' },
    { key: 'details', label: 'Nomes, descrições, fotos, categorias e dados fiscais', hint: 'Atualiza os itens que vieram da matriz.' },
    { key: 'prices', label: 'Preços', hint: 'Substitui o preço das filiais pelo da matriz.' },
    { key: 'availability', label: 'Disponibilidade', hint: 'Ativa/pausa nas filiais igual à matriz.' },
  ];

  const submit = async () => {
    setBusy(true);
    try {
      const r = await call<{ branches: { name: string; created: number; updated: number }[] }>({ action: 'sync_menu', parentId, branchIds: chosen, options: opt });
      toast.success(r.branches.map(b => `${b.name}: ${b.created} novo(s), ${b.updated} atualizado(s)`).join(' · '));
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Enviar cardápio da matriz</DialogTitle>
          <DialogDescription>
            As filiais continuam com o cardápio delas; isto copia da matriz só o que você marcar. Itens criados só na filial não são mexidos,
            e a ficha técnica (estoque) e o iFood de cada filial ficam como estão.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm font-medium">Para quais filiais</p>
          {branches.map(b => (
            <label key={b.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={chosen.includes(b.id)} onCheckedChange={() => toggle(b.id)} /> {b.name}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">O que enviar</p>
          {OPTIONS.map(o => (
            <label key={o.key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Checkbox checked={opt[o.key]} onCheckedChange={v => setOpt({ ...opt, [o.key]: v === true })} className="mt-0.5" />
              <span className="text-sm"><span className="font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{o.hint}</span></span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !chosen.length || !Object.values(opt).some(Boolean)} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
