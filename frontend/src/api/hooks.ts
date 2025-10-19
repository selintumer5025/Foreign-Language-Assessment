import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { api } from "./client";
import type {
  ChatMessage,
  ChatResponse,
  DualEvaluationResponse,
  Gpt5Status,
  ReportResponse,
  SessionFinishResponse,
  SessionStartResponse,
  InteractionMode
} from "../types";

const SESSION_KEY = ["session"];
const TRANSCRIPT_KEY = ["transcript"];
const GPT5_STATUS_KEY = ["gpt5-status"];

export function useStartSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { mode: InteractionMode; duration_minutes: number; user_name?: string }) => {
      const { data } = await api.post<SessionStartResponse>("/api/session/start", payload);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(SESSION_KEY, data);
      const message: ChatMessage = {
        id: nanoid(),
        role: "assistant",
        content: data.assistant_greeting,
        timestamp: new Date().toISOString()
      };
      queryClient.setQueryData<ChatMessage[]>(TRANSCRIPT_KEY, [message]);
    }
  });
}

export function useChat(sessionId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { session_id: string; user_message: string }) => {
      const { data } = await api.post<ChatResponse>("/api/chat", payload);
      return data;
    },
    onSuccess: (data, variables) => {
      const history = queryClient.getQueryData<ChatMessage[]>(TRANSCRIPT_KEY) ?? [];
      const userMessage: ChatMessage = {
        id: nanoid(),
        role: "user",
        content: variables.user_message,
        timestamp: new Date().toISOString()
      };
      const assistantMessage: ChatMessage = {
        id: nanoid(),
        role: "assistant",
        content: data.assistant_message,
        timestamp: new Date().toISOString()
      };
      queryClient.setQueryData(TRANSCRIPT_KEY, [...history, userMessage, assistantMessage]);
    }
  });
}

export function useTranscript() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: TRANSCRIPT_KEY,
    queryFn: async () => queryClient.getQueryData<ChatMessage[]>(TRANSCRIPT_KEY) ?? [],
    initialData: [] as ChatMessage[],
  });
}

export function useCurrentSession() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => queryClient.getQueryData<SessionStartResponse | null>(SESSION_KEY) ?? null,
    initialData: null,
  });
}

export function useFinishSession() {
  return useMutation({
    mutationFn: async (payload: { session_id: string }) => {
      const { data } = await api.post<SessionFinishResponse>("/api/session/finish", payload);
      return data;
    }
  });
}

export function useEvaluateSession() {
  return useMutation({
    mutationFn: async (payload: { session_id: string }) => {
      const { data } = await api.post<DualEvaluationResponse>("/api/evaluate", payload);
      return data;
    }
  });
}

export function useGenerateReport() {
  return useMutation({
    mutationFn: async (payload: { evaluation: DualEvaluationResponse; session_metadata?: Record<string, unknown> }) => {
      const { data } = await api.post<ReportResponse>("/api/report", payload);
      return data;
    }
  });
}

export function useGpt5Status() {
  return useQuery({
    queryKey: GPT5_STATUS_KEY,
    queryFn: async () => {
      const { data } = await api.get<Gpt5Status>("/api/config/gpt5");
      return data;
    },
    staleTime: Infinity,
  });
}

export function useConfigureGpt5() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { api_key: string }) => {
      const { data } = await api.post<Gpt5Status>("/api/config/gpt5", payload);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(GPT5_STATUS_KEY, data);
    }
  });
}
