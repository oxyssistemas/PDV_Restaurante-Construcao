import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBranding } from '@/contexts/BrandingContext';
import { cn } from '@/lib/utils';

/**
 * Troca entre tema claro e escuro. Some quando a loja usa white label
 * (aí o tema é o escolhido na identidade visual).
 */
export default function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { theme, canChooseTheme, setTheme } = useBranding();
  if (!canChooseTheme) return null;
  const next = theme === 'dark' ? 'light' : 'dark';
  const Icon = theme === 'dark' ? Sun : Moon;
  const label = theme === 'dark' ? 'Tema claro' : 'Tema escuro';
  if (compact) {
    return (
      <Button variant="ghost" size="icon" className={className} onClick={() => setTheme(next)} aria-label={label} title={label}>
        <Icon className="h-5 w-5" />
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground', className)}
      onClick={() => setTheme(next)}
    >
      <Icon className="h-4 w-4" /> {label}
    </Button>
  );
}
