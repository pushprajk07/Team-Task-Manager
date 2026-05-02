import {
  clearSessionCookie,
  createSession,
  destroySessionByToken,
  hashPassword,
  resolveSessionUser,
  sanitizeUser,
  setSessionCookie,
  verifyPassword,
} from "./auth.js";
import { createId, getStore, isPersistenceEnabled, nowIso, todayIso, updateStore } from "./db.js";
import { config } from "./env.js";
import { HttpError, json, noContent, readJsonBody, sendError } from "./http.js";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  validateLoginPayload,
  validateMemberPayload,
  validateProjectPayload,
  validateSignupPayload,
  validateTaskCreatePayload,
  validateTaskUpdatePayload,
} from "./validation.js";

function cloneArray(items) {
  return [...items];
}

function requireAuth(user) {
  if (!user) {
    throw new HttpError(401, "You need to sign in to continue.");
  }

  return user;
}

function requireAdmin(user) {
  requireAuth(user);

  if (user.role !== "ADMIN") {
    throw new HttpError(403, "Only admins can perform this action.");
  }

  return user;
}

function ensureProjectAccess(user, projectId) {
  const store = getStore();
  const project = store.projects.find((entry) => entry.id === projectId);

  if (!project) {
    throw new HttpError(404, "Project not found.");
  }

  if (user.role === "ADMIN") {
    return project;
  }

  const membership = store.projectMembers.find(
    (entry) => entry.projectId === projectId && entry.userId === user.id,
  );

  if (!membership) {
    throw new HttpError(404, "Project not found.");
  }

  return project;
}

function ensureProjectMember(projectId, userId) {
  return getStore().projectMembers.some(
    (entry) => entry.projectId === projectId && entry.userId === userId,
  );
}

function getUserById(userId) {
  return getStore().users.find((entry) => entry.id === userId) || null;
}

function getProjectById(projectId) {
  return getStore().projects.find((entry) => entry.id === projectId) || null;
}

function mapProject(project, store = getStore()) {
  const projectTasks = store.tasks.filter((task) => task.projectId === project.id);
  const memberCount = store.projectMembers.filter(
    (entry) => entry.projectId === project.id,
  ).length;
  const completedTasks = projectTasks.filter(
    (task) => task.status === "DONE",
  ).length;
  const overdueTasks = projectTasks.filter(
    (task) => task.dueDate && task.dueDate < todayIso() && task.status !== "DONE",
  ).length;
  const createdBy = store.users.find((user) => user.id === project.createdById);
  const totalTasks = projectTasks.length;

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    createdById: project.createdById,
    createdByName: createdBy?.name || "Unknown",
    memberCount,
    totalTasks,
    completedTasks,
    overdueTasks,
    progress: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
  };
}

function mapTask(task, store = getStore()) {
  const assignee = task.assigneeId ? store.users.find((user) => user.id === task.assigneeId) : null;
  const creator = store.users.find((user) => user.id === task.createdById);
  const project = store.projects.find((entry) => entry.id === task.projectId);

  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId,
    assigneeName: assignee?.name || null,
    assigneeEmail: assignee?.email || null,
    createdById: task.createdById,
    createdByName: creator?.name || "Unknown",
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    projectName: project?.name || null,
  };
}

function listProjectsForUser(user) {
  const store = getStore();
  const projects = user.role === "ADMIN"
    ? cloneArray(store.projects)
    : store.projects.filter((project) =>
        store.projectMembers.some(
          (entry) => entry.projectId === project.id && entry.userId === user.id,
        ),
      );

  return projects
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((project) => mapProject(project, store));
}

function getProjectMembers(projectId) {
  const store = getStore();

  return store.projectMembers
    .filter((entry) => entry.projectId === projectId)
    .map((entry) => {
      const user = store.users.find((item) => item.id === entry.userId);
      const activeTaskCount = store.tasks.filter(
        (task) =>
          task.projectId === projectId &&
          task.assigneeId === entry.userId &&
          task.status !== "DONE",
      ).length;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        joinedAt: entry.createdAt,
        activeTaskCount,
      };
    })
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "ADMIN" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

function getProjectTasks(projectId) {
  const store = getStore();

  return store.tasks
    .filter((task) => task.projectId === projectId)
    .sort((left, right) => {
      const statusOrder = {
        IN_PROGRESS: 0,
        REVIEW: 1,
        TODO: 2,
        DONE: 3,
      };

      const firstStatus = statusOrder[left.status] ?? 99;
      const secondStatus = statusOrder[right.status] ?? 99;

      if (firstStatus !== secondStatus) {
        return firstStatus - secondStatus;
      }

      if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
        return left.dueDate.localeCompare(right.dueDate);
      }

      if (left.dueDate && !right.dueDate) {
        return -1;
      }

      if (!left.dueDate && right.dueDate) {
        return 1;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .map((task) => mapTask(task, store));
}

function getProjectSummary(tasks) {
  const summary = {
    total: tasks.length,
    todo: 0,
    inProgress: 0,
    review: 0,
    done: 0,
    overdue: 0,
  };
  const today = todayIso();

  for (const task of tasks) {
    if (task.status === "TODO") summary.todo += 1;
    if (task.status === "IN_PROGRESS") summary.inProgress += 1;
    if (task.status === "REVIEW") summary.review += 1;
    if (task.status === "DONE") summary.done += 1;
    if (task.dueDate && task.dueDate < today && task.status !== "DONE") {
      summary.overdue += 1;
    }
  }

  return summary;
}

function getTaskById(taskId) {
  const task = getStore().tasks.find((entry) => entry.id === taskId);
  return task ? mapTask(task, getStore()) : null;
}

function listTasksForUser(user, searchParams) {
  const store = getStore();
  let tasks = cloneArray(store.tasks);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");
  const assigneeId = searchParams.get("assigneeId");

  if (user.role !== "ADMIN") {
    tasks = tasks.filter((task) => task.assigneeId === user.id);
  }

  if (projectId) {
    tasks = tasks.filter((task) => task.projectId === projectId);
  }

  if (status && TASK_STATUSES.includes(status)) {
    tasks = tasks.filter((task) => task.status === status);
  }

  if (assigneeId && user.role === "ADMIN") {
    tasks = tasks.filter((task) => task.assigneeId === assigneeId);
  }

  return tasks
    .sort((left, right) => {
      if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
        return left.dueDate.localeCompare(right.dueDate);
      }

      if (left.dueDate && !right.dueDate) {
        return -1;
      }

      if (!left.dueDate && right.dueDate) {
        return 1;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .map((task) => mapTask(task, store));
}

function getDashboard(user) {
  const store = getStore();
  const projects = listProjectsForUser(user);
  const taskScope =
    user.role === "ADMIN"
      ? cloneArray(store.tasks)
      : store.tasks.filter((task) => task.assigneeId === user.id);

  const stats = {
    projectsCount: projects.length,
    teamCount:
      user.role === "ADMIN"
        ? store.users.length
        : new Set(
            store.projectMembers
              .filter((entry) =>
                store.projectMembers.some(
                  (member) =>
                    member.projectId === entry.projectId && member.userId === user.id,
                ),
              )
              .map((entry) => entry.userId),
          ).size,
    openTasks: taskScope.filter((task) => task.status !== "DONE").length,
    completedTasks: taskScope.filter((task) => task.status === "DONE").length,
    overdueTasks: taskScope.filter(
      (task) => task.dueDate && task.dueDate < todayIso() && task.status !== "DONE",
    ).length,
  };

  const statusBreakdown = TASK_STATUSES.map((status) => ({
    status,
    count: taskScope.filter((task) => task.status === status).length,
  }));

  const highlightedTasks = taskScope
    .sort((left, right) => {
      if (left.status === "DONE" && right.status !== "DONE") {
        return 1;
      }

      if (left.status !== "DONE" && right.status === "DONE") {
        return -1;
      }

      if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
        return left.dueDate.localeCompare(right.dueDate);
      }

      if (left.dueDate && !right.dueDate) {
        return -1;
      }

      if (!left.dueDate && right.dueDate) {
        return 1;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 6)
    .map((task) => mapTask(task, store));

  return {
    stats,
    statusBreakdown,
    highlightedTasks,
    projects: projects.slice(0, 4),
  };
}

async function handleSignup(ctx) {
  const payload = validateSignupPayload(await readJsonBody(ctx.req));
  const store = getStore();
  const existingUser = store.users.find((entry) => entry.email === payload.email);

  if (existingUser) {
    throw new HttpError(409, "An account with that email already exists.");
  }

  const now = nowIso();
  const userCount = store.users.length;
  
  const isAdminByEmail = config.adminEmail && payload.email === config.adminEmail;
  const isFirstUser = userCount === 0;

  const user = {
    id: createId("usr"),
    name: payload.name,
    email: payload.email,
    passwordHash: hashPassword(payload.password),
    role: (isAdminByEmail || isFirstUser) ? "ADMIN" : "MEMBER",
    createdAt: now,
    updatedAt: now,
  };

  updateStore((storeState) => {
    storeState.users.push(user);
  });

  const token = createSession(user.id);
  setSessionCookie(ctx.res, token);

  return json(ctx.res, 201, {
    user: sanitizeUser(user),
  });
}

async function handleLogin(ctx) {
  const payload = validateLoginPayload(await readJsonBody(ctx.req));
  const user = getStore().users.find((entry) => entry.email === payload.email);

  if (!user || !verifyPassword(payload.password, user.passwordHash)) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const token = createSession(user.id);
  setSessionCookie(ctx.res, token);

  return json(ctx.res, 200, {
    user: sanitizeUser(user),
  });
}

async function handleLogout(ctx) {
  const session = resolveSessionUser(ctx.req);

  if (session?.token) {
    destroySessionByToken(session.token);
  }

  clearSessionCookie(ctx.res);
  return noContent(ctx.res);
}

async function handleMe(ctx) {
  return json(ctx.res, 200, {
    user: requireAuth(ctx.user),
  });
}

async function handleUsers(ctx) {
  requireAdmin(ctx.user);
  const store = getStore();

  const users = cloneArray(store.users)
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "ADMIN" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    })
    .map((user) => ({
      ...sanitizeUser(user),
      projectCount: store.projectMembers.filter((entry) => entry.userId === user.id).length,
      activeTaskCount: store.tasks.filter(
        (task) => task.assigneeId === user.id && task.status !== "DONE",
      ).length,
    }));

  return json(ctx.res, 200, { users });
}

async function handleProjectsList(ctx) {
  requireAuth(ctx.user);

  return json(ctx.res, 200, {
    projects: listProjectsForUser(ctx.user),
  });
}

async function handleProjectCreate(ctx) {
  const user = requireAdmin(ctx.user);
  const payload = validateProjectPayload(await readJsonBody(ctx.req));
  const projectId = createId("prj");
  const now = nowIso();

  updateStore((store) => {
    store.projects.push({
      id: projectId,
      name: payload.name,
      description: payload.description,
      createdById: user.id,
      createdAt: now,
      updatedAt: now,
    });
    store.projectMembers.push({
      id: createId("pm"),
      projectId,
      userId: user.id,
      createdAt: now,
    });
  });

  const project = getProjectById(projectId);

  return json(ctx.res, 201, {
    project: mapProject(project),
  });
}

async function handleProjectDetail(ctx, projectId) {
  const user = requireAuth(ctx.user);
  const project = ensureProjectAccess(user, projectId);
  const members = getProjectMembers(projectId);
  const tasks = getProjectTasks(projectId);

  return json(ctx.res, 200, {
    project: mapProject(project),
    members,
    tasks,
    summary: getProjectSummary(tasks),
  });
}

async function handleProjectAddMember(ctx, projectId) {
  requireAdmin(ctx.user);
  ensureProjectAccess(ctx.user, projectId);

  const payload = validateMemberPayload(await readJsonBody(ctx.req));
  const userToAdd = getUserById(payload.userId);

  if (!userToAdd) {
    throw new HttpError(404, "User not found.");
  }

  if (ensureProjectMember(projectId, payload.userId)) {
    throw new HttpError(409, "That user is already on the project.");
  }

  updateStore((store) => {
    store.projectMembers.push({
      id: createId("pm"),
      projectId,
      userId: payload.userId,
      createdAt: nowIso(),
    });
  });

  return json(ctx.res, 201, {
    member: {
      ...sanitizeUser(userToAdd),
      activeTaskCount: 0,
    },
  });
}

async function handleProjectRemoveMember(ctx, projectId, userId) {
  requireAdmin(ctx.user);
  ensureProjectAccess(ctx.user, projectId);

  if (!ensureProjectMember(projectId, userId)) {
    throw new HttpError(404, "Project member not found.");
  }

  updateStore((store) => {
    const updatedAt = nowIso();
    store.tasks = store.tasks.map((task) =>
      task.projectId === projectId && task.assigneeId === userId
        ? { ...task, assigneeId: null, updatedAt }
        : task,
    );
    store.projectMembers = store.projectMembers.filter(
      (entry) => !(entry.projectId === projectId && entry.userId === userId),
    );
  });

  return noContent(ctx.res);
}

async function handleTasksList(ctx) {
  requireAuth(ctx.user);

  return json(ctx.res, 200, {
    tasks: listTasksForUser(ctx.user, ctx.url.searchParams),
  });
}

async function handleTaskCreate(ctx) {
  const user = requireAdmin(ctx.user);
  const payload = validateTaskCreatePayload(await readJsonBody(ctx.req));
  ensureProjectAccess(user, payload.projectId);

  if (payload.assigneeId && !ensureProjectMember(payload.projectId, payload.assigneeId)) {
    throw new HttpError(400, "Assigned user must be a member of the project.");
  }

  const now = nowIso();
  const taskId = createId("tsk");

  updateStore((store) => {
    store.tasks.push({
      id: taskId,
      projectId: payload.projectId,
      title: payload.title,
      description: payload.description,
      status: payload.status,
      priority: payload.priority,
      dueDate: payload.dueDate,
      assigneeId: payload.assigneeId,
      createdById: user.id,
      createdAt: now,
      updatedAt: now,
    });
  });

  return json(ctx.res, 201, {
    task: mapTask(getTaskById(taskId)),
  });
}

async function handleTaskUpdate(ctx, taskId) {
  const user = requireAuth(ctx.user);
  const task = getTaskById(taskId);

  if (!task) {
    throw new HttpError(404, "Task not found.");
  }

  ensureProjectAccess(user, task.projectId);

  const update = validateTaskUpdatePayload(await readJsonBody(ctx.req));
  const isAdmin = user.role === "ADMIN";

  if (!isAdmin) {
    const allowedFields = Object.keys(update);

    if (task.assigneeId !== user.id) {
      throw new HttpError(403, "You can only update tasks assigned to you.");
    }

    if (allowedFields.some((field) => field !== "status")) {
      throw new HttpError(
        403,
        "Members can only update the status of their assigned tasks.",
      );
    }
  }

  if (update.assigneeId && !ensureProjectMember(task.projectId, update.assigneeId)) {
    throw new HttpError(400, "Assigned user must be a member of the project.");
  }

  const nextTask = {
    title: update.title ?? task.title,
    description: update.description ?? task.description,
    status: update.status ?? task.status,
    priority: update.priority ?? task.priority,
    dueDate: update.dueDate ?? task.dueDate,
    assigneeId: update.assigneeId === undefined ? task.assigneeId : update.assigneeId,
  };

  updateStore((store) => {
    const index = store.tasks.findIndex((entry) => entry.id === taskId);
    if (index === -1) {
      throw new HttpError(404, "Task not found.");
    }

    store.tasks[index] = {
      ...store.tasks[index],
      ...nextTask,
      updatedAt: nowIso(),
    };
  });

  return json(ctx.res, 200, {
    task: mapTask(getTaskById(taskId)),
  });
}

async function handleDashboard(ctx) {
  requireAuth(ctx.user);

  return json(ctx.res, 200, getDashboard(ctx.user));
}

const routeTable = [
  {
    method: "GET",
    pattern: /^\/api\/health$/,
    handler: (ctx) =>
      json(ctx.res, 200, {
        ok: true,
        persistence: isPersistenceEnabled() ? "file" : "memory",
      }),
  },
  { method: "POST", pattern: /^\/api\/auth\/signup$/, handler: handleSignup },
  { method: "POST", pattern: /^\/api\/auth\/login$/, handler: handleLogin },
  { method: "POST", pattern: /^\/api\/auth\/logout$/, handler: handleLogout },
  { method: "GET", pattern: /^\/api\/auth\/me$/, handler: handleMe },
  { method: "GET", pattern: /^\/api\/dashboard$/, handler: handleDashboard },
  { method: "GET", pattern: /^\/api\/users$/, handler: handleUsers },
  { method: "GET", pattern: /^\/api\/projects$/, handler: handleProjectsList },
  { method: "POST", pattern: /^\/api\/projects$/, handler: handleProjectCreate },
  { method: "GET", pattern: /^\/api\/projects\/([^/]+)$/, handler: handleProjectDetail },
  { method: "POST", pattern: /^\/api\/projects\/([^/]+)\/members$/, handler: handleProjectAddMember },
  { method: "DELETE", pattern: /^\/api\/projects\/([^/]+)\/members\/([^/]+)$/, handler: handleProjectRemoveMember },
  { method: "GET", pattern: /^\/api\/tasks$/, handler: handleTasksList },
  { method: "POST", pattern: /^\/api\/tasks$/, handler: handleTaskCreate },
  { method: "PATCH", pattern: /^\/api\/tasks\/([^/]+)$/, handler: handleTaskUpdate },
];

export async function handleApiRequest(req, res, url) {
  try {
    const route = routeTable.find(
      (entry) => entry.method === req.method && entry.pattern.test(url.pathname),
    );

    if (!route) {
      return json(res, 404, { error: "Endpoint not found." });
    }

    const matches = url.pathname.match(route.pattern) || [];
    const session = resolveSessionUser(req);
    const ctx = {
      req,
      res,
      url,
      user: session?.user || null,
    };

    return await route.handler(ctx, ...matches.slice(1));
  } catch (error) {
    return sendError(res, error);
  }
}
