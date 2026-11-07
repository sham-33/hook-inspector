export interface FormattingResult {
  status: "disabled" | "skipped" | "formatted" | "unchanged" | "error";
  reason?: string;
  formatter?: string;
}
export interface Payload {
  hook_event_name?: string;
  tool_name?: string;
  session_id?: string;
  cwd?: string;
  demo?: boolean;
  tool_input?: { file_path?: string; [key: string]: unknown };
  formatting?: FormattingResult;
}
export interface Policy {
  protected_paths: string[];
  format_on_edit: boolean;
}
export interface EventRecord {
  id?: number;
  time: number;
  event: string;
  tool: string;
  session: string;
  path: string;
  status: "allowed" | "blocked";
  reason: string;
  demo: boolean;
  formatting?: FormattingResult;
}
export interface Decision {
  hookEventName: "PreToolUse";
  permissionDecision: "deny";
  permissionDecisionReason: string;
}
export interface EventResult {
  record: EventRecord;
  hookSpecificOutput?: Decision;
}
