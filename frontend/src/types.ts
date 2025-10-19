export type InteractionMode = "text" | "voice";

export interface SessionStartResponse {
  session_id: string;
  started_at: string;
  assistant_greeting: string;
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

export interface EvaluationDimensionScore {
  name: string;
  score: number;
  weight: number;
  feedback: string;
}

export interface EvaluationResponse {
  session_id?: string;
  overall_score: number;
  cefr_level: string;
  summary: string;
  dimensions: EvaluationDimensionScore[];
  errors: string[];
  action_plan: string[];
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
