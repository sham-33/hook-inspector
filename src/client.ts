import type { EventRecord, Policy } from "./types.js";

let events: EventRecord[] = [];
let refreshVersion = 0;
let clearing = false;
interface Elements {
  search: HTMLInputElement;
  filter: HTMLSelectElement;
  demo: HTMLButtonElement;
  "clear-data": HTMLButtonElement;
  export: HTMLButtonElement;
  total: HTMLElement;
  allowed: HTMLElement;
  blocked: HTMLElement;
  events: HTMLElement;
  details: HTMLElement;
  connection: HTMLElement;
  policy: HTMLElement;
  "format-status": HTMLElement;
}
const $ = <K extends keyof Elements>(id: K): Elements[K] => {
  const element = document.getElementById(id);
  if (!element) throw Error("Missing element: " + id);
  return element as Elements[K];
};
function render() {
  $("clear-data").hidden = events.length === 0;
  $("total").textContent = String(events.length);
  $("allowed").textContent = String(
    events.filter((e) => e.status === "allowed").length,
  );
  $("blocked").textContent = String(
    events.filter((e) => e.status === "blocked").length,
  );
  const visible = events.filter(
    (e) =>
      (!$("filter").value || e.status === $("filter").value) &&
      JSON.stringify(e).toLowerCase().includes($("search").value.toLowerCase()),
  );
  $("events").replaceChildren();
  for (const e of visible) {
    const b = document.createElement("button");
    b.className = "event";
    const left = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent =
      e.event + " · " + (e.tool || "Session") + (e.demo ? " · DEMO" : "");
    const sub = document.createElement("small");
    sub.textContent = e.path || e.session;
    left.append(title, sub);
    const right = document.createElement("div");
    right.className = e.status === "blocked" ? "blocked" : "badge";
    right.textContent =
      e.status + " · " + new Date(e.time * 1000).toLocaleTimeString();
    b.append(left, right);
    b.onclick = () => {
      $("details").textContent = JSON.stringify(e, null, 2);
    };
    $("events").append(b);
  }
  if (!visible.length)
    $("events").textContent =
      "No matching events. Run a demo or connect your agent.";
}
async function refresh() {
  try {
    if (clearing) return;
    const version = ++refreshVersion;
    const r = await fetch("/api/events");
    if (!r.ok) throw Error();
    const received: EventRecord[] = await r.json();
    if (version !== refreshVersion || clearing) return;
    events = received;
    render();
    $("connection").textContent = "● Receiver online";
  } catch {
    $("connection").textContent = "Receiver offline";
  }
}
$("search").oninput = render;
$("filter").onchange = render;
$("demo").onclick = async () => {
  const b = $("demo");
  b.disabled = true;
  $("clear-data").disabled = true;
  try {
    for (const [event, tool, path] of [
      ["SessionStart", "", ""],
      ["PreToolUse", "Read", "src/app.py"],
      ["PreToolUse", "Edit", "src/app.py"],
      ["PostToolUse", "Edit", "src/app.py"],
      ["PreToolUse", "Write", ".env"],
      ["Stop", "", ""],
    ]) {
      const r = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hook_event_name: event,
          tool_name: tool,
          tool_input: { file_path: path },
          session_id: "demo-session",
          demo: true,
        }),
      });
      if (!r.ok) throw Error("Demo failed");
    }
    await refresh();
  } catch (e) {
    $("details").textContent = (e as Error).message;
  } finally {
    b.disabled = false;
    $("clear-data").disabled = false;
  }
};
$("clear-data").onclick = async () => {
  clearing = true;
  ++refreshVersion;
  $("clear-data").disabled = true;
  $("demo").disabled = true;
  try {
    const response = await fetch("/api/events", { method: "DELETE" });
    if (!response.ok) throw Error("Could not clear data. Please try again.");
    events = [];
    $("search").value = "";
    $("filter").value = "";
    $("details").textContent = "Select an event to inspect its metadata.";
    render();
  } catch (error) {
    $("details").textContent = (error as Error).message;
  } finally {
    clearing = false;
    $("clear-data").disabled = false;
    $("demo").disabled = false;
  }
};
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(events, null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "hook-events.json";
  a.click();
  URL.revokeObjectURL(url);
};
fetch("/api/policy")
  .then((r) => r.json())
  .then((p: Policy) => {
    $("policy").textContent = p.protected_paths.join("\n");
    $("format-status").textContent = p.format_on_edit
      ? "Auto-format enabled · Python + web files"
      : "Auto-format disabled";
  })
  .catch(() => ($("policy").textContent = "Policy unavailable"));
refresh();
setInterval(refresh, 1500);
