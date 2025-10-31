export type InteractionMode = "voice";

export interface SessionConsent {
  granted: boolean;
  granted_at?: string;
}

export interface SessionStartRequest {
  mode: InteractionMode;
  duration_minutes: number;
  user_name?: string;
  user_email?: string;
  consent: SessionConsent;
}

export interface SessionStartResponse {
  session_id: string;
  started_at: string;
  assistant_greeting: string;
  mode: InteractionMode;
}

export interface ChatResponse {
  assistant_message: string;
  mode: InteractionMode;
  tts_url?: string | null;
  turns_completed: number;
}

export interface SessionFinishResponse {
  session_id: string;
  summary: string;
  word_count: number;
  duration_seconds: number;
}

export interface CriterionAssessment {
  score: number;
  comment: string;
}

export interface CommonError {
  issue: string;
  fix: string;
}

export interface StandardEvaluation {
  standard_id: "toefl" | "ielts";
  label: string;
  overall?: number | null;
  cefr?: string | null;
  criteria: Record<string, CriterionAssessment>;
  criterion_labels: Record<string, string>;
  common_errors: CommonError[];
  recommendations: string[];
  evidence_quotes: string[];
  status: "ok" | "failed";
  error?: string | null;
}

export interface CrosswalkSummary {
  consensus_cefr: string;
  notes: string;
  strengths: string[];
  focus: string[];
}

export interface SessionInfo {
  id: string;
  started_at: string;
  ended_at: string;
  duration_sec: number;
  turns: number;
}

export interface DualEvaluationResponse {
  session: SessionInfo;
  standards: StandardEvaluation[];
  crosswalk: CrosswalkSummary;
  warnings?: string[] | null;
  session_id: string;
  cefr_level: string;
  generated_at: string;
}

export interface ReportResponse {
  report_url: string;
  pdf_url?: string | null;
  html: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Gpt5Status {
  configured: boolean;
}

export interface EmailSettingsInfo {
  provider: string;
  smtp_host: string | null;
  smtp_port: number;
  smtp_username: string | null;
  default_sender: string | null;
}

export interface EmailConfigStatus {
  configured: boolean;
  missing_fields: string[];
  settings: EmailSettingsInfo;
  target_email?: string | null;
}

export interface EmailRequestPayload {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<Record<string, unknown>>;
  links?: string[];
}

export interface EmailConfigUpdatePayload {
  provider?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  default_sender?: string;
  target_email?: string;
}

export interface EmailResponsePayload {
  status: string;
  message_id: string;
}
