export interface TeamMember {
  id: number;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  role: 'admin' | 'member';
  tg_username: string | null;
  specialization: string | null;
  pending: boolean;
  online: boolean;
}

export interface AssigneeView {
  name: string;
  short: string;
  color: string;
  photo_url: string | null;
}

export type DeadlineState = 'overdue' | 'soon' | 'normal';

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ColumnId = 'todo' | 'progress' | 'done' | 'restart' | 'hold';
// ServerId — идентификатор сервера из динамического справочника (см. useCatalog() в
// src/lib/catalog.tsx, backend/catalog/index.py, таблица servers в БД) — раньше был фиксированным
// union-типом из 3 конкретных ID, теперь любая строка, т.к. администратор может добавлять новые
// серверы через кабинет (раздел "Управление проектом → Серверы", см. CabinetProject.tsx).
export type ServerId = string;
// CategoryId — идентификатор категории из динамического справочника (см. useCatalog() в
// src/lib/catalog.tsx, backend/catalog/index.py, таблица categories в БД) — раньше был
// фиксированным union-типом, теперь любая строка, т.к. администратор может добавлять/переименовывать
// категории через кабинет (раздел "Управление проектом → Категории", см. CabinetProject.tsx).
// Категории общие для задач и статей базы знаний (одна и та же таблица/справочник).
export type CategoryId = string;
export type DeployStatus = 'none' | 'in_progress' | 'local' | 'test' | 'ready_live' | 'tested_ok' | 'tested_rework' | 'unfeasible';
export type TaskOutcome = 'done' | 'unfeasible' | 'cancelled';
export type ViewId = 'board' | 'sprints' | 'archive' | 'knowledge' | 'restart' | 'ideas' | 'patchnotes' | 'patches' | 'logs';

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface Server {
  id: ServerId;
  label: string;
  color: string;
}

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
}

export interface Task {
  id: string;
  title: string;
  column: ColumnId;
  assigneeId: number | null;
  assigneeIds?: number[];
  priority: Priority;
  version?: string;
  server: ServerId;
  description?: string;
  links?: { url: string; label: string }[];
  category: CategoryId;
  sprintId?: string;
  deployStatus?: DeployStatus;
  comments?: Comment[];
  commentCount?: number;
  archived?: boolean;
  outcome?: TaskOutcome | null;
  kbArticleIds?: number[];
  restartDone?: boolean;
  createdAt?: string | null;
  creatorId?: number | null;
  attachments?: Attachment[];
  deadline?: string | null;
  launcherUploaded?: boolean;
}

export interface Sprint {
  id: string;
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'planned' | 'done';
  server?: ServerId | null;
}