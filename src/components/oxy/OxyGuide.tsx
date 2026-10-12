import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BellOff, BookOpen, Download, GraduationCap, HelpCircle, Loader2, PlayCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useTrial } from '@/hooks/useTrial';
import { isAdminLike } from '@/lib/roles';
import {
  PORTALS, WELCOME_ADMIN, WELCOME_STAFF, portalForPath, tourForPath,
  type OxyStep, type OxyTour, type PortalKey,
} from '@/lib/oxyTours';
import { downloadGeneralTraining, downloadPortalTraining } from '@/lib/oxyTraining';
import OxyBot from './OxyBot';

type Active = { tour: OxyTour; steps: OxyStep[]; index: number; spotlight: boolean };

const targetEl = (name?: string) => (name ? document.querySelector<HTMLElement>(`[data-tour="${name}"]`) : null);
const visible = (el: HTMLElement | null) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/**
 * Oxy, o robô auxiliar: passeio de boas-vindas no primeiro login, dicas na primeira vez em cada tela,
 * botão no canto para chamar de novo e treinamentos em PDF.
 */
export default function OxyGuide() {
  const { user, currentRole, isSuperAdmin } = useAuth();
  const { pathname } = useLocation();
  const { trial } = useTrial();
  const onboarding = useOnboarding();
  const [active, setActive] = useState<Active | null>(null);
  const [trainingsOpen, setTrainingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const portal = portalForPath(pathname);
  const expired = !!trial && (trial.expired || new Date(trial.trial_ends_at).getTime() <= Date.now());
  const enabled = !!user && !isSuperAdmin && !!portal && !expired;
  const ownerLike = isAdminLike(currentRole?.role);
  const welcome = ownerLike ? WELCOME_ADMIN : WELCOME_STAFF;

  const start = useCallback((tour: OxyTour, spotlight: boolean) => {
    const steps = tour.steps.filter(s => !s.target || visible(targetEl(s.target)));
    if (steps.length) setActive({ tour, steps, index: 0, spotlight });
  }, []);

  const finish = useCallback(() => {
    if (active) onboarding.markSeen(active.tour.id);
    setActive(null);
  }, [active, onboarding]);

  // primeira vez: boas-vindas; depois, as dicas de cada tela nova
  useEffect(() => {
    if (!enabled || !onboarding.ready || onboarding.muted || active || trainingsOpen) return;
    const timer = setTimeout(() => {
      if (!onboarding.seen.includes(welcome.id)) return start(welcome, true);
      const tour = tourForPath(pathname);
      if (tour && !onboarding.seen.includes(tour.id)) start(tour, false);
    }, 900);
    return () => clearTimeout(timer);
  }, [enabled, onboarding.ready, onboarding.muted, onboarding.seen, pathname, active, welcome, start, trainingsOpen]);

  // trocou de tela no meio das dicas de uma tela: fecha sem marcar como visto
  useEffect(() => {
    setActive(a => (a && !a.spotlight ? null : a));
  }, [pathname]);

  if (!enabled) return null;

  const step = active?.steps[active.index];
  const last = !!active && active.index === active.steps.length - 1;
  const myPortals: PortalKey[] = ownerLike ? (Object.keys(PORTALS) as PortalKey[]) : portal ? [portal] : [];

  return (
    <>
      {/* botão do Oxy no canto */}
      <div className={`fixed right-4 z-[60] print:hidden ${portal === 'cashier' ? 'bottom-14' : 'bottom-4'}`} data-tour="oxy">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Abrir o Oxy, assistente da Oxys"
              className="group relative flex h-14 w-14 items-end justify-center overflow-hidden rounded-full border-2 border-primary/60 bg-card shadow-lg transition-transform hover:scale-105"
            >
              <OxyBot size={42} mood={menuOpen ? 'wave' : 'idle'} className="-mb-1" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" side="top" className="w-72 p-2">
            <div className="px-2 pb-2 pt-1">
              <p className="font-semibold">Oi! Sou o Oxy 👋</p>
              <p className="text-xs text-muted-foreground">Como posso ajudar?</p>
            </div>
            <div className="grid gap-1">
              <MenuButton icon={HelpCircle} label="Explicar esta tela" disabled={!tourForPath(pathname)}
                onClick={() => { setMenuOpen(false); const t = tourForPath(pathname); if (t) start(t, false); }} />
              <MenuButton icon={PlayCircle} label="Passeio de boas-vindas"
                onClick={() => { setMenuOpen(false); start(welcome, true); }} />
              <MenuButton icon={GraduationCap} label="Treinamentos em PDF"
                onClick={() => { setMenuOpen(false); setTrainingsOpen(true); }} />
              <MenuButton icon={BellOff} label={onboarding.muted ? 'Voltar a mostrar dicas' : 'Não mostrar dicas sozinho'}
                onClick={() => { setMenuOpen(false); onboarding.setMuted(!onboarding.muted); }} />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <AnimatePresence>
        {active && step && (
          active.spotlight
            ? <Spotlight key={`${active.tour.id}-${active.index}`} step={step} index={active.index} total={active.steps.length} last={last}
                onBack={() => setActive(a => a && { ...a, index: Math.max(0, a.index - 1) })}
                onNext={() => (last ? finish() : setActive(a => a && { ...a, index: a.index + 1 }))}
                onSkip={finish}
                onTrainings={() => { finish(); setTrainingsOpen(true); }} />
            : <TipCard key={`${active.tour.id}-${active.index}`} title={active.tour.title} step={step} index={active.index} total={active.steps.length} last={last}
                onNext={() => (last ? finish() : setActive(a => a && { ...a, index: a.index + 1 }))}
                onSkip={finish} />
        )}
      </AnimatePresence>

      <Dialog open={trainingsOpen} onOpenChange={setTrainingsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <OxyBot size={56} mood="celebrate" />
              <div>
                <DialogTitle>Treinamentos da Oxys</DialogTitle>
                <DialogDescription>PDFs prontos para você e para cada pessoa da equipe. Imprima ou mande pelo WhatsApp.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="grid gap-2">
            <TrainingRow title="Treinamento geral" subtitle="Visão completa do sistema" onDownload={downloadGeneralTraining} highlight />
            {myPortals.map(p => (
              <TrainingRow key={p} title={`Portal ${PORTALS[p].label}`} subtitle={PORTALS[p].who} onDownload={() => downloadPortalTraining(p)} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MenuButton({ icon: Icon, label, onClick, disabled }: { icon: typeof HelpCircle; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40">
      <Icon className="h-4 w-4 text-primary" /> {label}
    </button>
  );
}

function TrainingRow({ title, subtitle, onDownload, highlight }: { title: string; subtitle: string; onDownload: () => Promise<void>; highlight?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${highlight ? 'border-primary/50 bg-primary/5' : ''}`}>
      <BookOpen className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Button size="sm" variant={highlight ? 'default' : 'outline'} className="gap-1" disabled={busy}
        onClick={async () => { setBusy(true); try { await onDownload(); } finally { setBusy(false); } }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
      </Button>
    </div>
  );
}

function Dots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex gap-1" aria-label={`Passo ${index + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
      ))}
    </div>
  );
}

/** Passeio de boas-vindas: escurece a tela e destaca a parte que o Oxy está explicando. */
function Spotlight({ step, index, total, last, onBack, onNext, onSkip, onTrainings }: {
  step: OxyStep; index: number; total: number; last: boolean;
  onBack: () => void; onNext: () => void; onSkip: () => void; onTrainings: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const read = () => { const el = targetEl(step.target); setRect(el && visible(el) ? el.getBoundingClientRect() : null); };
    read();
    const t = setInterval(read, 300);
    window.addEventListener('resize', read);
    return () => { clearInterval(t); window.removeEventListener('resize', read); };
  }, [step.target]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSkip(); if (e.key === 'ArrowRight' || e.key === 'Enter') onNext(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onSkip]);

  const width = Math.min(360, window.innerWidth - 32);
  const pos = useMemo(() => {
    if (!rect) return { left: (window.innerWidth - width) / 2, top: Math.max(16, window.innerHeight / 2 - 150) };
    const clampTop = (y: number) => Math.min(Math.max(16, y), window.innerHeight - 260);
    if (rect.right + width + 24 < window.innerWidth) return { left: rect.right + 16, top: clampTop(rect.top) };
    if (rect.left - width - 24 > 0) return { left: rect.left - width - 16, top: clampTop(rect.top) };
    return { left: Math.min(Math.max(16, rect.left), window.innerWidth - width - 16), top: clampTop(rect.bottom + 12) };
  }, [rect, width]);

  return (
    <motion.div className="fixed inset-0 z-[100]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {rect ? (
        <div className="pointer-events-none absolute rounded-xl ring-2 ring-primary transition-all duration-300"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(2,6,23,0.6)' }} />
      ) : (
        <div className="absolute inset-0 bg-slate-950/60" />
      )}
      <motion.div
        role="dialog" aria-modal="true" aria-label={step.title}
        className="absolute rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl"
        style={{ left: pos.left, top: pos.top, width }}
        initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <div className="flex gap-3">
          <OxyBot size={64} mood={step.mood ?? 'talk'} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{step.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Dots index={index} total={total} />
          <div className="ml-auto flex flex-wrap justify-end gap-1">
            {!last && <Button size="sm" variant="ghost" onClick={onSkip}>Pular</Button>}
            {index > 0 && <Button size="sm" variant="outline" onClick={onBack}>Voltar</Button>}
            {last && <Button size="sm" variant="outline" className="gap-1" onClick={onTrainings}><GraduationCap className="h-4 w-4" /> Treinamentos</Button>}
            <Button size="sm" onClick={onNext}>{last ? 'Começar' : 'Próximo'}</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Dica de uma tela: cartão no canto, sem bloquear o uso. */
function TipCard({ title, step, index, total, last, onNext, onSkip }: {
  title: string; step: OxyStep; index: number; total: number; last: boolean; onNext: () => void; onSkip: () => void;
}) {
  return (
    <motion.div
      role="status"
      className="fixed bottom-24 right-4 z-[60] w-[min(360px,calc(100vw-32px))] rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl print:hidden"
      initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <button type="button" onClick={onSkip} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar dica">
        <X className="h-4 w-4" />
      </button>
      <div className="flex gap-3">
        <OxyBot size={56} mood={step.mood ?? 'talk'} className="shrink-0" />
        <div className="min-w-0 flex-1 pr-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{title}</p>
          <p className="font-semibold">{step.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {total > 1 ? <Dots index={index} total={total} /> : <span />}
        <Button size="sm" onClick={onNext}>{last ? 'Entendi' : 'Próxima dica'}</Button>
      </div>
    </motion.div>
  );
}
