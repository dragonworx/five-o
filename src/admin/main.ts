// Admin console client. Bundled at boot and served (behind Basic auth) at
// /admin/app.js. Renders user-supplied guest data with textContent only — never
// innerHTML — so a guest's name or message can't inject markup into the console.

interface AdminGuest {
  id: string;
  name: string;
  attending: boolean | null;
  adults: number;
  kids: number;
  isMusician: boolean;
  diet: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  mergedInto: string | null;
  overriddenFrom: string | null;
}

interface Summary {
  households: number;
  totalAdults: number;
  totalKids: number;
  totalHeads: number;
  musicians: number;
  omnivore: number;
  vegetarian: number;
  vegan: number;
  comingCount: number;
  decliningCount: number;
}

interface Counts {
  guests: number;
  signals: number;
  visits: number;
  audit: number;
}

interface GuestsResponse {
  summary: Summary;
  coming: AdminGuest[];
  declined: AdminGuest[];
  superseded: AdminGuest[];
  danger: { allowClearAll: boolean };
  counts: Counts;
}

type TabKey = "coming" | "declined";

const CSV_FOR: Record<TabKey, string> = { coming: "attending", declined: "declined" };

let data: GuestsResponse | null = null;
let activeTab: TabKey = "coming";
let showSuperseded = false;
let filterText = "";

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function renderSummary(s: Summary): HTMLElement {
  const stat = (label: string, value: string): HTMLElement =>
    h("div", { className: "stat" }, [h("span", { className: "stat-value" }, [value]), h("span", { className: "stat-label" }, [label])]);
  return h("section", { className: "summary" }, [
    stat("Coming", `${s.totalAdults} adults ▫️ ${s.totalKids} kids`),
    stat("Heads", String(s.totalHeads)),
    stat("Not coming", String(s.decliningCount)),
    stat("Diet", `${s.omnivore} ▫️ ${s.vegetarian} ▫️ ${s.vegan}`),
    stat("Musicians", `🎸 ${s.musicians}`),
  ]);
}

function currentRows(): AdminGuest[] {
  if (!data) return [];
  const base = data[activeTab];
  const rows = showSuperseded ? [...base, ...data.superseded] : base;
  if (!filterText) return rows;
  const q = filterText.toLowerCase();
  return rows.filter((g) => g.name.toLowerCase().includes(q) || (g.message ?? "").toLowerCase().includes(q));
}

function comingColumns(g: AdminGuest): (string | Node)[] {
  return [g.name, String(g.adults), String(g.kids), String(g.adults + g.kids), g.isMusician ? "🎸" : "", g.diet ?? "", g.message ?? "", fmtDate(g.updatedAt)];
}

function headerFor(tab: TabKey): string[] {
  if (tab === "coming") return ["Name", "Adults", "Kids", "Heads", "Musician", "Diet", "Message", "Updated"];
  return ["Name", "Message", "Updated"];
}

function rowFor(tab: TabKey, g: AdminGuest): (string | Node)[] {
  if (tab === "coming") return comingColumns(g);
  return [g.name, g.message ?? "", fmtDate(g.updatedAt)];
}

function renderTable(): HTMLElement {
  const rows = currentRows();
  const table = h("table", { className: "guests" });
  const thead = h("tr", {}, headerFor(activeTab).map((c) => h("th", {}, [c])));
  table.append(h("thead", {}, [thead]));
  const body = h("tbody");
  for (const g of rows) {
    const tr = h("tr", { className: g.mergedInto ? "superseded" : "" });
    for (const cell of rowFor(activeTab, g)) tr.append(h("td", {}, [cell]));
    body.append(tr);
  }
  table.append(body);
  return table;
}

function tabButton(key: TabKey, label: string, count: number): HTMLElement {
  const btn = h("button", { className: `tab ${activeTab === key ? "active" : ""}`, type: "button" }, [`${label} (${count})`]);
  btn.addEventListener("click", () => {
    activeTab = key;
    render();
  });
  return btn;
}

function renderToolbar(): HTMLElement {
  const filter = h("input", { className: "filter", type: "text", placeholder: "Filter…", value: filterText });
  filter.addEventListener("input", () => {
    filterText = filter.value;
    document.getElementById("list")?.replaceChildren(renderTable());
  });
  const supToggle = h("label", { className: "sup" }, []);
  const cb = h("input", { type: "checkbox", checked: showSuperseded });
  cb.addEventListener("change", () => {
    showSuperseded = cb.checked;
    document.getElementById("list")?.replaceChildren(renderTable());
  });
  supToggle.append(cb, document.createTextNode(" show superseded"));
  const csv = h("a", { className: "btn-csv", href: `/admin/export.csv?list=${CSV_FOR[activeTab]}` }, ["Export CSV"]);
  return h("div", { className: "toolbar" }, [filter, supToggle, csv]);
}

function renderDangerZone(): HTMLElement | null {
  if (!data?.danger.allowClearAll) return null;
  const btn = h("button", { className: "btn-danger", type: "button" }, ["Delete everything"]);
  btn.addEventListener("click", () => void clearAll());
  const c = data.counts;
  const summary = h("summary", {}, ["Danger zone"]);
  return h("details", { className: "danger" }, [
    summary,
    h("p", {}, [`This permanently deletes ${c.guests} guests, ${c.signals} identity signals, ${c.visits} visits and the full audit log.`]),
    btn,
  ]);
}

async function clearAll(): Promise<void> {
  const c = data?.counts;
  const ok = window.confirm(
    `Really delete EVERYTHING?\n\n${c?.guests ?? 0} guests, ${c?.signals ?? 0} signals, ${c?.visits ?? 0} visits and the audit log will be destroyed. A backup is taken first.`,
  );
  if (!ok) return;
  const res = await fetch("/admin/api/clear-all", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Admin-Action": "clear-all" }, // see CLEAR_ALL_HEADER in server/admin/clear-all.ts
  });
  if (res.ok) {
    const body = (await res.json()) as { backup: string | null };
    window.alert(`Done. Backup written to: ${body.backup ?? "(none)"}`);
    await load();
  } else {
    const body = (await res.json().catch(() => ({ error: "failed" }))) as { error?: string };
    window.alert(`Clear failed: ${body.error ?? res.status}`);
  }
}

function render(): void {
  if (!data) return;
  document.getElementById("summary")?.replaceChildren(renderSummary(data.summary));
  document.getElementById("tabs")?.replaceChildren(
    tabButton("coming", "Coming", data.summary.comingCount),
    tabButton("declined", "Not coming", data.summary.decliningCount),
  );
  document.getElementById("toolbar")?.replaceChildren(renderToolbar());
  document.getElementById("list")?.replaceChildren(renderTable());
  const danger = renderDangerZone();
  const dangerHost = document.getElementById("danger");
  if (dangerHost) dangerHost.replaceChildren(...(danger ? [danger] : []));
}

async function load(): Promise<void> {
  const res = await fetch("/admin/api/guests", { credentials: "same-origin" });
  if (!res.ok) {
    document.body.textContent = `Failed to load admin data: ${res.status}`;
    return;
  }
  data = (await res.json()) as GuestsResponse;
  render();
}

await load();
