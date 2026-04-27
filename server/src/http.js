export class HttpError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

export function noContent(res) {
  res.writeHead(204);
  res.end();
}

export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 1024 * 1024) {
      throw new HttpError(413, "Request body is too large.");
    }

    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export function sendError(res, error) {
  if (error instanceof HttpError) {
    return json(res, error.statusCode, {
      error: error.message,
      details: error.details,
    });
  }

  console.error(error);

  return json(res, 500, {
    error: "Something went wrong on the server.",
  });
}
