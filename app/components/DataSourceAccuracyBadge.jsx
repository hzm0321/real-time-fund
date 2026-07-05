'use client';

import { Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useMembership } from '@/app/hooks/useMembership';

export default function DataSourceAccuracyBadge({ label }) {
  const { isVip } = useMembership();
  if (!label || !isVip) return null;

  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 h-[18px] min-h-0 leading-none font-medium flex items-center gap-1"
      style={{
        borderColor: 'rgba(245, 158, 11, 0.45)',
        color: '#f59e0b',
        background: 'color-mix(in srgb, #f59e0b 14%, var(--card))',
        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
    >
      <Crown size={10} /> {label}
    </Badge>
  );
}
