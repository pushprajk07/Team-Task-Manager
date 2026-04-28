import { HttpError } from "./http.js";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = normalizeString(value);
  return normalized === "" ? null : normalized;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function failValidation(errors) {
  throw new HttpError(400, "Validation failed.", errors);
}

export function validateSignupPayload(payload) {
  const errors = [];
  const name = normalizeString(payload.name);
  const email = normalizeString(payload.email).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";

  if (name.length < 2 || name.length > 80) {
    errors.push({ field: "name", message: "Name must be 2 to 80 characters." });
  }

  if (!isEmail(email)) {
    errors.push({ field: "email", message: "Enter a valid email address." });
  }

  if (password.length < 8 || password.length > 128) {
    errors.push({
      field: "password",
      message: "Password must be 8 to 128 characters.",
    });
  }

  if (errors.length > 0) {
    failValidation(errors);
  }

  return { name, email, password };
}

export function validateLoginPayload(payload) {
  const errors = [];
  const email = normalizeString(payload.email).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!isEmail(email)) {
    errors.push({ field: "email", message: "Enter a valid email address." });
  }

  if (!password) {
    errors.push({ field: "password", message: "Password is required." });
  }

  if (errors.length > 0) {
    failValidation(errors);
  }

  return { email, password };
}

export function validateProjectPayload(payload) {
  const errors = [];
  const name = normalizeString(payload.name);
  const description = normalizeString(payload.description || "");

  if (name.length < 3 || name.length > 80) {
    errors.push({
      field: "name",
      message: "Project name must be 3 to 80 characters.",
    });
  }

  if (description.length > 400) {
    errors.push({
      field: "description",
      message: "Description must be 400 characters or fewer.",
    });
  }

  if (errors.length > 0) {
    failValidation(errors);
  }

  return { name, description };
}

export function validateMemberPayload(payload) {
  const userId = normalizeString(payload.userId);

  if (!userId) {
    failValidation([{ field: "userId", message: "Select a team member." }]);
  }

  return { userId };
}

export function validateTaskCreatePayload(payload) {
  const errors = [];
  const projectId = normalizeString(payload.projectId);
  const title = normalizeString(payload.title);
  const description = normalizeString(payload.description || "");
  const assigneeId = normalizeNullableString(payload.assigneeId);
  const status = normalizeString(payload.status || "TODO").toUpperCase();
  const priority = normalizeString(payload.priority || "MEDIUM").toUpperCase();
  const dueDate = normalizeNullableString(payload.dueDate);

  if (!projectId) {
    errors.push({ field: "projectId", message: "Project is required." });
  }

  if (title.length < 3 || title.length > 120) {
    errors.push({
      field: "title",
      message: "Task title must be 3 to 120 characters.",
    });
  }

  if (description.length > 500) {
    errors.push({
      field: "description",
      message: "Description must be 500 characters or fewer.",
    });
  }

  if (!TASK_STATUSES.includes(status)) {
    errors.push({ field: "status", message: "Select a valid task status." });
  }

  if (!TASK_PRIORITIES.includes(priority)) {
    errors.push({
      field: "priority",
      message: "Select a valid task priority.",
    });
  }

  if (dueDate && !isDate(dueDate)) {
    errors.push({ field: "dueDate", message: "Due date must use YYYY-MM-DD." });
  }

  if (errors.length > 0) {
    failValidation(errors);
  }

  return { projectId, title, description, assigneeId, status, priority, dueDate };
}

export function validateTaskUpdatePayload(payload) {
  const errors = [];
  const update = {};

  if (payload.title !== undefined) {
    const title = normalizeString(payload.title);
    if (title.length < 3 || title.length > 120) {
      errors.push({
        field: "title",
        message: "Task title must be 3 to 120 characters.",
      });
    } else {
      update.title = title;
    }
  }

  if (payload.description !== undefined) {
    const description = normalizeString(payload.description || "");
    if (description.length > 500) {
      errors.push({
        field: "description",
        message: "Description must be 500 characters or fewer.",
      });
    } else {
      update.description = description;
    }
  }

  if (payload.status !== undefined) {
    const status = normalizeString(payload.status).toUpperCase();
    if (!TASK_STATUSES.includes(status)) {
      errors.push({
        field: "status",
        message: "Select a valid task status.",
      });
    } else {
      update.status = status;
    }
  }

  if (payload.priority !== undefined) {
    const priority = normalizeString(payload.priority).toUpperCase();
    if (!TASK_PRIORITIES.includes(priority)) {
      errors.push({
        field: "priority",
        message: "Select a valid task priority.",
      });
    } else {
      update.priority = priority;
    }
  }

  if (payload.assigneeId !== undefined) {
    const assigneeId = normalizeNullableString(payload.assigneeId);
    update.assigneeId = assigneeId;
  }

  if (payload.dueDate !== undefined) {
    const dueDate = normalizeNullableString(payload.dueDate);

    if (dueDate && !isDate(dueDate)) {
      errors.push({
        field: "dueDate",
        message: "Due date must use YYYY-MM-DD.",
      });
    } else {
      update.dueDate = dueDate;
    }
  }

  if (payload.projectId !== undefined) {
    errors.push({
      field: "projectId",
      message: "Project cannot be changed after task creation.",
    });
  }

  if (errors.length > 0) {
    failValidation(errors);
  }

  if (Object.keys(update).length === 0) {
    failValidation([{ field: "body", message: "Provide at least one field to update." }]);
  }

  return update;
}
