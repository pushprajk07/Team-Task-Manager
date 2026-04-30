const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

const state = {
  authChecked: false,
  user: null,
  notice: null,
  routeLoading: false,
  dashboard: null,
  projects: null,
  projectDetail: null,
  tasks: null,
  users: null,
};

const app = document.querySelector("#app");
let noticeTimeout = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "No due date";
  }

  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

function isOverdue(task) {
  if (!task?.dueDate || task.status === "DONE") {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return task.dueDate < today;
}

function getInitials(name) {
  return String(name || "TT")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function setNotice(type, message) {
  state.notice = { type, message };
  render();

  window.clearTimeout(noticeTimeout);
  noticeTimeout = window.setTimeout(() => {
    state.notice = null;
    render();
  }, 3200);
}

function clearCaches() {
  state.dashboard = null;
  state.projects = null;
  state.projectDetail = null;
  state.tasks = null;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    credentials: "same-origin",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(payload?.error || "Request failed.");
    error.details = payload?.details || null;
    error.status = response.status;
    throw error;
  }

  return payload;
}

const api = {
  me: () => apiRequest("/api/auth/me"),
  signup: (body) => apiRequest("/api/auth/signup", { method: "POST", body }),
  login: (body) => apiRequest("/api/auth/login", { method: "POST", body }),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  dashboard: () => apiRequest("/api/dashboard"),
  users: () => apiRequest("/api/users"),
  projects: () => apiRequest("/api/projects"),
  project: (projectId) => apiRequest(`/api/projects/${projectId}`),
  createProject: (body) => apiRequest("/api/projects", { method: "POST", body }),
  addMember: (projectId, body) =>
    apiRequest(`/api/projects/${projectId}/members`, { method: "POST", body }),
  removeMember: (projectId, userId) =>
    apiRequest(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
  tasks: () => apiRequest("/api/tasks"),
  createTask: (body) => apiRequest("/api/tasks", { method: "POST", body }),
  updateTask: (taskId, body) =>
    apiRequest(`/api/tasks/${taskId}`, { method: "PATCH", body }),
};

function getRoute() {
  const rawHash = window.location.hash.replace(/^#/, "") || "/dashboard";
  const normalized = rawHash.startsWith("/") ? rawHash : `/${rawHash}`;
  const parts = normalized.split("/").filter(Boolean);

  if (parts[0] === "login") {
    return { section: "login" };
  }

  if (parts[0] === "signup") {
    return { section: "signup" };
  }

  if (parts[0] === "projects" && parts[1]) {
    return { section: "project-detail", projectId: parts[1] };
  }

  if (parts[0] === "projects") {
    return { section: "projects" };
  }

  if (parts[0] === "tasks") {
    return { section: "tasks" };
  }

  return { section: "dashboard" };
}

function navigate(path) {
  if (window.location.hash !== `#${path}`) {
    window.location.hash = path;
  }
}

function normalizeAuthRoute(route) {
  if (!state.authChecked) {
    return;
  }

  if (!state.user && !["login", "signup"].includes(route.section)) {
    navigate("/login");
  }

  if (state.user && ["login", "signup"].includes(route.section)) {
    navigate("/dashboard");
  }
}

async function loadRouteData(route) {
  if (!state.user) {
    return;
  }

  if (route.section === "dashboard") {
    state.dashboard = await api.dashboard();
    return;
  }

  if (route.section === "projects") {
    state.projects = (await api.projects()).projects;
    if (state.user.role === "ADMIN") {
      state.users = (await api.users()).users;
    }
    return;
  }

  if (route.section === "project-detail") {
    state.projects = state.projects || (await api.projects()).projects;
    state.projectDetail = await api.project(route.projectId);
    if (state.user.role === "ADMIN") {
      state.users = (await api.users()).users;
    }
    return;
  }

  if (route.section === "tasks") {
    state.tasks = (await api.tasks()).tasks;
    return;
  }
}

async function syncRoute() {
  const route = getRoute();
  normalizeAuthRoute(route);
  const nextRoute = getRoute();

  if (!state.authChecked) {
    render();
    return;
  }

  if (!state.user && !["login", "signup"].includes(nextRoute.section)) {
    render();
    return;
  }

  state.routeLoading = true;
  render();

  try {
    await loadRouteData(nextRoute);
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      clearCaches();
      navigate("/login");
      setNotice("error", "Your session expired. Please sign in again.");
      return;
    }

    setNotice("error", error.message);
  } finally {
    state.routeLoading = false;
    render();
  }
}

async function bootstrap() {
  try {
    const response = await api.me();
    state.user = response.user;
  } catch (error) {
    state.user = null;
  } finally {
    state.authChecked = true;
    await syncRoute();
  }
}

function renderNotice() {
  if (!state.notice) {
    return "";
  }

  return `
    <div class="notice ${escapeHtml(state.notice.type)}">
      <span>${escapeHtml(state.notice.message)}</span>
      <button class="button ghost" data-action="dismiss-notice" type="button">Close</button>
    </div>
  `;
}

function renderAuthPage(mode) {
  const isSignup = mode === "signup";

  return `
    <section class="auth-shell">
      <div class="auth-card">
        <span class="eyebrow">Taskflow Board</span>
        <h1 class="auth-title">${isSignup ? "Create your workspace account" : "Welcome back to the board"}</h1>
        <p class="auth-copy">
          ${isSignup ? "The first signup becomes the Admin. Every signup after that joins as a Member." : "Sign in to manage projects, stay on top of tasks, and keep overdue work visible."}
        </p>
        <form class="form-grid" data-form="${isSignup ? "signup" : "login"}">
          ${isSignup ? `
            <div class="field">
              <label for="name">Full name</label>
              <input class="input" id="name" name="name" placeholder="Nina Rivera" required />
            </div>
          ` : ""}
          <div class="field">
            <label for="email">Email</label>
            <input class="input" id="email" name="email" type="email" placeholder="you@team.com" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input class="input" id="password" name="password" type="password" placeholder="At least 8 characters" required />
          </div>
          <div class="button-row">
            <button class="button" type="submit">${isSignup ? "Create account" : "Sign in"}</button>
            <a class="inline-link" href="#/${isSignup ? "login" : "signup"}">
              ${isSignup ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </a>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderSidebar(route) {
  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/projects", label: "Projects" },
    { href: "/tasks", label: state.user?.role === "ADMIN" ? "All Tasks" : "My Tasks" },
  ];

  return `
    <aside class="sidebar">
      <div class="brand-block">
        <div class="brand-mark">TF</div>
        <div class="brand-title">Taskflow Board</div>
        <div class="muted">Projects, ownership, and progress in one place.</div>
      </div>
      <nav class="nav">
        ${navItems
          .map(
            (item) => `
              <a class="nav-link ${route.section.startsWith(item.href.slice(1)) || (route.section === "project-detail" && item.href === "/projects") ? "active" : ""}" href="#${item.href}">
                <span>${escapeHtml(item.label)}</span>
                ${item.href === "/projects" && state.projects?.length ? `<span class="nav-badge">${state.projects.length}</span>` : ""}
              </a>
            `,
          )
          .join("")}
      </nav>
      <div class="sidebar-footer">
        <div>
          <div class="muted">Signed in as</div>
          <div><strong>${escapeHtml(state.user?.name || "")}</strong></div>
          <div class="muted">${escapeHtml(state.user?.email || "")}</div>
        </div>
        <div class="button-row">
          <span class="role-badge ${state.user?.role === "ADMIN" ? "admin" : "member"}">${escapeHtml(state.user?.role || "")}</span>
          <button class="button ghost" data-action="logout" type="button">Sign out</button>
        </div>
      </div>
    </aside>
  `;
}

function renderTopbar(route) {
  const titles = {
    dashboard: {
      title: "Work summary at a glance",
      copy: state.user?.role === "ADMIN" ? "Track every project, spot overdue work, and rebalance the team." : "See what needs attention, what is blocked, and what is already moving.",
    },
    projects: {
      title: "Project portfolio",
      copy: "Keep every initiative scoped, staffed, and visibly moving forward.",
    },
    "project-detail": {
      title: state.projectDetail?.project?.name || "Project details",
      copy: state.projectDetail?.project?.description || "Dive into members, deadlines, and task progress.",
    },
    tasks: {
      title: state.user?.role === "ADMIN" ? "Task command center" : "My assigned tasks",
      copy: state.user?.role === "ADMIN" ? "Update ownership, priorities, and status across every project." : "Move your tasks through the pipeline and keep due dates visible.",
    },
  };

  const config = titles[route.section] || titles.dashboard;

  return `
    <header class="topbar">
      <div>
        <div class="hero-kicker">Team Task Manager</div>
        <h1 class="page-title">${escapeHtml(config.title)}</h1>
        <p class="page-copy">${escapeHtml(config.copy)}</p>
      </div>
      <div class="topbar-user">
        <div class="avatar">${escapeHtml(getInitials(state.user?.name || ""))}</div>
        <div>
          <strong>${escapeHtml(state.user?.name || "")}</strong>
          <div class="muted">${escapeHtml(state.user?.role || "")}</div>
        </div>
      </div>
    </header>
  `;
}

function renderStats(stats) {
  if (!stats) {
    return `<div class="loading">Loading metrics...</div>`;
  }

  const cards = [
    { label: "Projects", value: stats.projectsCount },
    { label: "Open tasks", value: stats.openTasks },
    { label: "Completed tasks", value: stats.completedTasks },
    { label: "Overdue tasks", value: stats.overdueTasks },
  ];

  return `
    <section class="stat-grid">
      ${cards
        .map(
          (card) => `
            <article class="stat-card">
              <div class="stat-label">${escapeHtml(card.label)}</div>
              <div class="stat-value">${escapeHtml(card.value)}</div>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderStatusBreakdown(items) {
  if (!items?.length) {
    return `<div class="empty-state">No task data yet.</div>`;
  }

  return `
    <div class="stack">
      ${items
        .map(
          (item) => `
            <div>
              <div class="meta-row">
                <span class="chip status-${escapeHtml(item.status)}">${escapeHtml(item.status.replaceAll("_", " "))}</span>
                <strong>${escapeHtml(item.count)}</strong>
              </div>
              <div class="progress" style="margin-top: 10px;">
                <span style="width: ${Math.min(100, item.count * 10 || 6)}%"></span>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderHighlightedTasks(tasks) {
  if (!tasks?.length) {
    return `<div class="empty-state">No tasks yet. Create one from a project page to get started.</div>`;
  }

  return `
    <div class="task-list">
      ${tasks
        .map(
          (task) => `
            <article class="list-item">
              <div class="split-title">
                <div>
                  <strong>${escapeHtml(task.title)}</strong>
                  <div class="muted">${escapeHtml(task.projectName || "General")}</div>
                </div>
                <div class="chip-row">
                  <span class="chip status-${escapeHtml(task.status)}">${escapeHtml(task.status.replaceAll("_", " "))}</span>
                  <span class="chip priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
                </div>
              </div>
              <div class="meta-row">
                <span class="${isOverdue(task) ? "danger-text" : "muted"}">Due ${escapeHtml(formatDate(task.dueDate))}</span>
                <span class="muted">${escapeHtml(task.assigneeName || "Unassigned")}</span>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderProjectCards(projects) {
  if (!projects?.length) {
    return `<div class="empty-state">No projects yet. Admins can create the first one from the Projects screen.</div>`;
  }

  return `
    <div class="project-list">
      ${projects
        .map(
          (project) => `
            <a class="project-card" href="#/projects/${escapeHtml(project.id)}">
              <div class="split-title">
                <div>
                  <strong>${escapeHtml(project.name)}</strong>
                  <div class="muted">${escapeHtml(project.description || "No description yet.")}</div>
                </div>
                <span class="chip">${escapeHtml(project.memberCount)} members</span>
              </div>
              <div class="meta-grid">
                <span class="muted">${escapeHtml(project.totalTasks)} tasks</span>
                <span class="muted">${escapeHtml(project.overdueTasks)} overdue</span>
                <span class="muted">${escapeHtml(project.completedTasks)} done</span>
              </div>
              <div class="progress"><span style="width: ${escapeHtml(project.progress)}%"></span></div>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDashboardPage() {
  return `
    <section class="hero-card">
      <span class="eyebrow">${state.user?.role === "ADMIN" ? `Team size: ${escapeHtml(state.dashboard?.stats?.teamCount || 0)}` : "Personal workflow"}</span>
      ${renderStats(state.dashboard?.stats)}
    </section>
    <section class="two-column">
      <article class="card">
        <h2 class="section-title">Status breakdown</h2>
        ${renderStatusBreakdown(state.dashboard?.statusBreakdown)}
      </article>
      <article class="card">
        <h2 class="section-title">Priority spotlight</h2>
        ${renderHighlightedTasks(state.dashboard?.highlightedTasks)}
      </article>
    </section>
    <section class="card">
      <h2 class="section-title">Project health</h2>
      ${renderProjectCards(state.dashboard?.projects)}
    </section>
  `;
}

function renderProjectCreateCard() {
  if (state.user?.role !== "ADMIN") {
    return "";
  }

  return `
    <article class="card">
      <h2 class="section-title">Create a new project</h2>
      <form class="form-grid" data-form="create-project">
        <div class="field">
          <label for="project-name">Project name</label>
          <input class="input" id="project-name" name="name" placeholder="Growth revamp" required />
        </div>
        <div class="field">
          <label for="project-description">Description</label>
          <textarea class="textarea" id="project-description" name="description" placeholder="What does this project need to deliver?"></textarea>
        </div>
        <div class="button-row">
          <button class="button secondary" type="submit">Create project</button>
        </div>
      </form>
    </article>
  `;
}

function renderProjectsPage() {
  return `
    <section class="card-grid">
      <article class="card">
        <h2 class="section-title">Active projects</h2>
        ${state.projects ? renderProjectCards(state.projects) : `<div class="loading">Loading projects...</div>`}
      </article>
      ${renderProjectCreateCard()}
    </section>
  `;
}

function renderMemberList(detail) {
  if (!detail?.members?.length) {
    return `<div class="empty-state">No members assigned to this project yet.</div>`;
  }

  return `
    <div class="member-list">
      ${detail.members
        .map(
          (member) => `
            <article class="member-item">
              <div class="split-title">
                <div>
                  <strong>${escapeHtml(member.name)}</strong>
                  <div class="muted">${escapeHtml(member.email)}</div>
                </div>
                <div class="chip-row">
                  <span class="role-badge ${member.role === "ADMIN" ? "admin" : "member"}">${escapeHtml(member.role)}</span>
                  <span class="chip">${escapeHtml(member.activeTaskCount)} active</span>
                </div>
              </div>
              ${state.user?.role === "ADMIN" ? `
                <div class="button-row">
                  <button class="button ghost" type="button" data-action="remove-member" data-project-id="${escapeHtml(detail.project.id)}" data-user-id="${escapeHtml(member.id)}">
                    Remove
                  </button>
                </div>
              ` : ""}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMemberManagement(detail) {
  if (state.user?.role !== "ADMIN") {
    return "";
  }

  const currentMemberIds = new Set(detail.members.map((member) => member.id));
  const availableUsers = (state.users || []).filter((user) => !currentMemberIds.has(user.id));

  return `
    <article class="card">
      <h2 class="section-title">Team management</h2>
      ${availableUsers.length ? `
        <form class="form-grid" data-form="add-member" data-project-id="${escapeHtml(detail.project.id)}">
          <div class="field">
            <label for="userId">Add a member</label>
            <select class="select" name="userId" id="userId" required>
              <option value="">Select a user</option>
              ${availableUsers
                .map(
                  (user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} • ${escapeHtml(user.role)}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div class="button-row">
            <button class="button ghost" type="submit">Add to project</button>
          </div>
        </form>
      ` : `
        <div class="empty-state">Everyone in the workspace is already part of this project.</div>
      `}
      <div style="margin-top: 16px;">
        ${renderMemberList(detail)}
      </div>
    </article>
  `;
}

function renderTaskBoard(detail) {
  if (!detail?.tasks) {
    return `<div class="loading">Loading tasks...</div>`;
  }

  return `
    <section class="board">
      ${TASK_STATUSES.map((status) => {
        const tasks = detail.tasks.filter((task) => task.status === status);
        return `
          <article class="board-column">
            <div class="split-title">
              <strong>${escapeHtml(status.replaceAll("_", " "))}</strong>
              <span class="chip">${escapeHtml(tasks.length)}</span>
            </div>
            ${tasks.length ? tasks.map((task) => renderTaskCard(task, detail.members)).join("") : `<div class="empty-state">No tasks here yet.</div>`}
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function renderTaskCard(task, members) {
  const isAdmin = state.user?.role === "ADMIN";
  const canUpdate = isAdmin || task.assigneeId === state.user?.id;

  return `
    <article class="task-card">
      <div class="chip-row">
        <span class="chip priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
        <span class="chip ${isOverdue(task) ? "priority-HIGH" : ""}">${escapeHtml(formatDate(task.dueDate))}</span>
      </div>
      <div>
        <h3 class="task-title">${escapeHtml(task.title)}</h3>
        <p class="task-copy">${escapeHtml(task.description || "No extra notes for this task.")}</p>
      </div>
      <div class="task-meta">
        <span class="muted">Assigned to ${escapeHtml(task.assigneeName || "Unassigned")}</span>
        <span class="muted">Created by ${escapeHtml(task.createdByName || "System")}</span>
      </div>
      ${canUpdate ? `
        <form class="task-edit-grid" data-form="update-task" data-task-id="${escapeHtml(task.id)}">
          <div class="compact-grid ${isAdmin ? "three" : ""}">
            <div class="field">
              <label>Status</label>
              <select class="select" name="status">
                ${TASK_STATUSES.map((status) => `<option value="${status}" ${status === task.status ? "selected" : ""}>${escapeHtml(status.replaceAll("_", " "))}</option>`).join("")}
              </select>
            </div>
            ${isAdmin ? `
              <div class="field">
                <label>Priority</label>
                <select class="select" name="priority">
                  ${TASK_PRIORITIES.map((priority) => `<option value="${priority}" ${priority === task.priority ? "selected" : ""}>${escapeHtml(priority)}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label>Assignee</label>
                <select class="select" name="assigneeId">
                  <option value="">Unassigned</option>
                  ${members.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === task.assigneeId ? "selected" : ""}>${escapeHtml(member.name)}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label>Due date</label>
                <input class="input" name="dueDate" type="date" value="${escapeHtml(task.dueDate || "")}" />
              </div>
            ` : ""}
          </div>
          <div class="button-row">
            <button class="button ghost" type="submit">Save task</button>
          </div>
        </form>
      ` : `
        <div class="empty-state">Only admins or the assigned member can move this task.</div>
      `}
    </article>
  `;
}

function renderTaskCreateCard(detail) {
  if (state.user?.role !== "ADMIN") {
    return "";
  }

  return `
    <article class="card">
      <h2 class="section-title">Create a task</h2>
      <form class="form-grid" data-form="create-task" data-project-id="${escapeHtml(detail.project.id)}">
        <div class="field">
          <label for="task-title">Task title</label>
          <input class="input" id="task-title" name="title" placeholder="Ship project setup flow" required />
        </div>
        <div class="field">
          <label for="task-description">Description</label>
          <textarea class="textarea" id="task-description" name="description" placeholder="Add context, acceptance notes, or blockers."></textarea>
        </div>
        <div class="compact-grid three">
          <div class="field">
            <label for="task-priority">Priority</label>
            <select class="select" id="task-priority" name="priority">
              ${TASK_PRIORITIES.map((priority) => `<option value="${priority}">${escapeHtml(priority)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="task-status">Starting status</label>
            <select class="select" id="task-status" name="status">
              ${TASK_STATUSES.map((status) => `<option value="${status}" ${status === "TODO" ? "selected" : ""}>${escapeHtml(status.replaceAll("_", " "))}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="task-assignee">Assignee</label>
            <select class="select" id="task-assignee" name="assigneeId">
              <option value="">Unassigned</option>
              ${detail.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="task-due-date">Due date</label>
          <input class="input" id="task-due-date" name="dueDate" type="date" />
        </div>
        <div class="button-row">
          <button class="button secondary" type="submit">Create task</button>
        </div>
      </form>
    </article>
  `;
}

function renderProjectDetailPage() {
  const detail = state.projectDetail;

  if (!detail) {
    return `<div class="loading">Loading project details...</div>`;
  }

  const summaryCards = [
    { label: "Total tasks", value: detail.summary.total },
    { label: "In progress", value: detail.summary.inProgress },
    { label: "Review", value: detail.summary.review },
    { label: "Overdue", value: detail.summary.overdue },
  ];

  return `
    <section class="hero-card">
      <div class="hero-strip">
        <span class="chip">${escapeHtml(detail.project.memberCount)} members</span>
        <span class="chip">${escapeHtml(detail.project.totalTasks)} tasks</span>
        <span class="chip">${escapeHtml(detail.project.progress)}% complete</span>
      </div>
      <div class="stat-grid">
        ${summaryCards
          .map(
            (card) => `
              <article class="stat-card">
                <div class="stat-label">${escapeHtml(card.label)}</div>
                <div class="stat-value">${escapeHtml(card.value)}</div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
    <section class="two-column">
      ${renderMemberManagement(detail) || `<article class="card"><h2 class="section-title">Team</h2>${renderMemberList(detail)}</article>`}
      ${renderTaskCreateCard(detail) || `<article class="card"><h2 class="section-title">Collaboration rules</h2><div class="empty-state">Members can view project tasks and update the status of the tasks assigned to them.</div></article>`}
    </section>
    <section class="card">
      <h2 class="section-title">Task board</h2>
      ${renderTaskBoard(detail)}
    </section>
  `;
}

function renderTasksPage() {
  if (!state.tasks) {
    return `<div class="loading">Loading tasks...</div>`;
  }

  return `
    <section class="card">
      <h2 class="section-title">${state.user?.role === "ADMIN" ? "Cross-project task view" : "Assigned task list"}</h2>
      ${state.tasks.length
        ? `
          <div class="task-list">
            ${state.tasks
              .map(
                (task) => `
                  <article class="list-item">
                    <div class="split-title">
                      <div>
                        <strong>${escapeHtml(task.title)}</strong>
                        <div class="muted">${escapeHtml(task.projectName || "")}</div>
                      </div>
                      <div class="chip-row">
                        <span class="chip status-${escapeHtml(task.status)}">${escapeHtml(task.status.replaceAll("_", " "))}</span>
                        <span class="chip priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
                      </div>
                    </div>
                    <div class="meta-row">
                      <span class="${isOverdue(task) ? "danger-text" : "muted"}">Due ${escapeHtml(formatDate(task.dueDate))}</span>
                      <span class="muted">${escapeHtml(task.assigneeName || "Unassigned")}</span>
                    </div>
                    <div class="button-row">
                      <a class="button ghost" href="#/projects/${escapeHtml(task.projectId)}">Open project</a>
                    </div>
                  </article>
                `,
              )
              .join("")}
          </div>
        `
        : `<div class="empty-state">No tasks found for this view yet.</div>`}
    </section>
  `;
}

function renderShell(route, content) {
  return `
    <div class="shell">
      ${renderSidebar(route)}
      <main class="content">
        ${renderTopbar(route)}
        ${renderNotice()}
        ${state.routeLoading ? `<div class="loading">Refreshing workspace…</div>` : ""}
        ${content}
      </main>
    </div>
  `;
}

function render() {
  const route = getRoute();

  if (!state.authChecked) {
    app.innerHTML = `
      <section class="auth-shell">
        <div class="auth-card">
          <div class="loading">Loading workspace…</div>
        </div>
      </section>
    `;
    return;
  }

  if (!state.user) {
    app.innerHTML = renderAuthPage(route.section === "signup" ? "signup" : "login");
    return;
  }

  let content = renderDashboardPage();

  if (route.section === "projects") {
    content = renderProjectsPage();
  } else if (route.section === "project-detail") {
    content = renderProjectDetailPage();
  } else if (route.section === "tasks") {
    content = renderTasksPage();
  }

  app.innerHTML = renderShell(route, content);
}

async function handleAuthSubmit(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const action = form.dataset.form;
  const response = action === "signup" ? await api.signup(payload) : await api.login(payload);

  state.user = response.user;
  clearCaches();
  setNotice("success", action === "signup" ? "Account created. You are signed in." : "Welcome back.");
  navigate("/dashboard");
}

async function handleCreateProject(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const response = await api.createProject(payload);

  clearCaches();
  setNotice("success", "Project created.");
  form.reset();
  navigate(`/projects/${response.project.id}`);
}

async function handleAddMember(form) {
  const projectId = form.dataset.projectId;
  const formData = new FormData(form);
  await api.addMember(projectId, Object.fromEntries(formData.entries()));

  clearCaches();
  setNotice("success", "Member added to the project.");
  await syncRoute();
}

async function handleCreateTask(form) {
  const projectId = form.dataset.projectId;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.projectId = projectId;

  await api.createTask(payload);
  clearCaches();
  setNotice("success", "Task created.");
  form.reset();
  await syncRoute();
}

async function handleUpdateTask(form) {
  const taskId = form.dataset.taskId;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  await api.updateTask(taskId, payload);

  clearCaches();
  setNotice("success", "Task updated.");
  await syncRoute();
}

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("form");

  if (!form?.dataset.form) {
    return;
  }

  event.preventDefault();

  try {
    if (form.dataset.form === "signup" || form.dataset.form === "login") {
      await handleAuthSubmit(form);
      return;
    }

    if (form.dataset.form === "create-project") {
      await handleCreateProject(form);
      return;
    }

    if (form.dataset.form === "add-member") {
      await handleAddMember(form);
      return;
    }

    if (form.dataset.form === "create-task") {
      await handleCreateTask(form);
      return;
    }

    if (form.dataset.form === "update-task") {
      await handleUpdateTask(form);
    }
  } catch (error) {
    setNotice("error", error.message);
  }
});

document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-action]");

  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;

  if (action === "dismiss-notice") {
    state.notice = null;
    render();
    return;
  }

  if (action === "logout") {
    await api.logout().catch(() => {});
    state.user = null;
    clearCaches();
    navigate("/login");
    render();
    return;
  }

  if (action === "remove-member") {
    const projectId = trigger.dataset.projectId;
    const userId = trigger.dataset.userId;

    if (!window.confirm("Remove this member and unassign their tasks on this project?")) {
      return;
    }

    try {
      await api.removeMember(projectId, userId);
      clearCaches();
      setNotice("success", "Member removed from the project.");
      await syncRoute();
    } catch (error) {
      setNotice("error", error.message);
    }
  }
});

window.addEventListener("hashchange", () => {
  syncRoute();
});

bootstrap();
