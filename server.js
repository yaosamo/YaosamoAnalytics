import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const vercelBin = join(__dirname, "node_modules", ".bin", "vercel");
const PORT = Number(process.env.PORT || 4318);
const TEAM_ID = "team_PdY9NxADrySafNPPBKV1CyhW";
const PROJECTS = [
  "gong",
  "selfie-app",
  "personal-website",
  "creativeclub",
  "visuals",
  "games",
  "when-there",
  "qrcodemachine",
  "yaosamo-ip",
  "toska"
];
const WEB_ANALYTICS_TOKEN = process.env.VERCEL_BEARER_TOKEN || "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function utcStartOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function utcEndOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function lastDaysRange(days) {
  const now = new Date();
  const end = utcEndOfDay(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

function parseDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseRange(searchParams) {
  const preset = searchParams.get("preset");
  if (preset === "7d") {
    return { ...lastDaysRange(7), preset: "7d" };
  }

  if (preset === "30d" || !preset) {
    return { ...lastDaysRange(30), preset: "30d" };
  }

  if (preset === "custom") {
    const startInput = searchParams.get("start");
    const endInput = searchParams.get("end");
    const startDate = parseDateInput(startInput);
    const endDate = parseDateInput(endInput);

    if (!startDate || !endDate) {
      throw new Error("Custom range requires valid start and end dates.");
    }

    const start = utcStartOfDay(startDate);
    const end = utcEndOfDay(endDate);

    if (start > end) {
      throw new Error("Custom range start date must be on or before end date.");
    }

    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (days > 366) {
      throw new Error("Custom range cannot exceed 366 days.");
    }

    return { start, end, preset: "custom" };
  }

  throw new Error("Unsupported preset. Use 7d, 30d, or custom.");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function normalizeRecords(records) {
  const byProject = new Map(
    PROJECTS.map((project) => [
      project,
      {
        project,
        monthlyVisits: 0,
        monthlyUsers: null,
        activeDays: 0,
        latestDate: null,
        latestVisits: 0,
        series: []
      }
    ])
  );

  for (const record of records) {
    if (!byProject.has(record.projectName)) {
      continue;
    }
    const item = byProject.get(record.projectName);
    item.monthlyVisits += Number(record.pageviewCount || 0);
    item.activeDays += 1;
    item.latestDate = record.timestamp;
    item.latestVisits = Number(record.pageviewCount || 0);
    item.series.push({
      date: record.timestamp.slice(0, 10),
      visits: Number(record.pageviewCount || 0)
    });
  }

  return Array.from(byProject.values()).map((item) => ({
    ...item,
    series: item.series.sort((a, b) => a.date.localeCompare(b.date))
  }));
}

async function fetchMonthlyUsers(project, start, end) {
  if (!WEB_ANALYTICS_TOKEN) {
    return null;
  }

  const url = new URL("https://vercel.com/api/web-analytics/stats");
  url.searchParams.set("environment", "production");
  url.searchParams.set("filter", "{}");
  url.searchParams.set("from", start.toISOString());
  url.searchParams.set("limit", "250");
  url.searchParams.set("projectId", project);
  url.searchParams.set("teamId", TEAM_ID);
  url.searchParams.set("to", end.toISOString());
  url.searchParams.set("type", "device_type");
  url.searchParams.set("tz", "America/Los_Angeles");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${WEB_ANALYTICS_TOKEN}`
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return (payload.data || []).reduce((sum, item) => sum + Number(item.devices || 0), 0);
}

async function fetchAnalytics(range) {
  const { start, end, preset } = range;
  const query = `/v1/usage/analytics?from=${encodeURIComponent(start.toISOString())}&teamId=${TEAM_ID}&to=${encodeURIComponent(end.toISOString())}`;
  const { stdout } = await execFileAsync(
    vercelBin,
    ["api", query, "--raw"],
    {
      cwd: __dirname,
      env: process.env,
      maxBuffer: 5 * 1024 * 1024
    }
  );

  const data = JSON.parse(stdout);
  const projects = normalizeRecords(data);
  const userTotals = await Promise.all(
    PROJECTS.map(async (project) => [project, await fetchMonthlyUsers(project, start, end)])
  );
  const userMap = new Map(userTotals);

  return {
    range: {
      preset,
      start: start.toISOString(),
      end: end.toISOString()
    },
    projects: projects.map((project) => ({
      ...project,
      monthlyUsers: userMap.get(project.project) ?? null
    }))
  };
}

async function serveFile(response, pathname) {
  const target = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = join(publicDir, target);
  const content = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream"
  });
  response.end(content);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/dashboard") {
      const payload = await fetchAnalytics(parseRange(url.searchParams));
      sendJson(response, 200, payload);
      return;
    }

    await serveFile(response, url.pathname);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    sendJson(response, 500, {
      error: "Dashboard request failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, () => {
  console.log(`Yaosamo analytics dashboard running at http://localhost:${PORT}`);
});
