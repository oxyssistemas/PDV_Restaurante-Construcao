// Estado da loja na central offline: cópia do que veio da nuvem + operações feitas sem internet.
// As regras aqui espelham apply_offline_ops (banco), para a loja ver o mesmo resultado antes e depois de sincronizar.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const OP_TYPES = new Set(['order.open', 'items.add', 'item.status', 'order.update', 'payment.add', 'order.settle', 'table.status']);
const ITEM_STATUS = new Set(['pending', 'preparing', 'ready', 'delivered', 'cancelled']);
const METHODS = new Set(['cash', 'credit_card', 'debit_card', 'pix']);

function emptyData() {
  return { snapshot: null, snapshotAt: null, orders: {}, ops: [], printQueue: [], version: 0, lastSyncAt: null, lastError: null };
}

class HubState {
  constructor(dir) {
    this.file = path.join(dir, 'oxys-central.json');
    this.data = emptyData();
    try { this.data = { ...emptyData(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { /* primeira vez */ }
    this.listeners = new Set();
    this.saveTimer = null;
  }

  // Grava em arquivo temporário e troca (não corrompe se o computador desligar no meio).
  save(now = false) {
    const write = () => {
      this.saveTimer = null;
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    };
    if (now) { if (this.saveTimer) clearTimeout(this.saveTimer); write(); return; }
    if (!this.saveTimer) this.saveTimer = setTimeout(write, 300);
  }

  changed() {
    this.data.version += 1;
    this.save();
    for (const fn of this.listeners) { try { fn(this.data.version); } catch { /* ignora */ } }
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // ---------- nuvem → central ----------
  applySnapshot(snapshot) {
    this.data.snapshot = snapshot;
    this.data.snapshotAt = new Date().toISOString();
    // Só substitui os pedidos quando não há nada pendente de envio (senão perderia o que foi feito offline).
    if (!this.data.ops.some(op => (op.attempts || 0) < 5)) {
      this.data.orders = Object.fromEntries((snapshot.orders || []).map(o => [o.id, { ...o, items: o.items || [], payments: o.payments || [] }]));
    }
    this.changed();
  }

  // ---------- leitura para os aparelhos ----------
  menuItem(id) { return (this.data.snapshot?.items || []).find(i => i.id === id); }
  table(id) { return (this.data.snapshot?.tables || []).find(t => t.id === id); }
  orderTotal(o) { return round2(o.items.filter(i => i.status !== 'cancelled').reduce((s, i) => s + i.quantity * i.unit_price, 0) + Number(o.delivery_fee || 0)); }
  orderPaid(o) { return round2(o.payments.reduce((s, p) => s + Number(p.amount), 0)); }
  isOpen(o) { return o.status !== 'cancelled' && (o.status !== 'delivered' || this.orderPaid(o) + 0.009 < this.orderTotal(o)); }

  view() {
    const s = this.data.snapshot || {};
    const orders = Object.values(this.data.orders).filter(o => this.isOpen(o))
      .map(o => ({ ...o, total: this.orderTotal(o), paid: this.orderPaid(o) }))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return {
      restaurant: s.restaurant || null, categories: s.categories || [], items: s.items || [], tables: s.tables || [],
      printers: s.printers || [], fiscalAutoEmit: !!s.fiscal_auto_emit, orders,
      version: this.data.version, snapshotAt: this.data.snapshotAt, lastSyncAt: this.data.lastSyncAt,
      pendingOps: this.data.ops.length, failedOps: this.data.ops.filter(o => o.error).length,
    };
  }

  // ---------- operações feitas na loja ----------
  /** Valida e aplica uma operação vinda de um aparelho; entra na fila para a nuvem. */
  apply(type, data, who) {
    if (!OP_TYPES.has(type)) throw new Error('Operação inválida');
    const op = { id: crypto.randomUUID(), type, at: new Date().toISOString(), user_id: who?.user_id || null, data: { ...data } };
    const d = op.data;
    const orders = this.data.orders;
    const getOrder = (id) => { const o = orders[id]; if (!o) throw new Error('Pedido não encontrado'); return o; };

    switch (type) {
      case 'order.open': {
        d.id = crypto.randomUUID(); // sempre gerado aqui (o aparelho recebe na resposta)
        if (d.table_id && !this.table(d.table_id)) throw new Error('Mesa não encontrada');
        d.order_type = ['dine_in', 'takeaway', 'delivery'].includes(d.order_type) ? d.order_type : 'dine_in';
        d.created_by_name = who?.name || 'Modo offline';
        d.created_by_role = who?.role || null;
        orders[d.id] = {
          id: d.id, table_id: d.table_id || null, order_type: d.order_type, status: 'pending',
          customer_name: d.customer_name || null, customer_phone: d.customer_phone || null, customer_address: d.customer_address || null,
          delivery_fee: 0, notes: d.notes || null, created_at: op.at, created_by_name: d.created_by_name, created_by_role: d.created_by_role,
          source: 'offline', items: [], payments: [],
        };
        if (d.table_id) { const t = this.table(d.table_id); if (t.status === 'free') t.status = 'occupied'; }
        break;
      }
      case 'items.add': {
        const o = getOrder(d.order_id);
        if (!Array.isArray(d.items) || !d.items.length) throw new Error('Nenhum item');
        d.items = d.items.slice(0, 50).map(i => {
          const m = this.menuItem(i.menu_item_id);
          if (!m) throw new Error('Item fora do cardápio');
          return { id: crypto.randomUUID(), menu_item_id: m.id, quantity: Math.min(50, Math.max(1, Number(i.quantity) || 1)), unit_price: Number(m.price), notes: (i.notes || '').slice(0, 300) || null };
        });
        for (const i of d.items) o.items.push({ ...i, name: this.menuItem(i.menu_item_id).name, status: 'pending', created_at: op.at });
        if (o.status === 'delivered') o.status = 'pending';
        this.queuePrint('kitchen', o.id, d.items.map(i => i.id));
        break;
      }
      case 'item.status': {
        if (!ITEM_STATUS.has(d.status)) throw new Error('Status inválido');
        const o = Object.values(orders).find(x => x.items.some(i => i.id === d.item_id));
        if (!o) throw new Error('Item não encontrado');
        o.items.find(i => i.id === d.item_id).status = d.status;
        break;
      }
      case 'order.update': {
        const o = getOrder(d.order_id);
        if ('customer_name' in d) o.customer_name = d.customer_name || null;
        if ('table_id' in d) { if (d.table_id && !this.table(d.table_id)) throw new Error('Mesa não encontrada'); o.table_id = d.table_id || null; }
        break;
      }
      case 'payment.add': {
        const o = getOrder(d.order_id);
        if (!METHODS.has(d.method)) throw new Error('Forma de pagamento inválida');
        d.id = crypto.randomUUID();
        d.amount = round2(d.amount);
        d.change_amount = round2(d.change_amount || 0);
        if (d.amount <= 0) throw new Error('Valor inválido');
        if (d.amount - (this.orderTotal(o) - this.orderPaid(o)) > 0.009) throw new Error('Valor maior que o saldo');
        o.payments.push({ id: d.id, method: d.method, amount: d.amount, change_amount: d.change_amount, created_at: op.at });
        break;
      }
      case 'order.settle': {
        const o = getOrder(d.order_id);
        o.status = 'delivered';
        this.queuePrint('receipt', o.id, null);
        break;
      }
      case 'table.status': {
        const t = this.table(d.table_id);
        if (!t) throw new Error('Mesa não encontrada');
        if (!['free', 'occupied', 'reserved'].includes(d.status)) throw new Error('Status inválido');
        t.status = d.status;
        break;
      }
    }
    this.data.ops.push(op);
    this.changed();
    return op;
  }

  // ---------- impressão na loja ----------
  queuePrint(kind, orderId, itemIds) {
    this.data.printQueue.push({ id: crypto.randomUUID(), kind, order_id: orderId, item_ids: itemIds, created_at: new Date().toISOString(), done: false });
    this.data.printQueue = this.data.printQueue.filter(j => !j.done || Date.now() - Date.parse(j.created_at) < 24 * 3600e3).slice(-500);
  }
  pendingPrints() {
    return this.data.printQueue.filter(j => !j.done).map(j => {
      const o = this.data.orders[j.order_id];
      if (!o) return null;
      const items = j.item_ids ? o.items.filter(i => j.item_ids.includes(i.id)) : o.items.filter(i => i.status !== 'cancelled');
      return { ...j, order: { ...o, total: this.orderTotal(o), paid: this.orderPaid(o) }, items, table: o.table_id ? this.table(o.table_id) : null };
    }).filter(Boolean);
  }
  markPrinted(id, error) {
    const j = this.data.printQueue.find(x => x.id === id);
    if (!j) return;
    if (error) { j.error = String(error).slice(0, 200); j.attempts = (j.attempts || 0) + 1; if (j.attempts >= 3) j.done = true; }
    else j.done = true;
    this.changed();
  }

  // ---------- central → nuvem ----------
  /** Resultado do envio: tira da fila o que foi aplicado; erros ficam marcados (tenta de novo até 5 vezes). */
  afterPush(result) {
    const applied = new Set(result.applied || []);
    const failed = new Map((result.failed || []).map(f => [f.id, f.error]));
    this.data.ops = this.data.ops.filter(op => !applied.has(op.id)).map(op => {
      if (!failed.has(op.id)) return op;
      return { ...op, error: failed.get(op.id), attempts: (op.attempts || 0) + 1 };
    });
    this.data.lastSyncAt = new Date().toISOString();
    this.changed();
  }
  opsToSend() { return this.data.ops.filter(op => (op.attempts || 0) < 5).slice(0, 200); }
}

module.exports = { HubState, round2 };
