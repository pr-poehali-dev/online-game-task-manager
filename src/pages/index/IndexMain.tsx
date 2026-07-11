import KnowledgeBase from '@/components/KnowledgeBase';
import type { KbCategoryId, KbArticleBrief } from '@/components/KnowledgeBase';
import Board from './Board';
import Restart from './Restart';
import Ideas from './Ideas';
import { TaskModal, CreateTaskModal } from './TaskModals';
import { Archive, Sprints, CreateSprintModal } from './SprintsBugsArchive';
import type { PermissionKey } from '@/lib/auth';
import type {
  TeamMember,
  Task,
  Sprint,
  TaskOutcome,
  ColumnId,
  CategoryId,
  ViewId,
} from './shared';

export default function IndexMain({
  view,
  filteredTasks,
  team,
  tasksLoading,
  setSelectedTask,
  setCreateFor,
  handleArchiveTask,
  sprints,
  activeTasks,
  handleUpdateSprint,
  handleDeleteSprint,
  setSprintFilter,
  setView,
  filteredArchive,
  archivedTasks,
  outcomeFilter,
  setOutcomeFilter,
  handleUnarchiveTask,
  handleDeleteArchivedTask,
  category,
  openArticleId,
  setOpenArticleId,
  tasks,
  handleToRestart,
  handleToggleRestartDone,
  openTopicId,
  setOpenTopicId,
  selectedTask,
  kbArticles,
  handleOpenArticle,
  handleUpdateTask,
  handleDeleteTask,
  createFor,
  createPreset,
  setCreatePreset,
  handleAddTask,
  createSprint,
  setCreateSprint,
  handleCreateSprint,
  isAdmin,
  can,
  currentUserId,
  archivedSprints,
  handleRestoreSprint,
  handleDeleteSprintPermanently,
}: {
  view: ViewId;
  filteredTasks: Task[];
  team: TeamMember[];
  tasksLoading: boolean;
  setSelectedTask: (t: Task | null) => void;
  setCreateFor: (c: ColumnId | null) => void;
  handleArchiveTask: (id: string, outcome: TaskOutcome) => void;
  sprints: Sprint[];
  activeTasks: Task[];
  handleUpdateSprint: (s: Sprint) => void;
  handleDeleteSprint: (id: string) => void;
  setSprintFilter: (id: string) => void;
  setView: (v: ViewId) => void;
  filteredArchive: Task[];
  archivedTasks: Task[];
  outcomeFilter: TaskOutcome | 'all';
  setOutcomeFilter: (o: TaskOutcome | 'all') => void;
  handleUnarchiveTask: (id: string) => void;
  handleDeleteArchivedTask: (id: string) => void;
  category: CategoryId | 'all';
  openArticleId: string | null;
  setOpenArticleId: (id: string | null) => void;
  tasks: Task[];
  handleToRestart: (id: string) => void;
  handleToggleRestartDone: (id: string, done: boolean) => void;
  openTopicId: string | null;
  setOpenTopicId: (id: string | null) => void;
  selectedTask: Task | null;
  kbArticles: KbArticleBrief[];
  handleOpenArticle: (id: string) => void;
  handleUpdateTask: (t: Task) => void;
  handleDeleteTask: (id: string) => void;
  createFor: ColumnId | null;
  createPreset: Partial<Task> | null;
  setCreatePreset: (p: Partial<Task> | null) => void;
  handleAddTask: (t: Task) => void;
  createSprint: boolean;
  setCreateSprint: (v: boolean) => void;
  handleCreateSprint: (s: Sprint) => void;
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  currentUserId: number | null;
  archivedSprints: Sprint[];
  handleRestoreSprint: (id: string) => void;
  handleDeleteSprintPermanently: (id: string) => void;
}) {
  return (
    <>
      <div className="flex-1 overflow-auto p-6 scrollbar-thin">
        {view === 'board' && (
          <Board
            tasks={filteredTasks}
            team={team}
            loading={tasksLoading}
            onCardClick={setSelectedTask}
            onAddClick={setCreateFor}
            onArchive={handleArchiveTask}
            isAdmin={isAdmin}
            can={can}
          />
        )}
        {view === 'sprints' && (
          <Sprints
            sprints={sprints}
            tasks={activeTasks}
            onUpdate={handleUpdateSprint}
            onDelete={handleDeleteSprint}
            onFilterBoard={(sprintId) => { setSprintFilter(sprintId); setView('board'); }}
            isAdmin={isAdmin}
            can={can}
          />
        )}
        {view === 'archive' && (
          <Archive
            tasks={filteredArchive}
            total={archivedTasks.length}
            team={team}
            outcomeFilter={outcomeFilter}
            onOutcomeFilter={setOutcomeFilter}
            onCardClick={setSelectedTask}
            onRestore={handleUnarchiveTask}
            onDelete={handleDeleteArchivedTask}
            isAdmin={isAdmin}
            archivedSprints={archivedSprints}
            onRestoreSprint={handleRestoreSprint}
            onDeleteSprint={handleDeleteSprintPermanently}
          />
        )}
        {view === 'knowledge' && (
          <KnowledgeBase
            category={category as KbCategoryId | 'all'}
            initialArticleId={openArticleId}
            onConsumeInitial={() => setOpenArticleId(null)}
            can={can}
            isAdmin={isAdmin}
            authors={team.map((m) => ({
              id: m.id,
              name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
              photo_url: m.photo_url,
            }))}
          />
        )}
        {view === 'restart' && (
          <Restart
            tasks={tasks}
            team={team}
            loading={tasksLoading}
            onCardClick={setSelectedTask}
            onAddClick={() => setCreateFor('restart')}
            onToRestart={handleToRestart}
            onToggleDone={handleToggleRestartDone}
            onArchive={handleArchiveTask}
            isAdmin={isAdmin}
            can={can}
            currentUserId={currentUserId}
          />
        )}
        {view === 'ideas' && (
          <Ideas
            initialTopicId={openTopicId}
            onConsumeInitial={() => setOpenTopicId(null)}
            authors={team.map((m) => ({
              id: m.id,
              name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
              photo_url: m.photo_url,
            }))}
          />
        )}
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          team={team}
          kbArticles={kbArticles}
          onOpenArticle={handleOpenArticle}
          onClose={() => setSelectedTask(null)}
          onSave={handleUpdateTask}
          onDelete={handleDeleteTask}
          onArchive={handleArchiveTask}
          onUnarchive={handleUnarchiveTask}
          sprints={sprints}
          isAdmin={isAdmin}
          can={can}
          currentUserId={currentUserId}
        />
      )}
      {createFor && (
        <CreateTaskModal
          column={createFor}
          team={team}
          kbArticles={kbArticles}
          preset={createPreset}
          onClose={() => { setCreateFor(null); setCreatePreset(null); }}
          onCreate={handleAddTask}
          sprints={sprints}
        />
      )}
      {createSprint && (
        <CreateSprintModal
          onClose={() => setCreateSprint(false)}
          onCreate={handleCreateSprint}
        />
      )}
    </>
  );
}