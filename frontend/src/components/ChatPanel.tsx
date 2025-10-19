import { useEffect, useMemo, useRef, useState } from "react";
import { useChat, useCurrentSession, useFinishSession, useGenerateReport, useStartSession, useTranscript, useEvaluateSession } from "../api/hooks";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import { ScoreCard } from "./ScoreCard";
import type { EvaluationResponse, InteractionMode, SessionFinishResponse } from "../types";

export function ChatPanel() {
  const { data: transcript } = useTranscript();
  const { data: session } = useCurrentSession();
  const startSession = useStartSession();
  const chatMutation = useChat(session?.session_id);
  const finishSession = useFinishSession();
  const evaluateSession = useEvaluateSession();
  const generateReport = useGenerateReport();
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionFinishResponse | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const lastSpokenIdRef = useRef<string | null>(null);

  const canChat = Boolean(session?.session_id) && !evaluation;
  const activeMode: InteractionMode = session?.mode ?? "voice";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    if (!session || session.mode !== "voice") {
      window.speechSynthesis.cancel();
    }
  }, [session?.mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (session?.mode !== "voice") return;
    if (!("speechSynthesis" in window)) return;
    if (transcript.length === 0) return;

    const lastMessage = transcript[transcript.length - 1];
    if (lastMessage.role !== "assistant") return;
    if (lastSpokenIdRef.current === lastMessage.id) return;

    lastSpokenIdRef.current = lastMessage.id;
    const utterance = new SpeechSynthesisUtterance(lastMessage.content);
    utterance.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [session?.mode, transcript]);

  const handleStart = async () => {
    setEvaluation(null);
    setSessionSummary(null);
    setReportUrl(null);
    await startSession.mutateAsync({ mode: "voice", duration_minutes: 10 });
  };

  const handleSend = async (message: string) => {
    if (!session?.session_id) return;
    await chatMutation.mutateAsync({ session_id: session.session_id, user_message: message });
  };

  const handleFinish = async () => {
    if (!session?.session_id) return;
    const summary = await finishSession.mutateAsync({ session_id: session.session_id });
    setSessionSummary(summary);
  };

  const handleEvaluate = async () => {
    if (!session?.session_id) return;
    const result = await evaluateSession.mutateAsync({ session_id: session.session_id });
    setEvaluation(result);
  };

  const handleReport = async () => {
    if (!evaluation || !sessionSummary) return;
    const metadata = {
      session_id: evaluation.session_id,
      started_at: session?.started_at,
      duration_seconds: sessionSummary.duration_seconds,
      word_count: sessionSummary.word_count,
      summary: sessionSummary.summary
    };
    const report = await generateReport.mutateAsync({ evaluation, session_metadata: metadata });
    setReportUrl(report.report_url);
  };

  const isLoading = useMemo(
    () =>
      startSession.isPending ||
      chatMutation.isPending ||
      finishSession.isPending ||
      evaluateSession.isPending ||
      generateReport.isPending,
    [startSession.isPending, chatMutation.isPending, finishSession.isPending, evaluateSession.isPending, generateReport.isPending]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">English Interview Coach</h1>
            <p className="mt-1 text-sm text-slate-600">
              The entire experience runs in English so you can focus on fluency, clarity, and interview confidence.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleStart}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              {session ? "Restart English Session" : "Begin English Session"}
            </button>
          </div>
        </div>
        <div className="h-[480px] overflow-y-auto rounded-xl border border-slate-200 bg-blue-50 p-4 shadow-inner">
          {transcript.length === 0 ? (
            <p className="text-center text-sm text-slate-500">
              Start a session to begin the English-only conversation. Prompts will be spoken in English and you can reply aloud or by typing.
            </p>
          ) : (
            <div className="space-y-3">
              {transcript.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>
        <ChatInput onSend={handleSend} disabled={!canChat || isLoading} mode={activeMode} />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleFinish}
            disabled={!session || isLoading}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-700"
          >
            End Session
          </button>
          <button
            onClick={handleEvaluate}
            disabled={!session || isLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-700"
          >
            Get Evaluation
          </button>
          <button
            onClick={handleReport}
            disabled={!evaluation || isLoading}
            className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-700"
          >
            Generate English Report
          </button>
        </div>
        {sessionSummary && (
          <p className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700 shadow">
            Words: {sessionSummary.word_count} · Duration: {sessionSummary.duration_seconds}s
          </p>
        )}
        {reportUrl && (
          <a
            href={reportUrl}
            className="inline-block text-sm font-semibold text-blue-600 transition hover:text-blue-700 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            View generated report
          </a>
        )}
      </div>
      <div className="space-y-4">
        {evaluation ? (
          <ScoreCard evaluation={evaluation} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
            Run an evaluation to unlock TOEFL-style scoring, CEFR levels, and tailored action plans.
          </div>
        )}
      </div>
    </div>
  );
}
