const currencyless = new Intl.NumberFormat("en-US");

function formatDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function sparklinePath(series) {
  if (!series.length) {
    return { line: "", area: "", max: 0 };
  }

  const width = 240;
  const height = 72;
  const max = Math.max(...series.map((point) => point.visits), 1);
  const xStep = series.length === 1 ? 0 : width / (series.length - 1);

  const points = series.map((point, index) => {
    const x = index * xStep;
    const y = height - (point.visits / max) * (height - 10) - 5;
    return [x, y];
  });

  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { line, area, max };
}

function renderCard(project) {
  const template = document.getElementById("projectCardTemplate");
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".card-title").textContent = project.project;
  fragment.querySelector(".card-subtitle").textContent = project.latestDate
    ? `Signal updated ${project.latestDate.slice(0, 10)}`
    : "No signal this month";
  fragment.querySelector(".visits").textContent = currencyless.format(project.monthlyVisits);
  fragment.querySelector(".muted").textContent =
    project.monthlyUsers == null ? "N/A" : currencyless.format(project.monthlyUsers);
  fragment.querySelector(".active-days").textContent = currencyless.format(project.activeDays);
  fragment.querySelector(".latest").textContent = currencyless.format(project.latestVisits);

  const svg = fragment.querySelector(".sparkline");
  const yTop = fragment.querySelector(".axis-top");
  const yMid = fragment.querySelector(".axis-mid");
  const yBottom = fragment.querySelector(".axis-bottom");
  const { line, area, max } = sparklinePath(project.series);
  yTop.textContent = currencyless.format(max);
  yMid.textContent = currencyless.format(Math.round(max / 2));
  yBottom.textContent = "0";
  svg.innerHTML = `
    <path d="M 0 6 L 240 6" fill="none" stroke="rgba(194, 199, 158, 0.16)" stroke-width="1"></path>
    <path d="M 0 36 L 240 36" fill="none" stroke="rgba(194, 199, 158, 0.12)" stroke-width="1"></path>
    <path d="M 0 66 L 240 66" fill="none" stroke="rgba(194, 199, 158, 0.16)" stroke-width="1"></path>
    <path d="M 0 0 L 0 72" fill="none" stroke="rgba(194, 199, 158, 0.28)" stroke-width="1"></path>
    <path class="area" d="${area}"></path>
    <path class="line" d="${line}"></path>
  `;

  return fragment;
}

async function loadDashboard() {
  const response = await fetch("/api/dashboard");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Dashboard fetch failed");
  }

  const rangeLabel = document.getElementById("rangeLabel");
  const totalVisits = document.getElementById("totalVisits");
  const totalUsers = document.getElementById("totalUsers");
  const topProject = document.getElementById("topProject");
  const projectGrid = document.getElementById("projectGrid");

  const sortedProjects = [...payload.projects].sort((a, b) => b.monthlyVisits - a.monthlyVisits);
  const total = sortedProjects.reduce((sum, project) => sum + project.monthlyVisits, 0);
  const userTotal = sortedProjects.reduce((sum, project) => sum + (project.monthlyUsers || 0), 0);
  const hasUsers = sortedProjects.some((project) => project.monthlyUsers != null);

  rangeLabel.textContent = formatDateRange(payload.range.start, payload.range.end);
  totalVisits.textContent = currencyless.format(total);
  totalUsers.textContent = hasUsers ? currencyless.format(userTotal) : "N/A";
  topProject.textContent = sortedProjects[0]
    ? `${sortedProjects[0].project} / ${currencyless.format(sortedProjects[0].monthlyVisits)}`
    : "No traffic";

  projectGrid.innerHTML = "";
  sortedProjects.forEach((project) => {
    projectGrid.appendChild(renderCard(project));
  });
}

loadDashboard().catch((error) => {
  document.getElementById("projectGrid").innerHTML = `<article class="card"><p>${error.message}</p></article>`;
});
