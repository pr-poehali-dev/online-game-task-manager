import { useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import {
  taskAssigneeIds,
} from './index/shared';
import type {
  Task,
  ServerId,
  CategoryId,
  TaskOutcome,
  ColumnId,
  ViewId,
} from './index/shared';
import IndexSidebar from './index/IndexSidebar';
import IndexTopbar from './index/IndexTopbar';
import IndexMain from './index/IndexMain';
import { useBoardData } from './index/useBoardData';
import { useSprintActions } from './index/useSprintActions';
import { useTaskActions } from './index/useTaskActions';
import { useDeepLinks } from './index/useDeepLinks';

export default function Index() {
  const { user, isAdmin, can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<ViewId>('board');

  // Переключение раздела через меню/сайдбар — если открыта карточка по постоянной ссылке
  // (/task/:id, /idea/:id, /kb/:id), сначала возвращаем адрес на корень, иначе при обновлении
  // страницы (F5) снова откроется та же карточка вместо выбранного раздела.
  function changeView(v: ViewId) {
    if (location.pathname !== '/') navigate('/');
    setView(v);
  }
  const [server, setServer] = useState<ServerId | 'all'>('all');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [sprintFilter, setSprintFilter] = useState<string | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<TaskOutcome | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<ColumnId | null>(null);
  const [createPreset, setCreatePreset] = useState<Partial<Task> | null>(null);
  const [createSprint, setCreateSprint] = useState(false);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);
  const [patchesTaskId, setPatchesTaskId] = useState<string | null>(null);
  const [patchesServerId, setPatchesServerId] = useState<ServerId | null>(null);

  const { tasks, setTasks, sprints, setSprints, team, tasksLoading, kbArticles, tasksWithPatchFiles, reloadTasksWithPatchFiles } = useBoardData();

  const {
    handleCreateSprint,
    handleUpdateSprint,
    handleDeleteSprint,
    handleRestoreSprint,
  } = useSprintActions(sprints, setSprints, setCreateSprint, setTasks);

  const { handleOpenArticle, handleOpenTaskById, handleOpenIdeaById, closeOverlay } = useDeepLinks({
    tasks,
    user,
    searchParams,
    setSearchParams,
    setSelectedTask,
    setOpenArticleId,
    setOpenTopicId,
    setView,
    setAssigneeFilter,
  });

  const {
    handleAddTask,
    handleUpdateTask,
    handleMoveTask,
    handleDeleteTask,
    handleArchiveTask,
    handleUnarchiveTask,
    handleToRestart,
    handleToggleRestartDone,
    handleSetLauncherUploaded,
    handleDeleteArchivedTask,
  } = useTaskActions(tasks, setTasks, closeOverlay, setCreateFor, setCreatePreset);

  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedTasks = tasks.filter((t) => t.archived);
  const archivedSprints = sprints.filter((s) => s.status === 'done');
  const filteredTasks = activeTasks
    .filter((t) => server === 'all' || t.server === server)
    .filter((t) => category === 'all' || t.category === category)
    .filter((t) => sprintFilter === 'all' || (sprintFilter === 'none' ? !t.sprintId : t.sprintId === sprintFilter))
    .filter((t) => assigneeFilter === 'all' || taskAssigneeIds(t).includes(assigneeFilter));
  const filteredArchive = archivedTasks
    .filter((t) => outcomeFilter === 'all' || (t.outcome ?? 'done') === outcomeFilter)
    .filter((t) => server === 'all' || t.server === server)
    .filter((t) => category === 'all' || t.category === category);
  const myOpenCount = user
    ? activeTasks.filter((t) => t.column !== 'done' && t.column !== 'restart' && taskAssigneeIds(t).includes(user.id)).length
    : 0;

  return (
    <div className="h-screen grid-bg text-foreground flex overflow-hidden">
      <IndexSidebar
        view={view}
        category={category}
        setCategory={setCategory}
        kbArticles={kbArticles}
        tasks={tasks}
        team={team}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        setView={changeView}
      />

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <IndexTopbar
          view={view}
          setView={changeView}
          category={category}
          setCategory={setCategory}
          user={user}
          isAdmin={isAdmin}
          can={can}
          onOpenTaskById={handleOpenTaskById}
          onOpenIdeaById={handleOpenIdeaById}
          setCreateSprint={setCreateSprint}
          setCreateFor={setCreateFor}
          server={server}
          setServer={setServer}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          myOpenCount={myOpenCount}
          sprints={sprints}
          sprintFilter={sprintFilter}
          setSprintFilter={setSprintFilter}
          activeTasks={activeTasks}
          team={team}
          kbArticles={kbArticles}
        />

        <IndexMain
          view={view}
          filteredTasks={filteredTasks}
          team={team}
          tasksLoading={tasksLoading}
          handleOpenTaskById={handleOpenTaskById}
          handleOpenIdeaById={handleOpenIdeaById}
          closeOverlay={closeOverlay}
          setCreateFor={setCreateFor}
          handleArchiveTask={handleArchiveTask}
          sprints={sprints}
          activeTasks={activeTasks}
          handleUpdateSprint={handleUpdateSprint}
          handleDeleteSprint={handleDeleteSprint}
          setSprintFilter={setSprintFilter}
          setView={changeView}
          filteredArchive={filteredArchive}
          archivedTasks={archivedTasks}
          outcomeFilter={outcomeFilter}
          setOutcomeFilter={setOutcomeFilter}
          handleUnarchiveTask={handleUnarchiveTask}
          handleDeleteArchivedTask={handleDeleteArchivedTask}
          category={category}
          openArticleId={openArticleId}
          tasks={tasks}
          handleToRestart={handleToRestart}
          handleToggleRestartDone={handleToggleRestartDone}
          openTopicId={openTopicId}
          selectedTask={selectedTask}
          kbArticles={kbArticles}
          handleOpenArticle={handleOpenArticle}
          handleUpdateTask={handleUpdateTask}
          handleDeleteTask={handleDeleteTask}
          createFor={createFor}
          createPreset={createPreset}
          setCreatePreset={setCreatePreset}
          handleAddTask={handleAddTask}
          createSprint={createSprint}
          setCreateSprint={setCreateSprint}
          handleCreateSprint={handleCreateSprint}
          isAdmin={isAdmin}
          can={can}
          currentUserId={user?.id ?? null}
          archivedSprints={archivedSprints}
          handleRestoreSprint={handleRestoreSprint}
          handleDeleteSprintPermanently={handleDeleteSprint}
          handleMoveTask={handleMoveTask}
          patchesTaskId={patchesTaskId}
          patchesServerId={patchesServerId}
          onOpenPatchesForTask={(taskId, serverId) => { setPatchesTaskId(taskId); setPatchesServerId(serverId); closeOverlay(); setView('patches'); }}
          tasksWithPatchFiles={tasksWithPatchFiles}
          reloadTasksWithPatchFiles={reloadTasksWithPatchFiles}
          handleSetLauncherUploaded={handleSetLauncherUploaded}
        />
      </main>
    </div>
  );
}