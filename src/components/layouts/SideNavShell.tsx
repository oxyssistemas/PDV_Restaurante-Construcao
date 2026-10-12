import { ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Menu aberto no celular (botão ☰). */
  open: boolean;
  onClose: () => void;
  /** Largura aberta (padrão w-64). */
  widthClass?: string;
  children: ReactNode;
}

/**
 * Menu lateral comum a todos os portais.
 * - Computador: fica recolhido só com os ícones e abre por cima da tela ao passar o mouse
 *   (ou ao navegar com o teclado); rebate sozinho quando o mouse sai.
 * - Celular: abre pelo botão ☰ e fecha ao tocar fora.
 */
export default function SideNavShell({ open, onClose, widthClass = 'w-64', children }: Props) {
  const [hover, setHover] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const enter = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHover(true), 80);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHover(false), 250);
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}
      {/* reserva o espaço do menu recolhido no computador */}
      <div className="hidden w-16 shrink-0 lg:block" aria-hidden />
      <aside
        data-tour="sidebar"
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={() => { window.clearTimeout(timer.current); setHover(true); }}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) leave(); }}
        onClick={e => { if ((e.target as HTMLElement).closest('a')) { window.clearTimeout(timer.current); setHover(false); } }}
        data-expanded={hover || undefined}
        className={cn(
          'group/side fixed inset-y-0 left-0 z-50 overflow-hidden whitespace-nowrap transition-[width,transform,box-shadow] duration-200',
          widthClass,
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          hover ? 'lg:shadow-2xl' : 'lg:w-16',
        )}
      >
        {/* recolhido: afasta os textos dos ícones para ficarem fora da faixa visível */}
        <div className={cn('h-full', widthClass, !hover && 'lg:[&_.truncate]:invisible lg:[&_a]:gap-8 lg:[&_button]:gap-8')}>{children}</div>
      </aside>
    </>
  );
}
