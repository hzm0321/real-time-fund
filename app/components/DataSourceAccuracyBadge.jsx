'use client';

import { Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function DataSourceAccuracyBadge({ label }) {
  if (!label) return null;

  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 h-[18px] min-h-0 leading-none font-medium flex items-center gap-1"
      style={{
        borderColor: 'rgba(212, 175, 55, 0.5)',
        color: '#D4AF37',
        background: 'rgba(212, 175, 55, 0.1)'
      }}
    >
      <Crown size={10} /> {label}
    </Badge>
  );
}
