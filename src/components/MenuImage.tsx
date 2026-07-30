import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function useMenuImageUrl(path?: string | null) {
  return useQuery({
    queryKey: ['menu-image', path],
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!path) return null;
      if (path.startsWith('http')) return path;
      const { data } = await supabase.storage.from('menu-images').createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

interface MenuImageProps {
  path?: string | null;
  alt: string;
  className?: string;
}

export default function MenuImage({ path, alt, className }: MenuImageProps) {
  const { data: url } = useMenuImageUrl(path);

  if (!url) {
    return (
      <div className={cn('flex items-center justify-center rounded-md bg-muted text-muted-foreground', className)}>
        <ImageIcon className="h-5 w-5 opacity-60" />
      </div>
    );
  }

  return <img src={url} alt={alt} loading="lazy" className={cn('rounded-md object-cover', className)} />;
}
