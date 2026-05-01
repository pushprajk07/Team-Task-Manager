const baseUrl = process.env.BASE_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload };
}

async function main() {
  const health = await request("/api/health");

  if (!health.response.ok || !health.payload?.ok) {
    throw new Error("Health endpoint failed.");
  }

  console.log("Smoke check passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
