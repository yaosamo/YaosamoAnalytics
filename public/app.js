const currencyless = new Intl.NumberFormat("en-US");

function formatDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function sparklinePath(series) {
  if (!series.length) {
    return { line: "", area: "" };
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
  return { line, area };
}

function renderCard(project) {
  const template = document.getElementById("projectCardTemplate");
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".card-title").textContent = project.project;
  fragment.querySelector(".card-subtitle").textContent = project.latestDate
    ? `Latest datapoint ${project.latestDate.slice(0, 10)}`
    : "No datapoints this month";
  fragment.querySelector(".visits").textContent = currencyless.format(project.monthlyVisits);
  fragment.querySelector(".active-days").textContent = currencyless.format(project.activeDays);
  fragment.querySelector(".latest").textContent = currencyless.format(project.latestVisits);

  const svg = fragment.querySelector(".sparkline");
  const { line, area } = sparklinePath(project.series);
  svg.innerHTML = `
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
  const topProject = document.getElementById("topProject");
  const projectGrid = document.getElementById("projectGrid");

  const sortedProjects = [...payload.projects].sort((a, b) => b.monthlyVisits - a.monthlyVisits);
  const total = sortedProjects.reduce((sum, project) => sum + project.monthlyVisits, 0);

  rangeLabel.textContent = formatDateRange(payload.range.start, payload.range.end);
  totalVisits.textContent = currencyless.format(total);
  topProject.textContent = sortedProjects[0]
    ? `${sortedProjects[0].project} (${currencyless.format(sortedProjects[0].monthlyVisits)})`
    : "No traffic";

  projectGrid.innerHTML = "";
  sortedProjects.forEach((project) => {
    projectGrid.appendChild(renderCard(project));
  });
}

loadDashboard().catch((error) => {
  document.getElementById("projectGrid").innerHTML = `<article class="card"><p>${error.message}</p></article>`;
});
