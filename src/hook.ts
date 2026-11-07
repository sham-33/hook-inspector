import { ensureServer } from "./runtime.js";
import { formatEvent } from "./formatting.js";
import { URL, validate } from "./config.js";
import type { Payload, EventResult } from "./types.js";
let payload: Payload = {};
try {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  payload = validate(JSON.parse(input));
  await ensureServer();
  const formatting = await formatEvent(payload);
  const metadata: Payload = {
    hook_event_name: payload.hook_event_name,
    tool_name: payload.tool_name,
    session_id: payload.session_id,
    cwd: payload.cwd,
    demo: payload.demo,
    tool_input: { file_path: payload.tool_input?.file_path ?? "" },
    formatting,
  };
  const response = await fetch(URL + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw Error(`Receiver returned ${response.status}`);
  const result = (await response.json()) as EventResult;
  if (result.hookSpecificOutput)
    console.log(
      JSON.stringify({ hookSpecificOutput: result.hookSpecificOutput }),
    );
  else if (formatting && ["formatted", "error"].includes(formatting.status))
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            "Hook Inspector formatting: " + JSON.stringify(formatting),
        },
      }),
    );
} catch (error) {
  console.error("Hook Inspector: " + (error as Error).message);
  process.exitCode = payload.hook_event_name === "PreToolUse" ? 2 : 1;
}
