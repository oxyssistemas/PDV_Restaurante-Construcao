import { ComponentType } from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { useMenuImageUrl } from '@/components/MenuImage';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  /** Ícone padrão do portal, usado quando o restaurante não enviou logo. */
  fallbackIcon: ComponentType<{ className?: string }>;
  /** Nome padrão do portal, usado quando não há nome de marca definido. */
  fallbackName: string;
  /** Usa a logo para fundo escuro (sidebar) — padrão. */
  dark?: boolean;
  className?: string;
}

/**
 * Marca exibida no topo das sidebars: substitui ícone e nome quando o
 * restaurante configura logo/nome na Identidade visual.
 */
export default function BrandLogo({ fallbackIcon: Icon, fallbackName, dark = true, className }: BrandLogoProps) {
  const { branding } = useBranding();
  const stored = dark
    ? branding?.logo_dark_url || branding?.logo_light_url
    : branding?.logo_light_url || branding?.logo_dark_url;
  const { data: logoUrl } = useMenuImageUrl(stored);
  const name = branding?.brand_name?.trim() || fallbackName;

  return (
    <div className={cn('flex items-center gap-3 overflow-hidden', className)}>
      {logoUrl ? (
        <img src={logoUrl} alt={name} className="h-9 max-w-[140px] object-contain" />
      ) : (
        <>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <span className="truncate text-lg font-bold tracking-tight">{name}</span>
        </>
      )}
    </div>
  );
}
