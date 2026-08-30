import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Pencil, Trash2, Search, Users, CalendarClock, Wallet, Download, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import { brl, downloadCsv } from '@/lib/finance';
import {
  contractLabels, monthKey, monthLabel, negativePayrollTypes, payrollStatusLabels,
  payrollTypeLabels, sectorLabels, shiftHours,
} from '@/lib/hr';
import ModuleGate from '@/components/ModuleGate';

interface EmployeeForm {
  id?: string; name: string; document: string; role_title: string; sector: string;
  contract_type: string; base_salary: string; pix_key: string; phone: string;
  email: string; birthdate: string; hired_at: string; terminated_at: string;
  active: boolean; notes: string;
}
const emptyEmployee: EmployeeForm = {
  name: '', document: '', role_title: '', sector: 'salao', contract_type: 'clt',
  base_salary: '', pix_key: '', phone: '', email: '', birthdate: '', hired_at: '',
  terminated_at: '', active: true, notes: '',
};

export default function HrPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const role = currentRole?.role;

  if (!restaurantId) {
    return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  }

  return (
    <ModuleGate module="hr">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recursos Humanos</h1>
          <p className="text-muted-foreground">Funcionários, escalas e folha de pagamento.</p>
        </div>
        <Tabs defaultValue="employees">
          <TabsList className="flex-wrap">
            <TabsTrigger value="employees" className="gap-2"><Users className="h-4 w-4" /> Funcionários</TabsTrigger>
            <TabsTrigger value="shifts" className="gap-2"><CalendarClock className="h-4 w-4" /> Escalas</TabsTrigger>
            <TabsTrigger value="payroll" className="gap-2"><Wallet className="h-4 w-4" /> Folha</TabsTrigger>
          </TabsList>
          <TabsContent value="employees" className="mt-4">
            <EmployeesTab restaurantId={restaurantId} role={role} />
          </TabsContent>
          <TabsContent value="shifts" className="mt-4">
            <ShiftsTab restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="payroll" className="mt-4">
            <PayrollTab restaurantId={restaurantId} role={role} />
          </TabsContent>
        </Tabs>
      </div>
    </ModuleGate>
  );
}

/* ---------------- Funcionários ---------------- */

function useEmployees(restaurantId: string) {
  return useQuery({
    queryKey: ['hr-employees', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees').select('*').eq('restaurant_id', restaurantId).order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

function EmployeesTab({ restaurantId, role }: { restaurantId: string; role?: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployee);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const { data: employees, isLoading } = useEmployees(restaurantId);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Informe o nome do funcionário');
      const payload = {
        restaurant_id: restaurantId,
        name: form.name.trim(),
        document: form.document.trim() || null,
        role_title: form.role_title.trim() || null,
        sector: form.sector,
        contract_type: form.contract_type,
        base_salary: Number(form.base_salary) || 0,
        pix_key: form.pix_key.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        birthdate: form.birthdate || null,
        hired_at: form.hired_at || null,
        terminated_at: form.terminated_at || null,
        active: form.active,
        notes: form.notes.trim() || null,
      };
      if (form.id) {
        const before = (employees || []).find(e => e.id === form.id);
        const { error } = await supabase.from('employees').update(payload).eq('id', form.id);
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'update', entity: 'employee', entityId: form.id, summary: `Funcionário "${payload.name}" atualizado`, before, after: payload });
      } else {
        const { data, error } = await supabase.from('employees').insert(payload).select('id').single();
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'create', entity: 'employee', entityId: data?.id, summary: `Funcionário "${payload.name}" cadastrado`, after: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      setOpen(false); setForm(emptyEmployee);
      toast.success('Funcionário salvo');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const before = (employees || []).find(e => e.id === id);
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ restaurantId, role, action: 'delete', entity: 'employee', entityId: id, summary: `Funcionário "${before?.name ?? id}" excluído`, before });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      setDeleteId(null);
      toast.success('Funcionário excluído');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (employees || []).filter(e =>
    !q || [e.name, e.role_title, e.document, sectorLabels[e.sector]].some(v => (v || '').toLowerCase().includes(q.toLowerCase()))
  );

  const edit = (e: (typeof list)[number]) => {
    setForm({
      id: e.id, name: e.name, document: e.document || '', role_title: e.role_title || '',
      sector: e.sector, contract_type: e.contract_type, base_salary: String(e.base_salary ?? ''),
      pix_key: e.pix_key || '', phone: e.phone || '', email: e.email || '',
      birthdate: e.birthdate || '', hired_at: e.hired_at || '', terminated_at: e.terminated_at || '',
      active: e.active, notes: e.notes || '',
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar funcionário..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button className="gap-2" onClick={() => { setForm(emptyEmployee); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Novo funcionário
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhum funcionário cadastrado.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map(e => (
            <Card key={e.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{e.name}</p>
                    <p className="text-sm text-muted-foreground">{e.role_title || sectorLabels[e.sector]}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => edit(e)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(e.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{sectorLabels[e.sector] ?? e.sector}</Badge>
                  <Badge variant="outline">{contractLabels[e.contract_type] ?? e.contract_type}</Badge>
                  {!e.active && <Badge variant="destructive">Inativo</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">Salário base: {brl(Number(e.base_salary))}</p>
                {e.phone && <p className="text-sm text-muted-foreground">{e.phone}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Editar funcionário' : 'Novo funcionário'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2"><Label>CPF</Label><Input value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={form.role_title} onChange={e => setForm({ ...form, role_title: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Setor</Label>
              <Select value={form.sector} onValueChange={v => setForm({ ...form, sector: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(sectorLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de contrato</Label>
              <Select value={form.contract_type} onValueChange={v => setForm({ ...form, contract_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(contractLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Salário base (R$)</Label><Input type="number" step="0.01" value={form.base_salary} onChange={e => setForm({ ...form, base_salary: e.target.value })} /></div>
            <div className="space-y-2"><Label>Chave PIX</Label><Input value={form.pix_key} onChange={e => setForm({ ...form, pix_key: e.target.value })} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Nascimento</Label><Input type="date" value={form.birthdate} onChange={e => setForm({ ...form, birthdate: e.target.value })} /></div>
            <div className="space-y-2"><Label>Admissão</Label><Input type="date" value={form.hired_at} onChange={e => setForm({ ...form, hired_at: e.target.value })} /></div>
            <div className="space-y-2"><Label>Desligamento</Label><Input type="date" value={form.terminated_at} onChange={e => setForm({ ...form, terminated_at: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Situação</Label>
              <Select value={form.active ? 'ativo' : 'inativo'} onValueChange={v => setForm({ ...form, active: v === 'ativo' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
            <AlertDialogDescription>As escalas e lançamentos de folha dele também serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && remove.mutate(deleteId)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- Escalas ---------------- */

function ShiftsTab({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data: employees } = useEmployees(restaurantId);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', shift_date: today, start_time: '18:00', end_time: '23:00', break_minutes: '0', notes: '' });

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['hr-shifts', restaurantId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_shifts').select('*')
        .eq('restaurant_id', restaurantId)
        .gte('shift_date', from).lte('shift_date', to)
        .order('shift_date').order('start_time');
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.employee_id) throw new Error('Selecione o funcionário');
      const { error } = await supabase.from('employee_shifts').insert({
        restaurant_id: restaurantId,
        employee_id: form.employee_id,
        shift_date: form.shift_date,
        start_time: form.start_time,
        end_time: form.end_time,
        break_minutes: Number(form.break_minutes) || 0,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-shifts'] }); setOpen(false); toast.success('Turno registrado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employee_shifts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-shifts'] }); toast.success('Turno removido'); },
  });

  const nameOf = (id: string) => employees?.find(e => e.id === id)?.name ?? '—';
  const totalHours = (shifts || []).reduce((s, x) => s + shiftHours(x.start_time, x.end_time, x.break_minutes), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="ml-auto flex gap-2">
          <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo turno</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Total de horas no período</p>
          <p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (shifts || []).length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhum turno no período.</p>
      ) : (
        <div className="space-y-2">
          {shifts!.map(s => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[160px] flex-1">
                  <p className="font-medium">{nameOf(s.employee_id)}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(s.shift_date + 'T00:00:00').toLocaleDateString('pt-BR')} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    {s.break_minutes ? ` · intervalo ${s.break_minutes}min` : ''}
                  </p>
                </div>
                <Badge variant="secondary">{shiftHours(s.start_time, s.end_time, s.break_minutes).toFixed(1)}h</Badge>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo turno</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Funcionário</Label>
              <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{(employees || []).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Data</Label><Input type="date" value={form.shift_date} onChange={e => setForm({ ...form, shift_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Intervalo (min)</Label><Input type="number" value={form.break_minutes} onChange={e => setForm({ ...form, break_minutes: e.target.value })} /></div>
              <div className="space-y-2"><Label>Entrada</Label><Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
              <div className="space-y-2"><Label>Saída</Label><Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Observações</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Folha ---------------- */

function PayrollTab({ restaurantId, role }: { restaurantId: string; role?: string | null }) {
  const qc = useQueryClient();
  const { data: employees } = useEmployees(restaurantId);
  const [month, setMonth] = useState(monthKey(new Date()).slice(0, 7));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', type: 'salary', amount: '', notes: '' });
  const reference = `${month}-01`;

  const { data: entries, isLoading } = useQuery({
    queryKey: ['hr-payroll', restaurantId, reference],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_entries').select('*')
        .eq('restaurant_id', restaurantId).eq('reference_month', reference)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.employee_id) throw new Error('Selecione o funcionário');
      const amount = Number(form.amount);
      if (!amount) throw new Error('Informe o valor');
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('payroll_entries').insert({
        restaurant_id: restaurantId,
        employee_id: form.employee_id,
        type: form.type,
        reference_month: reference,
        amount,
        notes: form.notes.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      await logAudit({
        restaurantId, role, action: 'create', entity: 'payroll',
        summary: `Lançamento de folha (${payrollTypeLabels[form.type]}) de ${brl(amount)} em ${monthLabel(reference)}`,
        after: { employee_id: form.employee_id, type: form.type, amount },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-payroll'] });
      setOpen(false); setForm({ employee_id: '', type: 'salary', amount: '', notes: '' });
      toast.success('Lançamento registrado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payroll_entries')
        .update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-payroll'] }); toast.success('Lançamento pago'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payroll_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-payroll'] }); toast.success('Lançamento excluído'); },
  });

  const nameOf = (id: string) => employees?.find(e => e.id === id)?.name ?? '—';

  const totals = useMemo(() => {
    let total = 0, pending = 0;
    for (const e of entries || []) {
      const v = Number(e.amount) * (negativePayrollTypes.includes(e.type) ? -1 : 1);
      if (e.status !== 'cancelled') total += v;
      if (e.status === 'pending') pending += v;
    }
    return { total, pending };
  }, [entries]);

  const exportCsv = () => {
    const rows: (string | number)[][] = [['Funcionário', 'Tipo', 'Valor', 'Status', 'Observação']];
    for (const e of entries || []) {
      rows.push([nameOf(e.employee_id), payrollTypeLabels[e.type] ?? e.type, Number(e.amount).toFixed(2), payrollStatusLabels[e.status] ?? e.status, e.notes || '']);
    }
    downloadCsv(`folha-${month}.csv`, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">Mês de referência</Label><Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="gap-2" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
          <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo lançamento</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total da folha</p><p className="text-2xl font-bold">{brl(totals.total)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Em aberto</p><p className="text-2xl font-bold text-destructive">{brl(totals.pending)}</p></CardContent></Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (entries || []).length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhum lançamento em {monthLabel(reference)}.</p>
      ) : (
        <div className="space-y-2">
          {entries!.map(e => (
            <Card key={e.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[160px] flex-1">
                  <p className="font-medium">{nameOf(e.employee_id)}</p>
                  <p className="text-sm text-muted-foreground">{payrollTypeLabels[e.type] ?? e.type}{e.notes ? ` · ${e.notes}` : ''}</p>
                </div>
                <span className={negativePayrollTypes.includes(e.type) ? 'font-semibold text-destructive' : 'font-semibold'}>
                  {negativePayrollTypes.includes(e.type) ? '- ' : ''}{brl(Number(e.amount))}
                </span>
                <Badge variant={e.status === 'paid' ? 'secondary' : 'outline'}>{payrollStatusLabels[e.status] ?? e.status}</Badge>
                {e.status === 'pending' && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => pay.mutate(e.id)}>
                    <CheckCircle2 className="h-4 w-4" /> Pagar
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(e.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo lançamento — {monthLabel(reference)}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Funcionário</Label>
              <Select value={form.employee_id} onValueChange={v => {
                const emp = employees?.find(x => x.id === v);
                setForm(f => ({ ...f, employee_id: v, amount: f.amount || (emp && f.type === 'salary' ? String(emp.base_salary) : f.amount) }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{(employees || []).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(payrollTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-2"><Label>Observação</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
