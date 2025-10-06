"use client";

import { useNitrolite } from '@/providers/NitroliteProvider';
import { Skeleton } from '@/components/ui/skeleton';

export function ChannelInfo() {
  const { status } = useNitrolite();

  if (status === 'connecting') {
    return (
      <div className="p-4 border rounded-lg">
        <Skeleton className="h-5 w-32" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-4 border rounded-lg">
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          Failed to connect to ClearNode. Make sure it's running (docker-compose up)
        </div>
      </div>
    );
  }

  // Don't render anything if connected (status shown in header)
  return null;
}
