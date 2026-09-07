import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession } from '../api/client';
import type { SessionView, UserFacingStatus } from '../api/types';

export function useSession(sessionId?: string) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: Boolean(sessionId),
  });
}

/** One stream per task, owned by Layout. GET handles 404 and polling heals missed events. */
export function useSessionUpdates(sessionId?: string) {
  const client = useQueryClient();
  const query = useSession(sessionId);
  const [connectionLost, setConnectionLost] = useState(false);
  const status = query.data?.status;

  useEffect(() => {
    setConnectionLost(false);
    if (!sessionId || !status || ['completed', 'failed', 'aborted'].includes(status)) return;
    const key = ['session', sessionId];
    const sync = () => { void client.invalidateQueries({ queryKey: key }); };
    // Paused sessions can resume in another tab. Polling also recovers a missed final snapshot.
    const timer = window.setInterval(sync, 5000);
    if (status !== 'running') return () => window.clearInterval(timer);

    const source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
    source.addEventListener('snapshot', (event) => {
      try {
        const session = JSON.parse((event as MessageEvent).data) as SessionView;
        if (session.id !== sessionId) return;
        void client.cancelQueries({ queryKey: key });
        client.setQueryData(key, session);
        setConnectionLost(false);
        if (session.status !== 'running') source.close();
      } catch {
        setConnectionLost(true);
        sync();
      }
    });
    source.addEventListener('status', (event) => {
      try {
        const update = JSON.parse((event as MessageEvent).data) as UserFacingStatus;
        client.setQueryData<SessionView>(key, (current) => current ? {
          ...current, currentStage: update.stage, status: 'running',
        } : current);
        setConnectionLost(false);
      } catch {
        sync();
      }
    });
    source.onerror = () => { setConnectionLost(true); sync(); };
    return () => { source.close(); window.clearInterval(timer); };
  }, [sessionId, status, client]);

  return { ...query, connectionLost };
}
