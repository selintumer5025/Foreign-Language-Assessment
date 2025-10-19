import { useMemo, useState } from "react";
import { useChat, useCurrentSession, useFinishSession, useGenerateReport, useStartSession, useTranscript, useEvaluateSession } from "../api/hooks";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import { ScoreCard } from "./ScoreCard";
import type { EvaluationResponse, SessionFinishResponse } from "../types";

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

  const canChat = Boolean(session?.session_id) && !evaluation;

  const handleStart = async () => {
    setEvaluation(null);
    setSessionSummary(null);
    setReportUrl(null);
    await startSession.mutateAsync({ mode: "text", duration_minutes: 10 });
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
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-slate-900">English Interview Coach</h1>
          <button
            onClick={handleStart}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
          >
            {session ? "Restart Session" : "Start Session"}
          </button>
        </div>
        <div className="h-[480px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
          {transcript.length === 0 ? (
            <p className="text-center text-sm text-slate-500">
              Start a session to begin the conversation. You can add voice responses later using your browser's speech tools.
            </p>
          ) : (
            <div className="space-y-3">
              {transcript.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>
        <ChatInput onSend={handleSend} disabled={!canChat || isLoading} />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleFinish}
            disabled={!session || isLoading}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Finish Session
          </button>
          <button
            onClick={handleEvaluate}
            disabled={!session || isLoading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Evaluate
          </button>
          <button
            onClick={handleReport}
            disabled={!evaluation || isLoading}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Generate Report
          </button>
        </div>
        {sessionSummary && (
          <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 shadow">
            Words: {sessionSummary.word_count} · Duration: {sessionSummary.duration_seconds}s
          </p>
        )}
        {reportUrl && (
          <a
            href={reportUrl}
            className="inline-block text-sm font-semibold text-blue-700 hover:underline"
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
