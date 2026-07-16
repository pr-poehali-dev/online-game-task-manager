import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const [view, setView] = useState<ViewId>('board');
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

  const { tasks, setTasks, sprints, setSprints, team, tasksLoading, kbArticles } = useBoardData();

  const {
    handleCreateSprint,
    handleUpdateSprint,
    handleDeleteSprint,
    handleRestoreSprint,
  } = useSprintActions(sprints, setSprints, setCreateSprint);

  const {
    handleAddTask,
    handleUpdateTask,
    handleMoveTask,
    handleDeleteTask,
    handleArchiveTask,
    handleUnarchiveTask,
    handleToRestart,
    handleToggleRestartDone,
    handleDeleteArchivedTask,
  } = useTaskActions(tasks, setTasks, setSelectedTask, setCreateFor, setCreatePreset);

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

  const { handleOpenArticle, handleOpenTaskById, handleOpenIdeaById } = useDeepLinks({
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

  return (
    <div className="min-h-screen grid-bg text-foreground flex">
      <IndexSidebar
        view={view}
        category={category}
        setCategory={setCategory}
        kbArticles={kbArticles}
        tasks={tasks}
        team={team}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        setView={setView}
      />

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <IndexTopbar
          view={view}
          setView={setView}
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
          setSelectedTask={setSelectedTask}
          setCreateFor={setCreateFor}
          handleArchiveTask={handleArchiveTask}
          sprints={sprints}
          activeTasks={activeTasks}
          handleUpdateSprint={handleUpdateSprint}
          handleDeleteSprint={handleDeleteSprint}
          setSprintFilter={setSprintFilter}
          setView={setView}
          filteredArchive={filteredArchive}
          archivedTasks={archivedTasks}
          outcomeFilter={outcomeFilter}
          setOutcomeFilter={setOutcomeFilter}
          handleUnarchiveTask={handleUnarchiveTask}
          handleDeleteArchivedTask={handleDeleteArchivedTask}
          category={category}
          openArticleId={openArticleId}
          setOpenArticleId={setOpenArticleId}
          tasks={tasks}
          handleToRestart={handleToRestart}
          handleToggleRestartDone={handleToggleRestartDone}
          openTopicId={openTopicId}
          setOpenTopicId={setOpenTopicId}
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
        />
      </main>
    </div>
  );
}
