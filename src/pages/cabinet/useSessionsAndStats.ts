import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { authFetch } from '../admin/adminShared';
import type { TeamUser, SessionInfo, UserStats } from '../admin/adminShared';

export function useSessionsAndStats() {
  const [sessionsFor, setSessionsFor] = useState<TeamUser | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [statsFor, setStatsFor] = useState<TeamUser | null>(null);
  const [statsRange, setStatsRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from, to };
  });
  const [statsCalendarOpen, setStatsCalendarOpen] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  async function openSessions(u: TeamUser) {
    setSessionsFor(u);
    setSessionsLoading(true);
    setSessions([]);
    const res = await authFetch({ action: 'sessions', user_id: u.id });
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
    }
    setSessionsLoading(false);
  }

  async function revokeSession(sessionId: number) {
    setRevokingId(sessionId);
    try {
      await authFetch({ action: 'revoke_session', session_id: sessionId });
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, active: false } : s)));
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeAllSessions() {
    if (!sessionsFor) return;
    setRevokingAll(true);
    try {
      await authFetch({ action: 'revoke_sessions', user_id: sessionsFor.id });
      await openSessions(sessionsFor);
    } finally {
      setRevokingAll(false);
    }
  }

  const loadStats = useCallback(async (userId: number, range: DateRange | undefined) => {
    if (!range?.from) return;
    setStatsLoading(true);
    const from = new Date(range.from);
    from.setHours(0, 0, 0, 0);
    const to = range.to ? new Date(range.to) : new Date(range.from);
    to.setHours(23, 59, 59, 999);
    const res = await authFetch({ action: 'stats', user_id: userId, from: from.toISOString(), to: to.toISOString() });
    if (res.ok) {
      const data = await res.json();
      setStats(data);
    } else {
      setStats(null);
    }
    setStatsLoading(false);
  }, []);

  function openStats(u: TeamUser) {
    setStatsFor(u);
    setStats(null);
    loadStats(u.id, statsRange);
  }

  function applyStatsRange(range: DateRange | undefined) {
    setStatsRange(range);
    if (statsFor && range?.from && range?.to) {
      setStatsCalendarOpen(false);
      loadStats(statsFor.id, range);
    }
  }

  return {
    sessionsFor, setSessionsFor,
    sessions,
    sessionsLoading,
    revokingId,
    revokingAll,
    statsFor, setStatsFor,
    statsRange,
    statsCalendarOpen, setStatsCalendarOpen,
    stats,
    statsLoading,
    openSessions,
    revokeSession,
    revokeAllSessions,
    openStats,
    applyStatsRange,
  };
}
