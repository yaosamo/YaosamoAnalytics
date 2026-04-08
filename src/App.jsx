import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US");
const DEFAULT_PRESET = "30d";
const STORAGE_KEY = "yaosamo-analytics:selected-projects";

function formatDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function formatDateInput(value) {
  return value.slice(0, 10);
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

function ProjectCombobox({ open, onOpenChange, availableProjects, selectedProjects, onToggleProject, onSelectAll, onClear }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return availableProjects.filter((name) => name.toLowerCase().includes(term));
  }, [availableProjects, query]);

  const label = useMemo(() => {
    if (!selectedProjects.length || selectedProjects.length === availableProjects.length) {
      return "All projects";
    }
    if (selectedProjects.length === 1) {
      return selectedProjects[0];
    }
    return `${selectedProjects.length} projects`;
  }, [availableProjects.length, selectedProjects]);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  return (
    <div className="pointer-events-auto absolute left-1/2 top-0 z-30 w-[min(320px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2">
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger asChild>
          <Button variant="outline" className="h-10 w-full justify-between rounded-xl border-zinc-200 bg-white/95 px-4 shadow-sm">
            <span className="truncate">{label}</span>
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={10}
            align="center"
            className="w-[min(360px,calc(100vw-24px))] rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl outline-none"
          >
            <Command className="overflow-hidden rounded-lg">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3">
                <Search className="h-4 w-4 text-zinc-400" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search projects"
                  className="h-10 w-full border-0 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={onSelectAll}>
                  All
                </Button>
                <Button type="button" size="sm" variant="ghost" className="rounded-lg" onClick={onClear}>
                  None
                </Button>
              </div>
              <Command.List className="mt-2 max-h-64 overflow-auto">
                <Command.Empty className="px-3 py-6 text-sm text-zinc-500">No projects found.</Command.Empty>
                <Command.Group>
                  {filtered.map((name) => {
                    const selected = selectedProjects.includes(name);
                    return (
                      <Command.Item
                        key={name}
                        value={name}
                        onSelect={() => onToggleProject(name)}
                        className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-700 outline-none data-[selected=true]:bg-zinc-100"
                      >
                        <span>{name}</span>
                        <Check className={cn("h-4 w-4 text-zinc-700", !selected && "opacity-0")} />
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function ProjectCard({ project }) {
  const { line, area, max } = sparklinePath(project.series);

  return (
    <article className="rounded-2xl border border-zinc-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
      <h2 className="text-base font-medium tracking-tight text-zinc-950">{project.project}</h2>
      <div className="mt-3 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Visits</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">{numberFormatter.format(project.monthlyVisits)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Users</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
            {project.monthlyUsers == null ? "N/A" : numberFormatter.format(project.monthlyUsers)}
          </p>
        </div>
      </div>
      <div className="relative mt-4 min-h-[104px] rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-3 pl-11">
        <div className="pointer-events-none absolute inset-y-3 left-3 flex w-6 flex-col justify-between text-[11px] text-zinc-400">
          <span>{numberFormatter.format(max)}</span>
          <span>{numberFormatter.format(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <svg className="block h-[80px] w-full" viewBox="0 0 240 72" preserveAspectRatio="none">
          <path d="M 0 6 L 240 6" fill="none" stroke="rgba(161,161,170,0.22)" strokeWidth="1" />
          <path d="M 0 36 L 240 36" fill="none" stroke="rgba(161,161,170,0.14)" strokeWidth="1" />
          <path d="M 0 66 L 240 66" fill="none" stroke="rgba(161,161,170,0.22)" strokeWidth="1" />
          <path d="M 0 0 L 0 72" fill="none" stroke="rgba(161,161,170,0.24)" strokeWidth="1" />
          <path d={area} fill="rgba(24,24,27,0.08)" />
          <path d={line} fill="none" stroke="#18181b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </article>
  );
}

export default function App() {
  const [data, setData] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return [];
      }

      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rangeLabel, setRangeLabel] = useState("Loading...");
  const [status, setStatus] = useState("Loading analytics…");
  const [error, setError] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const initialLoadRef = useRef(true);

  async function loadDashboard(params = new URLSearchParams({ preset: DEFAULT_PRESET })) {
    setError("");
    setStatus("Loading analytics…");
    const response = await fetch(`/api/dashboard?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Dashboard fetch failed");
    }

    const nextProjects = payload.availableProjects || payload.projects.map((project) => project.project);
    setData(payload.projects);
    setAvailableProjects(nextProjects);
    setSelectedProjects((previous) => {
      if (initialLoadRef.current || previous.length === 0) {
        return nextProjects;
      }

      const filtered = previous.filter((name) => nextProjects.includes(name));
      return filtered.length ? filtered : nextProjects;
    });
    setStartDate(formatDateInput(payload.range.start));
    setEndDate(formatDateInput(payload.range.end));
    setPreset(payload.range.preset);
    setRangeLabel(formatDateRange(payload.range.start, payload.range.end));
    setStatus(`${payload.projects.length} projects loaded`);
    initialLoadRef.current = false;
  }

  useEffect(() => {
    loadDashboard().catch((err) => {
      setError(err.message);
      setStatus("");
    });
  }, []);

  const visibleProjects = useMemo(() => {
    const selected = new Set(selectedProjects);
    return data
      .filter((project) => selected.has(project.project))
      .sort((a, b) => b.monthlyVisits - a.monthlyVisits);
  }, [data, selectedProjects]);

  useEffect(() => {
    if (!initialLoadRef.current && !error) {
      setStatus(`${visibleProjects.length} projects loaded`);
    }
  }, [visibleProjects.length, error]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedProjects));
    } catch {
      // Ignore local storage failures and keep the UI functional.
    }
  }, [selectedProjects]);

  const applyCustomRange = async () => {
    try {
      await loadDashboard(new URLSearchParams({ preset: "custom", start: startDate, end: endDate }));
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
  };

  const applyPreset = async (nextPreset) => {
    try {
      await loadDashboard(new URLSearchParams({ preset: nextPreset }));
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.06),transparent_32%),linear-gradient(180deg,#fcfcfd_0%,#f8f8fa_100%)] px-4 py-8 text-zinc-950 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <section className="relative mb-5 grid gap-6 pt-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <ProjectCombobox
            open={comboboxOpen}
            onOpenChange={setComboboxOpen}
            availableProjects={availableProjects}
            selectedProjects={selectedProjects}
            onToggleProject={(name) =>
              setSelectedProjects((previous) =>
                previous.includes(name) ? previous.filter((item) => item !== name) : [...previous, name],
              )
            }
            onSelectAll={() => setSelectedProjects(availableProjects)}
            onClear={() => setSelectedProjects([])}
          />

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Yaosamo</p>
            <h1 className="text-4xl font-semibold tracking-[-0.06em] text-zinc-950 sm:text-5xl">Analytics</h1>
            <p className="mt-3 max-w-2xl text-sm text-zinc-500 sm:text-base">
              A compact view of traffic across your core projects.
            </p>
          </div>

          <form
            className="grid justify-items-start gap-3 md:justify-items-end"
            onSubmit={(event) => {
              event.preventDefault();
              applyCustomRange();
            }}
          >
            <div className="inline-flex rounded-xl border border-zinc-200 bg-white/80 p-1 shadow-sm">
              <Button type="button" variant={preset === "7d" ? "default" : "ghost"} size="sm" className="rounded-lg" onClick={() => applyPreset("7d")}>
                Last 7 days
              </Button>
              <Button type="button" variant={preset === "30d" ? "default" : "ghost"} size="sm" className="rounded-lg" onClick={() => applyPreset("30d")}>
                Last 30 days
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[170px_170px_auto] sm:items-end">
              <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                <span>From</span>
                <input
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none ring-0 transition focus:border-zinc-300"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                <span>To</span>
                <input
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none ring-0 transition focus:border-zinc-300"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
              <Button type="submit" className="rounded-xl">
                Apply
              </Button>
            </div>
          </form>
        </section>

        <section className="mb-4 flex min-h-6 flex-wrap items-center justify-between gap-3 px-0.5">
          <p className="text-sm font-medium text-zinc-600">{status}</p>
          <p className="text-sm font-medium text-zinc-500">{rangeLabel}</p>
          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {error ? (
            <article className="rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-sm">{error}</article>
          ) : (
            visibleProjects.map((project) => <ProjectCard key={project.project} project={project} />)
          )}
        </section>
      </div>
    </main>
  );
}
