import { useEffect, useMemo, useRef, useState } from "react";
import { useChat, useCurrentSession, useFinishSession, useGenerateReport, useStartSession, useTranscript, useEvaluateSession } from "../api/hooks";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import { ScoreCard } from "./ScoreCard";
import type { DualEvaluationResponse, InteractionMode, SessionFinishResponse } from "../types";

export function ChatPanel() {
  const { data: transcript } = useTranscript();
  const { data: session } = useCurrentSession();
  const startSession = useStartSession();
  const chatMutation = useChat(session?.session_id);
  const finishSession = useFinishSession();
  const evaluateSession = useEvaluateSession();
  const generateReport = useGenerateReport();
  const [evaluation, setEvaluation] = useState<DualEvaluationResponse | null>(null);
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
      session_id: evaluation.session.id,
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
    <div className="relative min-h-screen">
      {/* Animated Background - Dark Theme */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 -z-10"></div>
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-fuchsia-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1000ms' }}></div>
      </div>

      <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Chat Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/50">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
            </div>
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Interview Coach AI
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              The entire experience runs in English so you can focus on fluency, clarity, and interview confidence.
            </p>
            <button
              onClick={handleStart}
              className="mt-6 group/btn relative px-8 py-4 rounded-xl font-semibold text-lg overflow-hidden transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-transform duration-300 group-hover/btn:scale-110"></div>
              <span className="relative text-white">
                {session ? "🔄 Restart English Session" : "▶️ Begin English Session"}
              </span>
            </button>
          </div>

          {/* Chat Messages Container */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="h-[480px] overflow-y-auto p-6 custom-scrollbar">
                {transcript.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="inline-flex p-6 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 mb-6">
                      <svg className="w-16 h-16 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-slate-400 text-lg max-w-md">
                      Start a session to begin the English-only conversation. Prompts will be spoken in English and you can reply aloud or by typing.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transcript.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chat Input */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative">
              <ChatInput onSend={handleSend} disabled={!canChat || isLoading} mode={activeMode} />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleFinish}
              disabled={!session || isLoading}
              className="group relative px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
            >
              <div className={`absolute inset-0 ${!session || isLoading ? 'bg-slate-700' : 'bg-gradient-to-r from-blue-600 to-cyan-600'} transition-transform duration-300 group-hover:scale-110`}></div>
              <span className="relative">End Session</span>
            </button>
            <button
              onClick={handleEvaluate}
              disabled={!session || isLoading}
              className="group relative px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
            >
              <div className={`absolute inset-0 ${!session || isLoading ? 'bg-slate-700' : 'bg-gradient-to-r from-violet-600 to-fuchsia-600'} transition-transform duration-300 group-hover:scale-110`}></div>
              <span className="relative">Get Evaluation</span>
            </button>
            <button
              onClick={handleReport}
              disabled={!evaluation || isLoading}
              className="group relative px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
            >
              <div className={`absolute inset-0 ${!evaluation || isLoading ? 'bg-slate-700' : 'bg-gradient-to-r from-orange-600 to-red-600'} transition-transform duration-300 group-hover:scale-110`}></div>
              <span className="relative">Generate Report</span>
            </button>
          </div>

          {/* Session Summary */}
          {sessionSummary && (
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/30 to-cyan-500/30 rounded-2xl blur-lg"></div>
              <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl px-6 py-4 border border-white/10 shadow-xl">
                <div className="flex items-center gap-6 text-sm font-semibold text-white">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Words: {sessionSummary.word_count}
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    Duration: {sessionSummary.duration_seconds}s
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Report Link */}
          {reportUrl && (
            <a
              href={reportUrl}
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-violet-500/50"
              target="_blank"
              rel="noreferrer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Generated Report
            </a>
          )}
        </div>

        {/* Sidebar - Evaluation Card */}
        <div className="space-y-6">
          {evaluation ? (
            <ScoreCard evaluation={evaluation} />
          ) : (
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative bg-white/5 backdrop-blur-xl rounded-3xl border-2 border-dashed border-white/20 p-10 text-center shadow-2xl">
                <div className="inline-flex p-6 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 mb-6">
                  <svg className="w-14 h-14 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">AI Feedback</h3>
                <p className="text-slate-400 leading-relaxed">
                  Run an evaluation to unlock TOEFL-style scoring, CEFR levels, and tailored action plans.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
