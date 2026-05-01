import { hashPassword } from "../auth.js";
import { closeDatabase, createId, nowIso, replaceStore, todayIso } from "../db.js";

function addDays(baseDate, days) {
  const nextDate = new Date(baseDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

const now = nowIso();
const today = todayIso();

const admin = {
  id: createId("usr"),
  name: "Aisha Admin",
  email: "admin@taskflow.local",
  passwordHash: hashPassword("Admin123!"),
  role: "ADMIN",
  createdAt: now,
  updatedAt: now,
};

const memberOne = {
  id: createId("usr"),
  name: "Mina Member",
  email: "mina@taskflow.local",
  passwordHash: hashPassword("Member123!"),
  role: "MEMBER",
  createdAt: now,
  updatedAt: now,
};

const memberTwo = {
  id: createId("usr"),
  name: "Rohan Member",
  email: "rohan@taskflow.local",
  passwordHash: hashPassword("Member123!"),
  role: "MEMBER",
  createdAt: now,
  updatedAt: now,
};

const projectAlpha = {
  id: createId("prj"),
  name: "Launch Sprint",
  description: "Prepare the first customer-facing release with a tight delivery window.",
  createdById: admin.id,
  createdAt: now,
  updatedAt: now,
};

const projectBeta = {
  id: createId("prj"),
  name: "Operations Upgrade",
  description: "Improve internal workflows, onboarding docs, and recurring maintenance tasks.",
  createdById: admin.id,
  createdAt: now,
  updatedAt: now,
};

const tasks = [
  {
    id: createId("tsk"),
    projectId: projectAlpha.id,
    title: "Design handoff review",
    description: "Confirm the final UI checklist and export notes before development handoff.",
    status: "IN_PROGRESS",
    priority: "HIGH",
    dueDate: addDays(today, 2),
    assigneeId: memberOne.id,
  },
  {
    id: createId("tsk"),
    projectId: projectAlpha.id,
    title: "QA smoke checklist",
    description: "Document the top release-risk flows and convert them into a repeatable smoke pass.",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: addDays(today, 4),
    assigneeId: memberTwo.id,
  },
  {
    id: createId("tsk"),
    projectId: projectBeta.id,
    title: "Onboarding doc refresh",
    description: "Rewrite the setup guide so new teammates can get productive in under 30 minutes.",
    status: "REVIEW",
    priority: "MEDIUM",
    dueDate: addDays(today, -1),
    assigneeId: memberOne.id,
  },
  {
    id: createId("tsk"),
    projectId: projectBeta.id,
    title: "Weekly ops report",
    description: "Close out the current reporting cycle and capture blockers for next week.",
    status: "DONE",
    priority: "LOW",
    dueDate: addDays(today, -3),
    assigneeId: admin.id,
  },
];

replaceStore({
  users: [admin, memberOne, memberTwo],
  projects: [projectAlpha, projectBeta],
  projectMembers: [
    { id: createId("pm"), projectId: projectAlpha.id, userId: admin.id, createdAt: now },
    { id: createId("pm"), projectId: projectAlpha.id, userId: memberOne.id, createdAt: now },
    { id: createId("pm"), projectId: projectAlpha.id, userId: memberTwo.id, createdAt: now },
    { id: createId("pm"), projectId: projectBeta.id, userId: admin.id, createdAt: now },
    { id: createId("pm"), projectId: projectBeta.id, userId: memberOne.id, createdAt: now },
  ],
  tasks: tasks.map((task) => ({
    ...task,
    createdById: admin.id,
    createdAt: now,
    updatedAt: now,
  })),
  sessions: [],
});

console.log("Seed data created.");
console.log("Admin login: admin@taskflow.local / Admin123!");
console.log("Member login: mina@taskflow.local / Member123!");

closeDatabase();
process.exit(0);
