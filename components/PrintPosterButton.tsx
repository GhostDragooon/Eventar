'use client';

import { Button } from '@/components/ui/button';

export default function PrintPosterButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.print()}
      className="px-md py-sm text-sm font-medium"
    >
      Print poster
    </Button>
  );
}
