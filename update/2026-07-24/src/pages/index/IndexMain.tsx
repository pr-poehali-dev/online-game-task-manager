import KnowledgeBase from '@/components/KnowledgeBase';
import type { KbCategoryId, KbArticleBrief } from '@/components/KnowledgeBase';
import Board from './Board';
import Restart from './Restart';
import Ideas from './Ideas';
import Patchnotes from './Patchnotes';
import Patches from './Patches';
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
  DeployStatus,
  ServerId,
} from './shared';

export default function IndexMain({
  view,
  filteredTasks,
  team,
  tasksLoading,
  handleOpenTaskById,
  handleOpenIdeaById,
  closeOverlay,
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
  tasks,
  handleToRestart,
  handleFromRestart,
  handleToggleRestartDone,
  openTopicId,
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
  handleMoveTask,
  patchesTaskId,
  patchesServerId,
  onOpenPatchesForTask,
  tasksWithPatchFiles,
  reloadTasksWithPatchFiles,
  handleSetLauncherUploaded,
}: {
  view: ViewId;
  filteredTasks: Task[];
  team: TeamMember[];
  tasksLoading: boolean;
  handleOpenTaskById: (id: string) => void;
  handleOpenIdeaById: (id: string) => void;
  closeOverlay: () => void;
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
  tasks: Task[];
  handleToRestart: (id: string) => void;
  handleFromRestart: (id: string) => void;
  handleToggleRestartDone: (id: string, done: boolean) => void;
  openTopicId: string | null;
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
  handleCreateSprint: (s: Sprint, taskIds?: string[]) => void;
  isAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  currentUserId: number | null;
  archivedSprints: Sprint[];
  handleRestoreSprint: (id: string) => void;
  handleDeleteSprintPermanently: (id: string) => void;
  handleMoveTask: (task: Task, column: ColumnId, deployStatus: DeployStatus) => void;
  patchesTaskId: string | null;
  patchesServerId: ServerId | null;
  onOpenPatchesForTask: (taskId: string, serverId: ServerId) => void;
  tasksWithPatchFiles: Set<string>;
  reloadTasksWithPatchFiles: () => void;
  handleSetLauncherUploaded: (id: string, uploaded: boolean) => void;
}) {
  return (
    <>
      <div className="flex-1 overflow-auto p-3 sm:p-6 scrollbar-thin">
        {view === 'board' && (
          <Board
            tasks={filteredTasks}
            team={team}
            loading={tasksLoading}
            onCardClick={(t) => handleOpenTaskById(t.id)}
            onAddClick={setCreateFor}
            onArchive={handleArchiveTask}
            onMoveTask={handleMoveTask}
            isAdmin={isAdmin}
            can={can}
            currentUserId={currentUserId}
            tasksWithPatchFiles={tasksWithPatchFiles}
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
            onCardClick={(t) => handleOpenTaskById(t.id)}
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
            can={can}
            isAdmin={isAdmin}
            onOpenArticleById={handleOpenArticle}
            onBack={closeOverlay}
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
            onCardClick={(t) => handleOpenTaskById(t.id)}
            onAddClick={() => setCreateFor('restart')}
            onToRestart={handleToRestart}
            onFromRestart={handleFromRestart}
            onToggleDone={handleToggleRestartDone}
            onArchive={handleArchiveTask}
            isAdmin={isAdmin}
            can={can}
            currentUserId={currentUserId}
            tasksWithPatchFiles={tasksWithPatchFiles}
          />
        )}
        {view === 'ideas' && (
          <Ideas
            initialTopicId={openTopicId}
            onOpenTopicById={handleOpenIdeaById}
            onBack={closeOverlay}
            authors={team.map((m) => ({
              id: m.id,
              name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
              photo_url: m.photo_url,
            }))}
          />
        )}
        {view === 'patchnotes' && <Patchnotes />}
        {view === 'patches' && (
          <Patches
            canManage={isAdmin || can('task_edit_own')}
            tasks={activeTasks.map((t) => ({ id: t.id, title: t.title }))}
            initialTaskId={patchesTaskId}
            initialServerId={patchesServerId}
            onFileTaskLinkChange={reloadTasksWithPatchFiles}
          />
        )}
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          team={team}
          kbArticles={kbArticles}
          onOpenArticle={handleOpenArticle}
          onClose={closeOverlay}
          onSave={handleUpdateTask}
          onDelete={handleDeleteTask}
          onArchive={handleArchiveTask}
          onUnarchive={handleUnarchiveTask}
          sprints={sprints}
          isAdmin={isAdmin}
          can={can}
          currentUserId={currentUserId}
          onOpenPatches={() => onOpenPatchesForTask(selectedTask.id, selectedTask.server)}
          hasPatchFiles={tasksWithPatchFiles.has(selectedTask.id)}
          onSetLauncherUploaded={handleSetLauncherUploaded}
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
          availableTasks={activeTasks.filter((t) => !t.sprintId)}
        />
      )}
    </>
  );
}