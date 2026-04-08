const currencyless = new Intl.NumberFormat("en-US");
const DEFAULT_PRESET = "30d";

function formatDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function formatDateInput(value) {
  return value.slice(0, 10);
}

function setPresetState(activePreset) {
  document.querySelectorAll(".preset-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === activePreset);
  });
}

function setStatus(message, isError = false) {
  const statusText = document.getElementById("statusText");
  const errorText = document.getElementById("errorText");

  if (isError) {
    statusText.textContent = "";
    errorText.hidden = false;
    errorText.textContent = message;
    return;
  }

  errorText.hidden = true;
  errorText.textContent = "";
  statusText.textContent = message;
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
  fragment.querySelector(".visits").textContent = currencyless.format(project.monthlyVisits);
  fragment.querySelector(".muted").textContent =
    project.monthlyUsers == null ? "N/A" : currencyless.format(project.monthlyUsers);

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

async function loadDashboard(params = new URLSearchParams({ preset: DEFAULT_PRESET })) {
  setStatus("Loading analytics…");
  document.body.dataset.loading = "true";

  const response = await fetch(`/api/dashboard?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Dashboard fetch failed");
  }

  const rangeLabel = document.getElementById("rangeLabel");
  const projectGrid = document.getElementById("projectGrid");
  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");

  const sortedProjects = [...payload.projects].sort((a, b) => b.monthlyVisits - a.monthlyVisits);

  startDate.value = formatDateInput(payload.range.start);
  endDate.value = formatDateInput(payload.range.end);
  setPresetState(payload.range.preset);
  rangeLabel.textContent = formatDateRange(payload.range.start, payload.range.end);

  projectGrid.innerHTML = "";
  sortedProjects.forEach((project) => {
    projectGrid.appendChild(renderCard(project));
  });

  setStatus(`${sortedProjects.length} projects loaded`);
  document.body.dataset.loading = "false";
}

function buildCustomParams() {
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  return new URLSearchParams({
    preset: "custom",
    start,
    end
  });
}

document.querySelectorAll(".preset-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const params = new URLSearchParams({ preset: button.dataset.preset || DEFAULT_PRESET });

    try {
      await loadDashboard(params);
    } catch (error) {
      document.body.dataset.loading = "false";
      setStatus(error.message, true);
    }
  });
});

document.getElementById("rangeForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await loadDashboard(buildCustomParams());
  } catch (error) {
    document.body.dataset.loading = "false";
    setStatus(error.message, true);
  }
});

loadDashboard().catch((error) => {
  document.body.dataset.loading = "false";
  document.getElementById("projectGrid").innerHTML = `<article class="card card-empty"><p>${error.message}</p></article>`;
  setStatus(error.message, true);
});
