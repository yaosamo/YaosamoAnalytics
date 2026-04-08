const TEAM_ID = "team_PdY9NxADrySafNPPBKV1CyhW";

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

function eachDay(start, end) {
  const days = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

async function fetchProjects(token) {
  const url = new URL("https://api.vercel.com/v10/projects");
  url.searchParams.set("teamId", TEAM_ID);
  url.searchParams.set("limit", "100");

  const payload = await fetchJson(url, token);
  const projects = Array.isArray(payload) ? payload : payload.projects || [];

  return projects
    .map((project) => ({
      id: project.id,
      name: project.name
    }))
    .filter((project) => project.id && project.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeRecords(records, availableProjects, range) {
  const dates = eachDay(range.start, range.end);
  const byProject = new Map(
    availableProjects.map((project) => [
      project.name,
      {
        project: project.name,
        projectId: project.id,
        monthlyVisits: 0,
        monthlyUsers: null,
        activeDays: 0,
        latestDate: null,
        latestVisits: 0,
        seriesMap: new Map()
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
    item.seriesMap.set(record.timestamp.slice(0, 10), Number(record.pageviewCount || 0));
  }

  return Array.from(byProject.values()).map((item) => ({
    ...item,
    series: dates.map((date) => ({
      date,
      visits: item.seriesMap.get(date) || 0
    }))
  }));
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${text.slice(0, 120)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 120)}`);
  }
}

async function fetchMonthlyUsers(project, start, end, token) {
  const url = new URL("https://vercel.com/api/web-analytics/stats");
  url.searchParams.set("environment", "production");
  url.searchParams.set("filter", "{}");
  url.searchParams.set("from", start.toISOString());
  url.searchParams.set("limit", "250");
  url.searchParams.set("projectId", project.id);
  url.searchParams.set("teamId", TEAM_ID);
  url.searchParams.set("to", end.toISOString());
  url.searchParams.set("type", "device_type");
  url.searchParams.set("tz", "America/Los_Angeles");

  try {
    const payload = await fetchJson(url, token);
    return (payload.data || []).reduce((sum, item) => sum + Number(item.devices || 0), 0);
  } catch {
    return null;
  }
}

async function fetchAnalytics(token, range) {
  const { start, end, preset } = range;
  const availableProjects = await fetchProjects(token);
  const usageUrl = new URL("https://api.vercel.com/v1/usage/analytics");
  usageUrl.searchParams.set("from", start.toISOString());
  usageUrl.searchParams.set("teamId", TEAM_ID);
  usageUrl.searchParams.set("to", end.toISOString());

  const usageData = await fetchJson(usageUrl, token);
  const projects = normalizeRecords(usageData, availableProjects, range);
  const userTotals = await Promise.all(
    availableProjects.map(async (project) => [project.name, await fetchMonthlyUsers(project, start, end, token)])
  );
  const userMap = new Map(userTotals);

  return {
    availableProjects: availableProjects.map((project) => project.name),
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

export default async function handler(request, response) {
  const token = process.env.VERCEL_BEARER_TOKEN || "";

  if (!token) {
    response.status(500).json({
      error: "Dashboard request failed",
      message: "Missing VERCEL_BEARER_TOKEN environment variable"
    });
    return;
  }

  try {
    const requestUrl = new URL(request.url, "https://yaosamo-analytics.local");
    const payload = await fetchAnalytics(token, parseRange(requestUrl.searchParams));
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    response.status(200).json(payload);
  } catch (error) {
    response.status(500).json({
      error: "Dashboard request failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
