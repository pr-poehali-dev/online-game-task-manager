import { useCallback, useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { authFetch } from '../admin/adminShared';
import type { FilesBySection, ActivityEntry } from '../admin/adminShared';
import type { CabinetSection } from './CabinetSidebar';

export function useFilesAndActivity(section: CabinetSection) {
  const [filesLoading, setFilesLoading] = useState(false);
  const [files, setFiles] = useState<FilesBySection | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityUserFilter, setActivityUserFilter] = useState<number | 'all'>('all');
  const [activityRange, setActivityRange] = useState<DateRange | undefined>(undefined);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    const res = await authFetch({ action: 'files_list' });
    if (res.ok) {
      const data = await res.json();
      setFiles(data);
    } else {
      setFiles(null);
    }
    setFilesLoading(false);
    setFilesLoaded(true);
  }, []);

  useEffect(() => {
    if (section === 'storage' && !filesLoaded) loadFiles();
  }, [section, filesLoaded, loadFiles]);

  const loadActivity = useCallback(async (userFilter: number | 'all', range: DateRange | undefined) => {
    setActivityLoading(true);
    const payload: Record<string, unknown> = { action: 'activity_log' };
    if (userFilter !== 'all') payload.user_id = userFilter;
    if (range?.from) {
      const from = new Date(range.from);
      from.setHours(0, 0, 0, 0);
      payload.from = from.toISOString();
      const to = range.to ? new Date(range.to) : new Date(range.from);
      to.setHours(23, 59, 59, 999);
      payload.to = to.toISOString();
    }
    const res = await authFetch(payload);
    if (res.ok) {
      const data = await res.json();
      setActivityEntries(data.entries || []);
    } else {
      setActivityEntries([]);
    }
    setActivityLoading(false);
    setActivityLoaded(true);
  }, []);

  useEffect(() => {
    if (section === 'activity' && !activityLoaded) loadActivity(activityUserFilter, activityRange);
  }, [section, activityLoaded, loadActivity, activityUserFilter, activityRange]);

  function setActivityUserFilterAndReload(v: number | 'all') {
    setActivityUserFilter(v);
    loadActivity(v, activityRange);
  }

  function setActivityRangeAndReload(r: DateRange | undefined) {
    setActivityRange(r);
    loadActivity(activityUserFilter, r);
  }

  async function deleteFile(fileSection: 'knowledge' | 'ideas' | 'tasks', entityId: string, attachmentId: string) {
    await authFetch({ action: 'file_delete', section: fileSection, entityId, attachmentId });
    setFiles((prev) => {
      if (!prev) return prev;
      const strip = (list: typeof prev.knowledge) => list.filter((a) => a.id !== attachmentId);
      return {
        ...prev,
        knowledge: strip(prev.knowledge),
        ideas: strip(prev.ideas),
        tasksActive: strip(prev.tasksActive),
        tasksArchived: strip(prev.tasksArchived),
      };
    });
  }

  return {
    filesLoading,
    files,
    activityLoading,
    activityEntries,
    activityUserFilter,
    activityRange,
    setActivityUserFilterAndReload,
    setActivityRangeAndReload,
    deleteFile,
  };
}
