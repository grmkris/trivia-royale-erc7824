"use client";

import { useNitrolite } from '@/providers/NitroliteProvider';
import { Skeleton } from '@/components/ui/skeleton';

export function ChannelInfo() {
  const { status, client } = useNitrolite();

  if (status === 'connecting') {
    return (
      <div className="p-4 border rounded-lg space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  const statusColors = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500'
  };

  const statusLabels = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    error: 'Error'
  };

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <h3 className="font-semibold">Channel Status</h3>

      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
        <span className="text-sm">{statusLabels[status]}</span>
      </div>

      {status === 'connected' && (
        <div className="space-y-2 text-xs text-gray-600">
          <div>
            <span className="font-medium">ClearNode:</span> ws://localhost:8000/ws
          </div>
          <div className="text-xs bg-green-50 p-2 rounded">
            ✅ Ready for transactions
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
          Failed to connect to ClearNode. Make sure it's running (docker-compose up)
        </div>
      )}
    </div>
  );
}
