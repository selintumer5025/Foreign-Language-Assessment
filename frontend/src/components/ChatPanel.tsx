import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  useChat,
  useConfigureGpt5,
  useConfigureEmail,
  useCurrentSession,
  useEvaluateSession,
  useFinishSession,
  useGenerateReport,
  useEmailStatus,
  useSendEmail,
  useGpt5Status,
  useStartSession,
  useTranscript,
} from "../api/hooks";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import { ScoreCard } from "./ScoreCard";
import type {
  DualEvaluationResponse,
  EmailConfigUpdatePayload,
  InteractionMode,
  SessionFinishResponse
} from "../types";

type ParticipantFormState = {
  fullName: string;
  email: string;
  consent: boolean;
  shareReport: boolean;
};

type ParticipantInfoState = {
  fullName: string;
  email: string;
  consentGranted: boolean;
  consentGrantedAt: string | null;
  shareReportConsent: boolean;
  shareReportConsentGrantedAt: string | null;
};
const SAMPLE_RESPONSES = [
  "Certainly! One experience that stands out is when our team had to deliver a new feature under a strict deadline. I coordinated the project timeline, clarified ownership, and hosted daily check-ins to surface blockers quickly. As a result, we shipped on time and the customer adoption rate exceeded expectations.",
  "I would describe my communication style as clear and empathetic. Whether I'm working with stakeholders or mentoring teammates, I aim to translate complex ideas into actionable next steps while making space for questions and feedback.",
  "A recent challenge involved migrating part of our infrastructure without disrupting users. I designed a phased rollout, wrote automation scripts to validate data integrity, and coordinated with support teams. The migration completed smoothly and reduced latency by nearly 20 percent.",
  "My long-term goal is to keep growing as a product-minded engineer. That means staying close to user feedback, experimenting with new technologies, and sharing knowledge through talks or documentation so the entire team levels up together.",
] as const;

export function ChatPanel() {
  const { data: transcript } = useTranscript();
  const { data: session } = useCurrentSession();
  const startSession = useStartSession();
  const chatMutation = useChat(session?.session_id);
  const finishSession = useFinishSession();
  const evaluateSession = useEvaluateSession();
  const generateReport = useGenerateReport();
  const emailStatusQuery = useEmailStatus();
  const configureEmail = useConfigureEmail();
  const sendEmail = useSendEmail();
  const gpt5StatusQuery = useGpt5Status();
  const configureGpt5 = useConfigureGpt5();
  const [evaluation, setEvaluation] = useState<DualEvaluationResponse | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionFinishResponse | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const lastSpokenIdRef = useRef<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({
    provider: "smtp",
    smtp_host: "",
    smtp_port: "587",
    smtp_username: "",
    smtp_password: "",
    default_sender: "",
    target_email: ""
  });
  const [emailConfigDismissed, setEmailConfigDismissed] = useState(false);
  const [emailBannerMessage, setEmailBannerMessage] = useState<string | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  const [participantModalOpen, setParticipantModalOpen] = useState(true);
  const [participantForm, setParticipantForm] = useState<ParticipantFormState>({
    fullName: "",
    email: "",
    consent: false,
    shareReport: false,
  });
  const [participantInfo, setParticipantInfo] = useState<ParticipantInfoState>({
    fullName: "",
    email: "",
    consentGranted: false,
    consentGrantedAt: null,
    shareReportConsent: false,
    shareReportConsentGrantedAt: null,
  });
  const [autoResponseIndex, setAutoResponseIndex] = useState(0);
  const emailFeedbackClass = useMemo(() => {
    if (!emailFeedback) return "";
    switch (emailFeedback.type) {
      case "success":
        return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
      case "error":
        return "border-rose-400/40 bg-rose-500/10 text-rose-100";
      case "warning":
      default:
        return "border-amber-400/40 bg-amber-500/10 text-amber-100";
    }
  }, [emailFeedback]);

  const participantFormValid =
    participantForm.fullName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participantForm.email.trim()) &&
    participantForm.consent;
  const participantInfoReady =
    participantInfo.fullName.trim().length > 0 &&
    participantInfo.email.trim().length > 0 &&
    participantInfo.consentGranted;

  useEffect(() => {
    if (!participantModalOpen) return;
    if (participantInfo.fullName.trim() || participantInfo.email.trim() || participantInfo.consentGranted) {
      setParticipantForm({
        fullName: participantInfo.fullName,
        email: participantInfo.email,
        consent: participantInfo.consentGranted,
        shareReport: participantInfo.shareReportConsent,
      });
    } else {
      setParticipantForm({ fullName: "", email: "", consent: false, shareReport: false });
    }
  }, [
    participantModalOpen,
    participantInfo.fullName,
    participantInfo.email,
    participantInfo.consentGranted,
    participantInfo.shareReportConsent,
  ]);

  const gptConfigured = gpt5StatusQuery.data?.configured ?? false;
  const requireApiKey = gpt5StatusQuery.isSuccess && !gptConfigured;
  const blockingForConfig = gpt5StatusQuery.isLoading || requireApiKey;
  const apiKeyError = configureGpt5.isError
    ? configureGpt5.error instanceof Error
      ? configureGpt5.error.message
      : "Failed to save API key."
    : null;

  const canChat = Boolean(session?.session_id) && !evaluation && !blockingForConfig;
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

  useEffect(() => {
    if (!emailStatusQuery.isSuccess) return;

    const status = emailStatusQuery.data;
    setEmailForm((prev) => {
      const fallbackPort = Number(prev.smtp_port) || 587;
      return {
        ...prev,
        provider: status.settings.provider ?? "smtp",
        smtp_host: status.settings.smtp_host ?? "",
        smtp_port: String(status.settings.smtp_port ?? fallbackPort),
        smtp_username: status.settings.smtp_username ?? "",
        default_sender: status.settings.default_sender ?? "",
        target_email: status.target_email ?? "",
      };
    });

    if (!status.configured && !emailConfigDismissed) {
      setEmailModalOpen(true);
    } else if (status.configured) {
      setEmailModalOpen(false);
      setEmailBannerMessage(null);
    }
  }, [emailStatusQuery.isSuccess, emailStatusQuery.data, emailConfigDismissed]);

  useEffect(() => {
    if (emailStatusQuery.isError) {
      setEmailBannerMessage("E-posta yapılandırma bilgileri alınamadı. Lütfen ağı kontrol edin.");
    }
  }, [emailStatusQuery.isError]);

  const resetSessionState = () => {
    setEvaluation(null);
    setSessionSummary(null);
    setReportUrl(null);
    setEmailFeedback(null);
  };

  const ensureParticipantInfo = () => {
    if (participantInfoReady) {
      return true;
    }
    setParticipantModalOpen(true);
    return false;
  };

  const handleParticipantInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    setParticipantForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleParticipantSubmit = () => {
    if (!participantFormValid) return;
    const consentTimestamp = new Date().toISOString();
    const shareConsentTimestamp = participantForm.shareReport
      ? participantInfo.shareReportConsentGrantedAt ?? new Date().toISOString()
      : null;
    setParticipantInfo({
      fullName: participantForm.fullName.trim(),
      email: participantForm.email.trim(),
      consentGranted: true,
      consentGrantedAt: consentTimestamp,
      shareReportConsent: participantForm.shareReport,
      shareReportConsentGrantedAt: shareConsentTimestamp,
    });
    setParticipantModalOpen(false);
  };

  const handleStart = async () => {
    if (blockingForConfig) return;
    if (!ensureParticipantInfo()) return;
    resetSessionState();
    setAutoResponseIndex(0);
    await startSession.mutateAsync({
      mode: "voice",
      duration_minutes: 10,
      user_name: participantInfo.fullName.trim(),
      user_email: participantInfo.email.trim(),
      consent: {
        granted: participantInfo.consentGranted,
        granted_at: participantInfo.consentGrantedAt ?? new Date().toISOString(),
      },
    });
  };

  const handleSend = async (message: string) => {
    if (!session?.session_id || blockingForConfig) return;
    await chatMutation.mutateAsync({ session_id: session.session_id, user_message: message });
  };

  const handleFinish = async () => {
    if (!session?.session_id || blockingForConfig) return;
    const summary = await finishSession.mutateAsync({ session_id: session.session_id });
    setSessionSummary(summary);
  };

  const handleEvaluate = async () => {
    if (!session?.session_id || blockingForConfig) return;
    const result = await evaluateSession.mutateAsync({ session_id: session.session_id });
    setEvaluation(result);
  };

  const handleReport = async () => {
    if (!evaluation || !sessionSummary) return;
    if (!ensureParticipantInfo()) return;

    const participant = {
      full_name: participantInfo.fullName.trim(),
      email: participantInfo.email.trim(),
      share_report_consent: participantInfo.shareReportConsent,
      share_report_consent_granted_at: participantInfo.shareReportConsentGrantedAt,
    };
    const metadata = {
      session_id: evaluation.session.id,
      started_at: session?.started_at,
      duration_seconds: sessionSummary.duration_seconds,
      word_count: sessionSummary.word_count,
      summary: sessionSummary.summary,
      participant,
      report_generated_at: new Date().toISOString(),
    };
    const report = await generateReport.mutateAsync({ evaluation, session_metadata: metadata });
    setReportUrl(report.report_url);
    setEmailFeedback(null);

    if (!participantInfo.shareReportConsent) {
      setEmailFeedback({
        type: "warning",
        message: "Katılımcı raporun e-posta ile paylaşılmasına izin vermediği için e-posta gönderilmedi.",
      });
      return;
    }

    const configuredRecipient = emailStatusQuery.data?.target_email?.trim();
    const fallbackRecipient = participantInfo.email.trim();
    const recipientEmail = configuredRecipient || fallbackRecipient;

    if (!recipientEmail) {
      setEmailFeedback({
        type: "error",
        message: "Geçerli bir alıcı e-posta adresi bulunamadı.",
      });
      return;
    }

    if (!emailStatusQuery.data?.configured) {
      setEmailFeedback({
        type: "warning",
        message: "E-posta ayarları yapılandırılmadığı için rapor gönderilemedi.",
      });
      return;
    }

    const subject = `${participant.full_name}- Assessment`;
    const body = [
      "Merhaba,",
      "",
      `Yeni oluşturulan dil değerlendirme raporu ${participant.full_name} (${participant.email}) tarafından oluşturulan değerlendirmeye aittir.`,
      "Detaylı rapora aşağıdaki bağlantıdan ulaşabilirsiniz:",
      report.report_url,
      "",
      "Bu mesaj sistem tarafından otomatik gönderilmiştir.",
    ].join("\n");

    try {
      await sendEmail.mutateAsync({
        to: recipientEmail,
        subject,
        body,
        links: [report.report_url],
      });
      setEmailFeedback({
        type: "success",
        message: `Rapor ${recipientEmail} adresine e-posta ile gönderildi.`,
      });
    } catch (error) {
      console.error("Failed to send report email", error);
      setEmailFeedback({
        type: "error",
        message: "Rapor e-posta ile gönderilemedi. Lütfen e-posta ayarlarını kontrol edin.",
      });
    }
  };

  const evaluationInProgress = evaluateSession.isPending;

  const isLoading = useMemo(
    () =>
      startSession.isPending ||
      chatMutation.isPending ||
      finishSession.isPending ||
      evaluationInProgress ||
      generateReport.isPending ||
      configureGpt5.isPending,
    [
      startSession.isPending,
      chatMutation.isPending,
      finishSession.isPending,
      evaluationInProgress,
      generateReport.isPending,
      configureGpt5.isPending,
    ]
  );

  const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    setApiKeyInput(event.target.value);
  };

  const handleSaveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    try {
      await configureGpt5.mutateAsync({ api_key: trimmed });
      setApiKeyInput("");
      await gpt5StatusQuery.refetch();
    } catch (error) {
      console.error("Failed to configure GPT-5", error);
    }
  };

  const handleEmailInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setEmailForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveEmailSettings = async () => {
    const payload: EmailConfigUpdatePayload = { provider: emailForm.provider };
    if (emailForm.smtp_host.trim()) payload.smtp_host = emailForm.smtp_host.trim();
    if (emailForm.smtp_username.trim()) payload.smtp_username = emailForm.smtp_username.trim();
    if (emailForm.smtp_password.trim()) payload.smtp_password = emailForm.smtp_password.trim();
    if (emailForm.default_sender.trim()) payload.default_sender = emailForm.default_sender.trim();
    if (emailForm.target_email.trim()) payload.target_email = emailForm.target_email.trim();
    const parsedPort = Number(emailForm.smtp_port);
    if (!Number.isNaN(parsedPort) && parsedPort > 0) {
      payload.smtp_port = parsedPort;
    }

    try {
      await configureEmail.mutateAsync(payload);
      setEmailModalOpen(false);
      setEmailConfigDismissed(false);
      setEmailBannerMessage(null);
      setEmailFeedback({ type: "success", message: "E-posta ayarları kaydedildi." });
      setEmailForm((prev) => ({ ...prev, smtp_password: "" }));
      await emailStatusQuery.refetch();
    } catch (error) {
      console.error("Failed to configure email", error);
      setEmailFeedback({ type: "error", message: "E-posta ayarları kaydedilemedi." });
    }
  };

  const handleSkipEmailConfig = () => {
    setEmailModalOpen(false);
    setEmailConfigDismissed(true);
    setEmailBannerMessage("E-posta ayarları tamamlanmadığı için raporlar otomatik gönderilmeyecek.");
  };

  const handleAutoResponse = async () => {
    if (blockingForConfig || chatMutation.isPending || startSession.isPending) return;

    if (!ensureParticipantInfo()) return;

    let activeSession = session;
    const needsNewSession = !activeSession?.session_id || evaluation || sessionSummary;

    if (needsNewSession) {
      resetSessionState();
      setAutoResponseIndex(0);
      try {
        const result = await startSession.mutateAsync({
          mode: "voice",
          duration_minutes: 10,
          user_name: participantInfo.fullName.trim(),
          user_email: participantInfo.email.trim(),
          consent: {
            granted: participantInfo.consentGranted,
            granted_at: participantInfo.consentGrantedAt ?? new Date().toISOString(),
          },
        });
        activeSession = result;
      } catch (error) {
        console.error("Failed to start session for auto response", error);
        return;
      }
    }

    if (!activeSession?.session_id) return;

    const sample = SAMPLE_RESPONSES[autoResponseIndex % SAMPLE_RESPONSES.length];

    try {
      await chatMutation.mutateAsync({ session_id: activeSession.session_id, user_message: sample });
      setAutoResponseIndex((prev) => (prev + 1) % SAMPLE_RESPONSES.length);
    } catch (error) {
      console.error("Failed to send auto interview response", error);
    }
  };

  return (
    <div className="relative min-h-screen">
      {participantModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-cyan-500/40 bg-slate-900/95 p-8 text-slate-100 shadow-2xl">
            <h2 className="text-2xl font-bold">Please enter your information</h2>
            <p className="mt-2 text-sm text-slate-300">Please enter your information.</p>
            <div className="mt-5 space-y-3 rounded-2xl border border-cyan-500/20 bg-slate-900/60 p-4 text-left">
              <h3 className="text-base font-semibold text-cyan-200">Aydınlatma Metni</h3>
              <p className="text-sm text-slate-300">
                Bu uygulama, yabancı dil yeterliliğinizi değerlendirmek amacıyla sesli ve yazılı yanıtlarınızı işler. Paylaştığınız bilgiler sadece değerlendirme süreci boyunca saklanır, üçüncü kişilerle paylaşılmaz ve dilediğiniz zaman silinebilir.
              </p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
                <li>Kimlik ve iletişim bilgileriniz seans raporlarını oluşturmak ve size geri bildirim iletmek için kullanılır.</li>
                <li>Yanıtlarınız yapay zekâ modelleri tarafından analiz edilerek ilerlemenize yardımcı olacak puan ve öneriler sunulur.</li>
                <li>Dilediğiniz zaman desteğe başvurarak verilerinize erişme, düzeltme veya silme hakkınızı kullanabilirsiniz.</li>
              </ul>
            </div>
            <div className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-300" htmlFor="participant_full_name">Full Name</label>
                <input
                  id="participant_full_name"
                  name="fullName"
                  type="text"
                  value={participantForm.fullName}
                  onChange={handleParticipantInputChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="John Doe"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-300" htmlFor="participant_email">Email Address</label>
                <input
                  id="participant_email"
                  name="email"
                  type="email"
                  value={participantForm.email}
                  onChange={handleParticipantInputChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="example@domain.com"
                />
              </div>
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
              <input
                id="participant_consent"
                name="consent"
                type="checkbox"
                checked={participantForm.consent}
                onChange={handleParticipantInputChange}
                className="mt-1 h-4 w-4 rounded border border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-400"
                required
              />
              <label className="text-sm text-slate-200" htmlFor="participant_consent">
                Aydınlatma metnini okudum, kişisel verilerimin değerlendirme oturumu kapsamında işlenmesine izin veriyorum.
              </label>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
              <input
                id="participant_share_report"
                name="shareReport"
                type="checkbox"
                checked={participantForm.shareReport}
                onChange={handleParticipantInputChange}
                className="mt-1 h-4 w-4 rounded border border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-400"
              />
              <label className="text-sm text-slate-200" htmlFor="participant_share_report">
                Dil değerlendirme raporunun, belirttiğim e-posta adresine paylaşılmasına onay veriyorum.
                <span className="block text-xs text-slate-400">
                  Bu onayı dilediğiniz zaman güncelleyebilirsiniz. Onay vermediğiniz sürece rapor e-posta ile iletilmez.
                </span>
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleParticipantSubmit}
                disabled={!participantFormValid}
                className="relative overflow-hidden rounded-xl px-6 py-3 font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-600 transition-transform duration-300"></span>
                <span className="relative">Save and Continue</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {gpt5StatusQuery.isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="rounded-2xl border border-violet-500/30 bg-slate-900/90 px-8 py-6 text-center text-slate-200 shadow-2xl">
            <p className="text-lg font-semibold">Checking GPT-5 configuration…</p>
          </div>
        </div>
      )}

      {requireApiKey && !gpt5StatusQuery.isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-violet-500/50 bg-slate-900/95 p-8 text-slate-100 shadow-2xl">
            <h2 className="text-2xl font-bold">Connect GPT-5 for Scoring</h2>
            <p className="mt-2 text-sm text-slate-300">
              Enter your GPT-5 API key to enable TOEFL/IELTS evaluations. The key is stored in server memory for this session only.
            </p>
            <label className="mt-6 block text-sm font-semibold text-slate-300" htmlFor="gpt5-api-key">
              GPT-5 API Key
            </label>
            <input
              id="gpt5-api-key"
              type="password"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              placeholder="sk-..."
              value={apiKeyInput}
              onChange={handleApiKeyChange}
              disabled={configureGpt5.isPending}
            />
            {apiKeyError ? (
              <p className="mt-2 text-sm text-rose-400">{apiKeyError}</p>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Need help? Contact your administrator for access.</p>
            )}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim() || configureGpt5.isPending}
                className="group relative overflow-hidden rounded-xl px-6 py-3 font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-transform duration-300 group-hover:scale-105"></div>
                <span className="relative">Save API Key</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {emailModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-amber-500/50 bg-slate-900/95 p-8 text-slate-100 shadow-2xl">
            <h2 className="text-2xl font-bold">E-posta Ayarlarını Tamamlayın</h2>
            <p className="mt-2 text-sm text-slate-300">
              Raporlarınızın otomatik olarak gönderilmesi için SMTP bilgilerini girin. Bu adımı şimdi atlayabilirsiniz ancak e-posta gönderimi çalışmayacaktır.
            </p>
            {emailStatusQuery.data?.missing_fields?.length ? (
              <p className="mt-3 text-xs text-amber-300">
                Eksik alanlar: {emailStatusQuery.data.missing_fields.join(", ")}
              </p>
            ) : null}
            <div className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-300" htmlFor="smtp_host">SMTP Sunucusu</label>
                <input
                  id="smtp_host"
                  name="smtp_host"
                  type="text"
                  value={emailForm.smtp_host}
                  onChange={handleEmailInputChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  placeholder="smtp.mailprovider.com"
                  disabled={configureEmail.isPending}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-300" htmlFor="target_email">Varsayılan Rapor Alıcısı</label>
                <input
                  id="target_email"
                  name="target_email"
                  type="email"
                  value={emailForm.target_email}
                  onChange={handleEmailInputChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  placeholder="ornek@domain.com"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-slate-300" htmlFor="smtp_port">Port</label>
                  <input
                    id="smtp_port"
                    name="smtp_port"
                    type="number"
                    min={1}
                    value={emailForm.smtp_port}
                    onChange={handleEmailInputChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    placeholder="587"
                    disabled={configureEmail.isPending}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-slate-300" htmlFor="smtp_username">Kullanıcı Adı</label>
                  <input
                    id="smtp_username"
                    name="smtp_username"
                    type="text"
                    value={emailForm.smtp_username}
                    onChange={handleEmailInputChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    placeholder="user@example.com"
                    disabled={configureEmail.isPending}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-300" htmlFor="smtp_password">Şifre</label>
                <input
                  id="smtp_password"
                  name="smtp_password"
                  type="password"
                  value={emailForm.smtp_password}
                  onChange={handleEmailInputChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  placeholder="••••••••"
                  disabled={configureEmail.isPending}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-300" htmlFor="default_sender">Varsayılan Gönderen</label>
                <input
                  id="default_sender"
                  name="default_sender"
                  type="email"
                  value={emailForm.default_sender}
                  onChange={handleEmailInputChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  placeholder="noreply@example.com"
                  disabled={configureEmail.isPending}
                />
              </div>
            </div>
            {configureEmail.isError && (
              <p className="mt-4 text-sm text-rose-400">Ayarlar kaydedilirken bir sorun oluştu. Lütfen tekrar deneyin.</p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <span>Bu adımı atlayabilirsiniz ancak e-posta fonksiyonu devre dışı kalır.</span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSkipEmailConfig}
                  className="rounded-xl border border-slate-600 px-4 py-2 font-semibold text-slate-200 transition-all duration-300 hover:border-amber-400 hover:text-amber-200"
                >
                  Daha Sonra
                </button>
                <button
                  type="button"
                  onClick={handleSaveEmailSettings}
                  disabled={configureEmail.isPending}
                  className="relative overflow-hidden rounded-xl px-6 py-2 font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-amber-500 to-orange-500 transition-transform duration-300" style={{ opacity: configureEmail.isPending ? 0.7 : 1 }}></span>
                  <span className="relative">Kaydet</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Animated Background - Dark Theme */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 -z-10"></div>
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-fuchsia-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1000ms' }}></div>
      </div>

      <div className="relative flex flex-col gap-12">
        {emailBannerMessage && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 shadow-lg">
            <span>{emailBannerMessage}</span>
            <button
              type="button"
              onClick={() => setEmailBannerMessage(null)}
              className="rounded-full border border-amber-300/40 px-3 py-1 text-xs font-semibold text-amber-100 transition-all duration-300 hover:border-amber-200 hover:text-amber-50"
            >
              Kapat
            </button>
          </div>
        )}
        {/* Main Chat Area */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-5 py-4 text-sm text-cyan-50 shadow-lg">
            <div>
              <p className="text-xs uppercase tracking-wide text-cyan-200/80">Assessed Participant</p>
              <p className="text-lg font-semibold text-white">{participantInfo.fullName || "Awaiting information"}</p>
              <p className="text-xs text-cyan-200/70">{participantInfo.email || "Email not provided yet"}</p>
              <p className="text-xs text-cyan-200/70">
                Report sharing consent: {participantInfo.shareReportConsent ? "Granted" : "Not granted"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setParticipantModalOpen(true)}
              className="rounded-xl border border-cyan-300/60 px-4 py-2 text-xs font-semibold text-cyan-50 transition-all duration-300 hover:border-white hover:text-white"
            >
              Update Info
            </button>
          </div>
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
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleStart}
                disabled={blockingForConfig || isLoading || !participantInfoReady}
                className="group/btn relative overflow-hidden rounded-xl px-8 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-transform duration-300 group-hover/btn:scale-110"></div>
                <span className="relative text-white">
                  {session ? "🔄 Restart English Session" : "▶️ Begin English Session"}
                </span>
              </button>
              <button
                onClick={handleAutoResponse}
                disabled={blockingForConfig || isLoading || !participantInfoReady}
                className="group relative overflow-hidden rounded-xl px-6 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-600 transition-transform duration-300 group-hover:scale-110"></div>
                <span className="relative text-white">⚡ Generate Interview Answer</span>
              </button>
            </div>
          </div>

          {/* Voice Capture & Actions */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative h-full rounded-2xl bg-white/5 p-4 backdrop-blur-xl border border-white/10 shadow-2xl">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Voice Capture</h2>
                <p className="mt-1 text-xs text-slate-300">
                  Keep the microphone controls handy to capture your English responses without scrolling.
                </p>
                <div className="mt-4">
                  <ChatInput onSend={handleSend} disabled={!canChat || isLoading} mode={activeMode} />
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-2xl">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-200">Session Controls</h2>
              <p className="text-xs text-slate-300">
                Manage the flow of your English practice and unlock AI-powered feedback when you are ready.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleFinish}
                  disabled={!session || isLoading || blockingForConfig}
                  className="group relative px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
                >
                  <div className={`absolute inset-0 ${!session || isLoading ? 'bg-slate-700' : 'bg-gradient-to-r from-blue-600 to-cyan-600'} transition-transform duration-300 group-hover:scale-110`}></div>
                  <span className="relative">End Session</span>
                </button>
                <button
                  onClick={handleEvaluate}
                  disabled={!session || isLoading || blockingForConfig}
                  className="group relative px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
                >
                  <div className={`absolute inset-0 ${!session || isLoading ? 'bg-slate-700' : 'bg-gradient-to-r from-violet-600 to-fuchsia-600'} transition-transform duration-300 group-hover:scale-110`}></div>
                  <span className="relative flex items-center gap-2">
                    {evaluationInProgress && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent"></span>
                    )}
                    {evaluationInProgress ? "Evaluating…" : "Get Evaluation"}
                  </span>
                </button>
                <button
                  onClick={handleReport}
                  disabled={!evaluation || !sessionSummary || isLoading || blockingForConfig}
                  title={
                    !evaluation
                      ? "Run an evaluation to unlock the detailed report."
                      : !sessionSummary
                        ? "End the session to compile the summary before generating the report."
                        : undefined
                  }
                  className="group relative px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
                >
                  <div className={`absolute inset-0 ${!evaluation || !sessionSummary || isLoading ? 'bg-slate-700' : 'bg-gradient-to-r from-orange-600 to-red-600'} transition-transform duration-300 group-hover:scale-110`}></div>
                  <span className="relative">Generate Report</span>
                </button>
              </div>
              {evaluationInProgress && (
                <p className="w-full rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-xs font-medium text-violet-100 shadow-lg">
                  LLM evaluation in progress. We will surface your scores as soon as the analysis is complete.
                </p>
              )}
            </div>
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
          {emailFeedback && (
            <div className={`rounded-2xl border px-4 py-3 text-sm shadow-lg ${emailFeedbackClass}`}>
              {emailFeedback.message}
            </div>
          )}
        </div>

        {/* Evaluation & Report Section */}
        <div className="space-y-6">
          {evaluation ? (
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 rounded-3xl blur-2xl opacity-40"></div>
              <div className="relative">
                <ScoreCard evaluation={evaluation} />
              </div>
            </div>
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
