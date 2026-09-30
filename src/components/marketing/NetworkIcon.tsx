import { Facebook, Instagram } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Network } from '@/lib/marketing';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.47V9.67a5.7 5.7 0 0 0-.8-.06A5.69 5.69 0 0 0 4.17 15.3 5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.69-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.25-1.48Z" />
    </svg>
  );
}

const ICONS = { instagram: Instagram, facebook: Facebook, tiktok: TikTokIcon };

export default function NetworkIcon({ network, className }: { network: Network; className?: string }) {
  const Icon = ICONS[network];
  return <Icon className={cn('h-4 w-4', className)} />;
}
