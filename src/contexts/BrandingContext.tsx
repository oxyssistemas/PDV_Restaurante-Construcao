import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Branding {
  brand_name: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  login_background_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  foreground_color: string | null;
  sidebar_color: string | null;
  font_heading: string;
  font_body: string;
  radius: string;
  density: string;
  theme_mode: string;
  login_message: string | null;
  footer_text: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
}

interface Ctx { branding: Branding | null; isLoading: boolean }
const BrandingContext = createContext<Ctx>({ branding: null, isLoading: false });

export const useBranding = () => useContext(BrandingContext);

/** Converte #RRGGBB para a string "H S% L%" usada pelos tokens do Tailwind. */
export function hexToHsl(hex?: string | null): string | null {
  if (!hex) return null;
  const m = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const radiusMap: Record<string, string> = { sharp: '0.25rem', soft: '0.75rem', round: '1.25rem' };
const densityMap: Record<string, string> = { compact: '0.9', comfortable: '1', spacious: '1.1' };

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['branding', restaurantId],
    enabled: !!restaurantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('branding_settings').select('*')
        .eq('restaurant_id', restaurantId!).maybeSingle();
      if (error) throw error;
      return (data as unknown as Branding) ?? null;
    },
  });

  const branding = data ?? null;

  useEffect(() => {
    const root = document.documentElement;
    const applied: string[] = [];
    const setVar = (name: string, value: string | null) => {
      if (!value) return;
      root.style.setProperty(name, value);
      applied.push(name);
    };
    if (branding) {
      setVar('--primary', hexToHsl(branding.primary_color));
      setVar('--secondary', hexToHsl(branding.secondary_color));
      setVar('--accent', hexToHsl(branding.accent_color));
      setVar('--background', hexToHsl(branding.background_color));
      setVar('--foreground', hexToHsl(branding.foreground_color));
      setVar('--sidebar-background', hexToHsl(branding.sidebar_color));
      setVar('--radius', radiusMap[branding.radius] ?? null);
      setVar('--ui-density', densityMap[branding.density] ?? null);
      if (branding.theme_mode === 'light') root.classList.remove('dark');
      if (branding.theme_mode === 'dark') root.classList.add('dark');
      if (branding.favicon_url) {
        let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
        link.href = branding.favicon_url;
      }
    }
    return () => { applied.forEach(n => root.style.removeProperty(n)); };
  }, [branding]);

  const value = useMemo(() => ({ branding, isLoading }), [branding, isLoading]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
