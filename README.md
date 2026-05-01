# Team Task Manager

Taskflow Board is a full-stack team task manager where admins can create projects, assign work, manage membership, and track progress while members update the status of their assigned tasks.

## What’s included

- Authentication with signup, login, logout, and cookie-based sessions
- Role-based access control with `ADMIN` and `MEMBER`
- Project creation and team member assignment
- Task creation, assignment, status updates, priorities, and due dates
- Dashboard cards for open work, completed work, overdue tasks, and project health
- REST API endpoints for auth, users, projects, tasks, and dashboard data
- Railway-ready deployment configuration

## Tech stack

- Backend: Node.js HTTP server with built-in crypto utilities
- Frontend: Vanilla JavaScript SPA with responsive CSS
- Database: File-backed JSON document store with in-memory fallback when the target path is not writable

## Roles

### Admin

- Creates projects
- Adds or removes project members
- Creates tasks and assigns them
- Updates any task
- Views all users, all tasks, and the full dashboard

### Member

- Views the projects they are part of
- Views tasks assigned to them
- Updates the status of tasks assigned to them

## Local setup

### Requirements

- Node.js `22.x`

### Run locally

1. Copy `.env.example` to `.env` if you want to customize the port or data path.
2. Start the app:

```bash
npm start
```

3. Open `http://localhost:3000`

### Seed demo data

If your `DATABASE_PATH` points to a writable file, you can preload demo data:

```bash
npm run seed
```

Demo accounts:

- Admin: `admin@taskflow.local` / `Admin123!`
- Member: `mina@taskflow.local` / `Member123!`

If the app cannot write to the configured data path, it automatically falls back to in-memory mode. In that case, use the signup flow directly after starting the server.

## Environment variables

```env
PORT=3000
DATABASE_PATH=./data/team-task-manager.json
NODE_ENV=development
SESSION_TTL_DAYS=14
```

## API overview

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Dashboard

- `GET /api/dashboard`

### Users

- `GET /api/users` (`ADMIN` only)

### Projects

- `GET /api/projects`
- `POST /api/projects` (`ADMIN` only)
- `GET /api/projects/:projectId`
- `POST /api/projects/:projectId/members` (`ADMIN` only)
- `DELETE /api/projects/:projectId/members/:userId` (`ADMIN` only)

### Tasks

- `GET /api/tasks`
- `POST /api/tasks` (`ADMIN` only)
- `PATCH /api/tasks/:taskId`

### Health

- `GET /api/health`

The health response includes a `persistence` value:

- `file`: the app can persist data to the configured `DATABASE_PATH`
- `memory`: the app is running without file persistence

## Railway deployment

1. Push this repo to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Set the following environment variables in Railway:

```env
NODE_ENV=production
DATABASE_PATH=/data/team-task-manager.json
SESSION_TTL_DAYS=14
```

4. Add a Railway volume and mount it at `/data`.
5. Deploy the service.
6. After deploy, open `/api/health` and confirm `persistence` is `file`.

`railway.json` is already included with:

- `npm start` as the start command
- `/api/health` as the health check path

## Suggested demo flow

Keep the video between 2 and 5 minutes:

1. Show the login/signup screen
2. Sign in as Admin
3. Create a project
4. Add a member to the project
5. Create and assign a task
6. Sign in as Member
7. Update the task status
8. Return to the dashboard and show the progress change

## Submission checklist

- Live URL: `Add your Railway URL here`
- GitHub repo: `Add your GitHub repo link here`
- README: included
- Demo video: `Add your Loom or Drive link here`

