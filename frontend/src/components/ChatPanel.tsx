import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useUploadSessionAudio,
} from "../api/hooks";
import { MessageBubble } from "./MessageBubble";
import { ScoreCard } from "./ScoreCard";
import type {
  DualEvaluationResponse,
  EmailConfigUpdatePayload,
  EmailAttachmentPayload,
  InteractionMode,
  SessionFinishResponse
} from "../types";

type EmailFeedbackState = {
  type: "success" | "error" | "warning" | "info";
  message: string;
};

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

function encodeStringToBase64(value: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

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
  const uploadSessionAudio = useUploadSessionAudio();
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
  const [emailFeedback, setEmailFeedback] = useState<EmailFeedbackState | null>(null);
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStopPromiseRef = useRef<Promise<void> | null>(null);
  const audioStopResolverRef = useRef<(() => void) | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioUploadInfo, setAudioUploadInfo] = useState<string | null>(null);
  const emailFeedbackClass = useMemo(() => {
    if (!emailFeedback) return "";
    switch (emailFeedback.type) {
      case "success":
        return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
      case "error":
        return "border-rose-400/40 bg-rose-500/10 text-rose-100";
      case "info":
        return "border-sky-400/40 bg-sky-500/10 text-sky-100";
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

  const getPreferredAudioMimeType = useCallback((): string => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return "";
    }
    const candidates = ["audio/mpeg", "audio/mp3", "audio/webm;codecs=opus", "audio/webm"];
    for (const type of candidates) {
      try {
        if ((MediaRecorder as any).isTypeSupported?.(type)) {
          return type;
        }
        if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      } catch {
        // Ignore unsupported type errors
      }
    }
    return "";
  }, []);

  const stopAudioCapture = useCallback((): Promise<void> => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      audioStopPromiseRef.current = new Promise<void>((resolve) => {
        audioStopResolverRef.current = resolve;
      });
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error("Failed to stop audio recorder", error);
        audioStopResolverRef.current?.();
        audioStopResolverRef.current = null;
        audioStopPromiseRef.current = null;
      }
      return audioStopPromiseRef.current ?? Promise.resolve();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    return Promise.resolve();
  }, []);

  const encodeBlobToBase64 = useCallback(async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }, []);

  useEffect(() => {
    if (!session?.session_id) {
      return;
    }

    let cancelled = false;

    const startRecording = async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setAudioError("Bu tarayıcıda ses kaydı desteklenmiyor.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const preferredMimeType = getPreferredAudioMimeType();
        let recorder: MediaRecorder | null = null;
        try {
          recorder = preferredMimeType
            ? new MediaRecorder(stream, { mimeType: preferredMimeType })
            : new MediaRecorder(stream);
        } catch (error) {
          console.warn("Falling back to default MediaRecorder configuration", error);
          recorder = new MediaRecorder(stream);
        }

        mediaRecorderRef.current = recorder;
        audioStreamRef.current = stream;
        audioChunksRef.current = [];
        setAudioBlob(null);
        setAudioUploadInfo(null);
        setAudioError(null);
        setIsAudioRecording(true);
        setAudioMimeType(preferredMimeType || recorder.mimeType || null);

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        recorder.onerror = (event) => {
          console.error("Audio recorder error", event);
          setAudioError("Ses kaydı sırasında bir hata oluştu.");
        };
        recorder.onstop = () => {
          setIsAudioRecording(false);
          const effectiveMime =
            preferredMimeType || recorder.mimeType || audioChunksRef.current[0]?.type || "audio/webm";
          const blob = new Blob(audioChunksRef.current, { type: effectiveMime });
          setAudioBlob(blob);
          setAudioMimeType(effectiveMime);
          audioChunksRef.current = [];
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach((track) => track.stop());
            audioStreamRef.current = null;
          }
          mediaRecorderRef.current = null;
          audioStopResolverRef.current?.();
          audioStopResolverRef.current = null;
          audioStopPromiseRef.current = null;
        };

        recorder.start();
      } catch (error) {
        console.error("Failed to start audio recording", error);
        setAudioError("Mikrofon erişimi alınamadı veya MediaRecorder desteklenmiyor.");
      }
    };

    startRecording();

    return () => {
      cancelled = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.error("Failed to stop audio recorder during cleanup", error);
        }
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      audioStopResolverRef.current = null;
      audioStopPromiseRef.current = null;
    };
  }, [session?.session_id, getPreferredAudioMimeType]);

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
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [lastCapturedByMessage, setLastCapturedByMessage] = useState<Record<string, string>>({});
  const recognitionRef = useRef<any>(null);
  const sendRef = useRef<(message: string) => void>(() => {});
  const disabledRef = useRef(false);
  const captureBufferRef = useRef("");
  const manualStopRef = useRef(false);
  const shouldResetOnStartRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);
  const activePromptIdRef = useRef<string | null>(null);

  useEffect(() => {
    activePromptIdRef.current = activePromptId;
  }, [activePromptId]);

  useEffect(() => {
    sendRef.current = handleSend;
  }, [handleSend]);

  useEffect(() => {
    if (transcript.length === 0) {
      setLastCapturedByMessage({});
      setActivePromptId(null);
    }
  }, [transcript.length]);

  useEffect(() => {
    if (activeMode !== "voice") {
      console.warn("ChatPanel now only supports voice mode.");
    }
  }, [activeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onstart = () => {
      if (shouldResetOnStartRef.current) {
        captureBufferRef.current = "";
        shouldResetOnStartRef.current = false;
      }
      setIsRecording(true);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }

      const finalMessage = captureBufferRef.current.trim();
      const targetMessageId = activePromptIdRef.current;

      if (manualStopRef.current) {
        manualStopRef.current = false;
        if (finalMessage && !disabledRef.current && targetMessageId) {
          sendRef.current(finalMessage);
          setLastCapturedByMessage((prev) => ({
            ...prev,
            [targetMessageId]: finalMessage,
          }));
        }
        captureBufferRef.current = "";
        setActivePromptId(null);
        return;
      }

      if (!disabledRef.current && recognitionRef.current) {
        restartTimeoutRef.current = window.setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch {
            // Ignore restart failures
          }
        }, 250);
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
      setActivePromptId(null);
    };

    recognition.onresult = (event: any) => {
      const transcriptValue = event?.results?.[0]?.[0]?.transcript ?? "";
      const normalized = transcriptValue.trim();
      if (!normalized) {
        return;
      }

      captureBufferRef.current = `${captureBufferRef.current} ${normalized}`.trim();
    };

    recognitionRef.current = recognition;
    setSpeechSupported(true);

    return () => {
      manualStopRef.current = true;
      if (restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore if recognition was never started
        }
      }
      recognitionRef.current = null;
    };
  }, []);

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
    void stopAudioCapture();
    setAudioBlob(null);
    setAudioUploadInfo(null);
    setAudioError(null);
    setIsAudioRecording(false);
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

  const handleSend = useCallback(
    async (message: string) => {
      if (!session?.session_id || blockingForConfig) return;
      await chatMutation.mutateAsync({ session_id: session.session_id, user_message: message });
    },
    [session?.session_id, blockingForConfig, chatMutation]
  );

  const handleToggleRecordingForMessage = useCallback(
    (messageId: string) => {
      if (!recognitionRef.current || disabledRef.current) return;

      if (isRecording) {
        if (activePromptIdRef.current !== messageId) {
          return;
        }
        manualStopRef.current = true;
        try {
          recognitionRef.current.stop();
        } catch {
          setIsRecording(false);
        }
        return;
      }

      setActivePromptId(messageId);
      captureBufferRef.current = "";
      setLastCapturedByMessage((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      manualStopRef.current = false;
      shouldResetOnStartRef.current = true;
      try {
        recognitionRef.current.start();
      } catch {
        setIsRecording(false);
      }
    },
    [isRecording]
  );

  const handleFinish = async () => {
    if (!session?.session_id || blockingForConfig) return;
    if (!ensureParticipantInfo()) return;

    const sessionId = session.session_id;
    const sessionStartedAt = session.started_at;

    setEmailFeedback(null);
    setAudioUploadInfo(null);

    try {
      await stopAudioCapture();
      const summary = await finishSession.mutateAsync({ session_id: sessionId });
      setSessionSummary(summary);

      setEmailFeedback({ type: "info", message: "Değerlendirme başlatılıyor..." });
      const evaluationResult = await evaluateSession.mutateAsync({ session_id: sessionId });
      setEvaluation(evaluationResult);

      const participant = {
        full_name: participantInfo.fullName.trim(),
        email: participantInfo.email.trim(),
        share_report_consent: participantInfo.shareReportConsent,
        share_report_consent_granted_at: participantInfo.shareReportConsentGrantedAt,
      };

      setEmailFeedback({ type: "info", message: "Rapor hazırlanıyor..." });
      const metadata = {
        session_id: evaluationResult.session.id,
        started_at: sessionStartedAt,
        duration_seconds: summary.duration_seconds,
        word_count: summary.word_count,
        summary: summary.summary,
        participant,
        report_generated_at: new Date().toISOString(),
      };
      const report = await generateReport.mutateAsync({ evaluation: evaluationResult, session_metadata: metadata });
      setReportUrl(report.report_url);

      if (sessionId) {
        if (audioBlob) {
          try {
            const encoded = await encodeBlobToBase64(audioBlob);
            const audioResult = await uploadSessionAudio.mutateAsync({
              session_id: sessionId,
              audio_base64: encoded,
              mime_type: audioMimeType ?? audioBlob.type,
              report_date: metadata.report_generated_at,
            });
            setAudioUploadInfo(`Ses kaydı kaydedildi: ${audioResult.filename}`);
          } catch (error) {
            console.error("Failed to upload session audio", error);
            setAudioUploadInfo("Ses kaydı kaydedilemedi.");
          }
        } else {
          setAudioUploadInfo("Ses kaydı yakalanamadı.");
        }
      }

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

      setEmailFeedback({
        type: "info",
        message: "Rapor başarıyla oluşturuldu. Mail hazırlanıyor...",
      });

      const reportAttachments: EmailAttachmentPayload[] = [];
      try {
        const reportFilename = evaluationResult.session.id
          ? `assessment_report_${evaluationResult.session.id}.html`
          : "assessment_report.html";
        const encodedReport = encodeStringToBase64(report.html);
        reportAttachments.push({
          filename: reportFilename,
          content_type: "text/html",
          data: encodedReport,
        });
      } catch (error) {
        console.error("Failed to prepare report attachment", error);
        setEmailFeedback({
          type: "error",
          message: "Rapor e-posta eki hazırlanırken bir hata oluştu.",
        });
        return;
      }

      setEmailFeedback({
        type: "info",
        message: "Mail gönderiliyor...",
      });

      const subject = `${participant.full_name}- Assessment`;
      const body = [
        "Merhaba,",
        "",
        `Yeni oluşturulan dil değerlendirme raporu ${participant.full_name} (${participant.email}) tarafından oluşturulan değerlendirmeye aittir.`,
        "Detaylı rapora aşağıdaki bağlantıdan ulaşabilirsiniz:",
        report.report_url,
        "Bu bağlantı güvenlik nedeniyle 15 dakika içinde sona erecektir.",
        "",
        "Bu mesaj sistem tarafından otomatik gönderilmiştir.",
      ].join("\n");

      try {
        await sendEmail.mutateAsync({
          to: recipientEmail,
          subject,
          body,
          links: [report.report_url],
          session_id: sessionId,
          attachments: reportAttachments,
        });
        setEmailFeedback({
          type: "success",
          message: `Mail ${recipientEmail} adresine başarıyla gönderildi.`,
        });
      } catch (error) {
        console.error("Failed to send report email", error);
        setEmailFeedback({
          type: "error",
          message: "Rapor e-posta ile gönderilemedi. Lütfen e-posta ayarlarını kontrol edin.",
        });
        return;
      }
    } catch (error) {
      console.error("Failed to finalize interview workflow", error);
      setEmailFeedback({
        type: "error",
        message: "Oturum sonlandırılırken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
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
      sendEmail.isPending ||
      configureGpt5.isPending,
    [
      startSession.isPending,
      chatMutation.isPending,
      finishSession.isPending,
      evaluationInProgress,
      generateReport.isPending,
      sendEmail.isPending,
      configureGpt5.isPending,
    ]
  );

  useEffect(() => {
    const disabled = !canChat || isLoading || !speechSupported;
    disabledRef.current = disabled;
    if (disabled && recognitionRef.current && isRecording) {
      manualStopRef.current = true;
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore stop failures
      }
    }
  }, [canChat, isLoading, speechSupported, isRecording]);

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
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-200/80 backdrop-blur-sm dark:bg-slate-950/80">
          <div className="flex min-h-full items-center justify-center px-4 py-10">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-cyan-400/40 bg-white p-8 text-slate-800 shadow-2xl dark:border-cyan-500/40 dark:bg-slate-900/95 dark:text-slate-100">
              <h2 className="text-2xl font-bold">Yapay Zeka Destekli Konuşma Değerlendirmesine Hoş Geldiniz✨</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Görüşmeye başlamadan önce mikrofonunuzun açık olduğundan ve sessiz bir ortamda bulunduğunuzdan emin olun.</p>
              <div className="mt-5 space-y-3 rounded-2xl border border-cyan-300/50 bg-cyan-50/70 p-4 text-left dark:border-cyan-500/20 dark:bg-slate-900/60">
                <h3 className="text-base font-semibold text-cyan-700 dark:text-cyan-200">Aydınlatma Metni</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Bu uygulama, yabancı dil yeterliliğinizi değerlendirmek amacıyla sesli ve yazılı yanıtlarınızı işler. Paylaştığınız bilgiler sadece değerlendirme süreci boyunca saklanır, üçüncü kişilerle paylaşılmaz ve dilediğiniz zaman silinebilir. Dil değerlendirme raporlarınız selintumer@gmail.com adresine iletilir.
                </p>
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  <li>Kimlik ve iletişim bilgileriniz seans raporlarını oluşturmak ve size geri bildirim iletmek için kullanılır.</li>
                  <li>Yanıtlarınız yapay zekâ modelleri tarafından analiz edilerek ilerlemenize yardımcı olacak puan ve öneriler sunulur.</li>
                  <li>Dilediğiniz zaman desteğe başvurarak verilerinize erişme, düzeltme veya silme hakkınızı kullanabilirsiniz.</li>
                </ul>
              </div>
              <div className="mt-6 grid gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="participant_full_name">Ad Soyad</label>
                  <input
                    id="participant_full_name"
                    name="fullName"
                    type="text"
                    value={participantForm.fullName}
                    onChange={handleParticipantInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="Adınız Soyadınız"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="participant_email">E-posta Adresi</label>
                  <input
                    id="participant_email"
                    name="email"
                    type="email"
                    value={participantForm.email}
                    onChange={handleParticipantInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="ornek@domain.com"
                  />
                </div>
              </div>
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/80">
                <input
                  id="participant_consent"
                  name="consent"
                  type="checkbox"
                  checked={participantForm.consent}
                  onChange={handleParticipantInputChange}
                  className="mt-1 h-4 w-4 rounded border border-slate-400 text-cyan-600 focus:ring-cyan-400 dark:border-slate-600 dark:bg-slate-800 dark:text-cyan-500"
                  required
                />
                <label className="text-sm text-slate-700 dark:text-slate-200" htmlFor="participant_consent">
                  Aydınlatma metnini okudum, kişisel verilerimin değerlendirme oturumu kapsamında işlenmesine izin veriyorum.
                </label>
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/80">
                <input
                  id="participant_share_report"
                  name="shareReport"
                  type="checkbox"
                  checked={participantForm.shareReport}
                  onChange={handleParticipantInputChange}
                  className="mt-1 h-4 w-4 rounded border border-slate-400 text-cyan-600 focus:ring-cyan-400 dark:border-slate-600 dark:bg-slate-800 dark:text-cyan-500"
                />
                <label className="text-sm text-slate-700 dark:text-slate-200" htmlFor="participant_share_report">
                  Dil değerlendirme raporunun, belirtilen e-posta adresine paylaşılmasına onay veriyorum.
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
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
                  <span className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-600 transition-transform duration-300 dark:from-cyan-500 dark:to-blue-500"></span>
                  <span className="relative">Kaydet ve Devam Et</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {gpt5StatusQuery.isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-200/80 backdrop-blur-sm dark:bg-slate-950/80">
          <div className="rounded-2xl border border-violet-400/40 bg-white px-8 py-6 text-center text-slate-800 shadow-2xl dark:border-violet-500/30 dark:bg-slate-900/90 dark:text-slate-200">
            <p className="text-lg font-semibold">GPT-5 yapılandırması kontrol ediliyor…</p>
          </div>
        </div>
      )}

      {requireApiKey && !gpt5StatusQuery.isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-200/80 backdrop-blur-sm dark:bg-slate-950/80">
          <div className="w-full max-w-lg rounded-3xl border border-violet-400/50 bg-white p-8 text-slate-800 shadow-2xl dark:border-violet-500/50 dark:bg-slate-900/95 dark:text-slate-100">
            <h2 className="text-2xl font-bold">Değerlendirme için GPT-5 anahtarını ekleyin</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              TOEFL ve IELTS değerlendirmelerini etkinleştirmek için GPT-5 API anahtarınızı girin. Anahtar yalnızca bu oturum boyunca sunucu belleğinde tutulur.
            </p>
            <label className="mt-6 block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="gpt5-api-key">
              GPT-5 API Anahtarı
            </label>
            <input
              id="gpt5-api-key"
              type="password"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="sk-..."
              value={apiKeyInput}
              onChange={handleApiKeyChange}
              disabled={configureGpt5.isPending}
            />
            {apiKeyError ? (
              <p className="mt-2 text-sm text-rose-500 dark:text-rose-400">{apiKeyError}</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Yardım gerekiyor mu? Yönetici ekibinizle iletişime geçin.</p>
            )}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim() || configureGpt5.isPending}
                className="group relative overflow-hidden rounded-xl px-6 py-3 font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-transform duration-300 group-hover:scale-105"></div>
                <span className="relative">API Anahtarını Kaydet</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {emailModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-200/80 backdrop-blur-sm dark:bg-slate-950/80">
          <div className="w-full max-w-2xl rounded-3xl border border-amber-300 bg-white p-8 text-slate-800 shadow-2xl dark:border-amber-500/50 dark:bg-slate-900/95 dark:text-slate-100">
            <h2 className="text-2xl font-bold">E-posta Ayarlarını Tamamlayın</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Raporlarınızın otomatik olarak gönderilmesi için SMTP bilgilerini girin. Bu adımı şimdi atlayabilirsiniz ancak e-posta gönderimi çalışmayacaktır.
            </p>
            {emailStatusQuery.data?.missing_fields?.length ? (
              <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">
                Eksik alanlar: {emailStatusQuery.data.missing_fields.join(", ")}
              </p>
            ) : null}
            <div className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="smtp_host">SMTP Sunucusu</label>
                <input
                  id="smtp_host"
                  name="smtp_host"
                  type="text"
                  value={emailForm.smtp_host}
                  onChange={handleEmailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="smtp.mailprovider.com"
                  disabled={configureEmail.isPending}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="target_email">Varsayılan Rapor Alıcısı</label>
                <input
                  id="target_email"
                  name="target_email"
                  type="email"
                  value={emailForm.target_email}
                  onChange={handleEmailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="ornek@domain.com"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="smtp_port">Port</label>
                  <input
                    id="smtp_port"
                    name="smtp_port"
                    type="number"
                    min={1}
                    value={emailForm.smtp_port}
                    onChange={handleEmailInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="587"
                    disabled={configureEmail.isPending}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="smtp_username">Kullanıcı Adı</label>
                  <input
                    id="smtp_username"
                    name="smtp_username"
                    type="text"
                    value={emailForm.smtp_username}
                    onChange={handleEmailInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="user@example.com"
                    disabled={configureEmail.isPending}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="smtp_password">Şifre</label>
                <input
                  id="smtp_password"
                  name="smtp_password"
                  type="password"
                  value={emailForm.smtp_password}
                  onChange={handleEmailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="••••••••"
                  disabled={configureEmail.isPending}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="default_sender">Varsayılan Gönderen</label>
                <input
                  id="default_sender"
                  name="default_sender"
                  type="email"
                  value={emailForm.default_sender}
                  onChange={handleEmailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="noreply@example.com"
                  disabled={configureEmail.isPending}
                />
              </div>
            </div>
            {configureEmail.isError && (
              <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">Ayarlar kaydedilirken bir sorun oluştu. Lütfen tekrar deneyin.</p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span>Bu adımı atlayabilirsiniz ancak e-posta fonksiyonu devre dışı kalır.</span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSkipEmailConfig}
                  className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition-all duration-300 hover:border-amber-400 hover:text-amber-600 dark:border-slate-600 dark:text-slate-200 dark:hover:border-amber-400 dark:hover:text-amber-200"
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
      {/* Animasyonlu Arka Plan */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"></div>
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full blur-3xl bg-cyan-200/40 animate-pulse dark:bg-violet-500/20"></div>
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full blur-3xl bg-violet-200/40 animate-pulse" style={{ animationDelay: "700ms" }}></div>
        <div className="absolute top-1/2 left-1/2 h-96 w-96 rounded-full blur-3xl bg-fuchsia-200/40 animate-pulse" style={{ animationDelay: "1000ms" }}></div>
      </div>

      <div className="relative flex flex-col gap-12">
        {emailBannerMessage && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-lg dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
            <span>{emailBannerMessage}</span>
            <button
              type="button"
              onClick={() => setEmailBannerMessage(null)}
              className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 transition-all duration-300 hover:border-amber-400 hover:text-amber-900 dark:border-amber-300/40 dark:text-amber-100 dark:hover:border-amber-200 dark:hover:text-amber-50"
            >
              Kapat
            </button>
          </div>
        )}
        {/* Ana Sohbet Alanı */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-300 bg-cyan-50 px-5 py-4 text-sm text-cyan-900 shadow-lg dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-50">
            <div>
              <p className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-200/80">Değerlendirilen Aday</p>
              <p className="text-lg font-semibold text-cyan-900 dark:text-white">{participantInfo.fullName || "Bilgiler bekleniyor"}</p>
              <p className="text-xs text-cyan-700/80 dark:text-cyan-200/70">{participantInfo.email || "E-posta henüz girilmedi"}</p>
              <p className="text-xs text-cyan-700/80 dark:text-cyan-200/70">
                Rapor paylaşım onayı: {participantInfo.shareReportConsent ? "Verildi" : "Bekleniyor"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setParticipantModalOpen(true)}
              className="rounded-xl border border-cyan-400 px-4 py-2 text-xs font-semibold text-cyan-800 transition-all duration-300 hover:border-cyan-500 hover:text-cyan-900 dark:border-cyan-300/60 dark:text-cyan-50 dark:hover:border-white dark:hover:text-white"
            >
              Bilgileri Güncelle
            </button>
          </div>
          {/* Karşılama Bölümü */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 p-3 shadow-lg shadow-violet-500/50">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
            </div>
            <h1 className="mb-4 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 bg-clip-text text-5xl font-bold text-transparent">
              Mülakat Koçu Yapay Zekâ Asistanı
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              <span className="block">Tüm yönlendirmeler Türkçe, konuşma egzersizleri ise İngilizce yapılır.</span>
              <span className="block">Akıcı ve anlaşılır yanıtlar vermeniz değerlendirmeyi olumlu etkileyecektir.</span>
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleStart}
                disabled={blockingForConfig || isLoading || !participantInfoReady}
                className="group/btn relative overflow-hidden rounded-xl px-8 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-transform duration-300 group-hover/btn:scale-110"></div>
                <span className="relative text-white">
                  {session ? "🔄 Oturumu Yeniden Başlat" : "▶️ Oturumu Başlat"}
                </span>
              </button>
              <button
                onClick={handleAutoResponse}
                disabled={blockingForConfig || isLoading || !participantInfoReady}
                className="group relative overflow-hidden rounded-xl px-6 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-600 transition-transform duration-300 group-hover:scale-110"></div>
                <span className="relative text-white">⚡ Örnek Mülakat Yanıtı Oluştur</span>
              </button>
            </div>
          </div>

          {/* Ses Kaydı ve İşlemler */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="relative group">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100"></div>
              <div className="relative h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-200">Sesli Yanıt Yakalama</h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Mikrofon kontrollerine buradan ulaşarak İngilizce yanıtlarınızı hızlıca kaydedin.
                </p>
                <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    Soruların yanında yer alan <span className="font-semibold text-cyan-700 dark:text-cyan-200">İngilizce Kaydı Başlat</span>
                    {" "}düğmesine basarak yanıtınızı kaydedebilir, aynı tuşa tekrar basarak kaydı sonlandırabilirsiniz.
                  </p>
                  <p>
                    Aktif bir kayıt sırasında yalnızca ilgili sorunun tuşu kullanılabilir. Farklı bir soruya geçmek için mevcut kaydı durdurmayı unutmayın.
                  </p>
                  {!speechSupported && (
                    <p className="rounded-lg border border-blue-200 bg-slate-50 p-3 text-blue-700 dark:border-blue-400/60 dark:bg-slate-800/60 dark:text-blue-200">
                      Bu tarayıcıda ses yakalama desteklenmiyor. İngilizce pratiğe devam etmek için desteklenen bir tarayıcıya geçebilirsiniz.
                    </p>
                  )}
                </div>
                {session && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200">
                    {audioError ? (
                      <p className="text-amber-600 dark:text-amber-200">{audioError}</p>
                    ) : isAudioRecording ? (
                      <p>Mülakat sesi kaydediliyor…</p>
                    ) : audioBlob ? (
                      <p>Mülakat sesi kaydedildi. Raporla birlikte saklanacak.</p>
                    ) : (
                      <p>Ses kaydedici hazırlanıyor…</p>
                    )}
                    {uploadSessionAudio.isPending && (
                      <p className="mt-1 text-slate-500 dark:text-slate-400">Ses kaydı yükleniyor…</p>
                    )}
                    {audioUploadInfo && <p className="mt-1 text-slate-500 dark:text-slate-400">{audioUploadInfo}</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-200">Oturum Kontrolleri</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                İlerlemeyi buradan yönetebilir ve hazırsanız yapay zekâ değerlendirmesini başlatabilirsiniz.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleFinish}
                  disabled={!session || isLoading || blockingForConfig}
                  className="group relative px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
                >
                  <div className={`absolute inset-0 ${!session || isLoading ? 'bg-slate-700' : 'bg-gradient-to-r from-blue-600 to-cyan-600'} transition-transform duration-300 group-hover:scale-110`}></div>
                  <span className="relative">Oturumu Sonlandır</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Görüşmeyi bitirdiğinizde değerlendirme, rapor oluşturma ve e-posta gönderimi otomatik olarak tamamlanır.
              </p>
              {evaluationInProgress && (
                <p className="w-full rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-xs font-medium text-violet-700 shadow-lg dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-100">
                  Yapay zekâ değerlendirmesi devam ediyor. Analiz tamamlandığında puanlarınızı paylaşacağız.
                </p>
              )}
              {generateReport.isPending && (
                <p className="w-full rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-xs font-medium text-cyan-700 shadow-lg dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-100">
                  Rapor hazırlanıyor...
                </p>
              )}
              {sendEmail.isPending && (
                <p className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700 shadow-lg dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
                  Mail gönderiliyor...
                </p>
              )}
            </div>
          </div>

          {/* Sohbet Mesajları */}
          <div className="relative group">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-violet-300/40 to-fuchsia-300/40 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100 dark:from-violet-500/20 dark:to-fuchsia-500/20"></div>
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl">
              <div className="h-[480px] overflow-y-auto p-6 custom-scrollbar">
                {transcript.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="mb-6 inline-flex rounded-full bg-gradient-to-br from-violet-400/30 to-fuchsia-400/30 p-6 dark:from-violet-500/20 dark:to-fuchsia-500/20">
                      <svg className="h-16 w-16 text-violet-500 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="max-w-md text-lg text-slate-600 dark:text-slate-400">
                      Oturumu başlatarak İngilizce konuşma alıştırmasına geçebilirsiniz. Soruları yüksek sesle dinleyip mikrofonla yanıtlayabilirsiniz.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transcript.map((message) => {
                      if (message.role === "assistant") {
                        const isActive = isRecording && activePromptId === message.id;
                        const disabled =
                          !speechSupported ||
                          !canChat ||
                          isLoading ||
                          (isRecording && activePromptId !== message.id);
                        const lastCaptured = lastCapturedByMessage[message.id];

                        return (
                          <div key={message.id} className="space-y-2">
                            <div className="flex flex-wrap items-start justify-start gap-3">
                              <div className="max-w-xl rounded-2xl bg-white px-4 py-2 text-slate-900 shadow dark:bg-slate-800 dark:text-slate-100">
                                <p className="text-sm whitespace-pre-line">{message.content}</p>
                                <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
                                  {new Date(message.timestamp).toLocaleTimeString()}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleRecordingForMessage(message.id)}
                                disabled={disabled}
                                className={`rounded-lg px-4 py-3 text-sm font-semibold text-white shadow transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-700 ${
                                  isActive ? "bg-blue-800 hover:bg-blue-900" : "bg-blue-600 hover:bg-blue-700"
                                }`}
                              >
                                {isActive ? "İngilizce Kaydını Durdur" : "İngilizce Kaydı Başlat"}
                              </button>
                            </div>
                            {lastCaptured && (
                              <div className="max-w-xl rounded-lg border border-blue-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 shadow dark:border-blue-400/60 dark:bg-slate-800/60 dark:text-slate-100">
                                <p className="font-semibold text-blue-700 dark:text-blue-300">Son kaydedilen yanıt</p>
                                <p className="mt-1 leading-snug">{lastCaptured}</p>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return <MessageBubble key={message.id} message={message} />;
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Oturum Özeti */}
          {sessionSummary && (
            <div className="relative group">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-300/40 to-cyan-300/40 blur-lg dark:from-emerald-500/30 dark:to-cyan-500/30"></div>
              <div className="relative rounded-2xl border border-emerald-200 bg-white px-6 py-4 shadow-xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl">
                <div className="flex items-center gap-6 text-sm font-semibold text-emerald-700 dark:text-white">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
                    Kelime Sayısı: {sessionSummary.word_count}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400"></span>
                    Süre: {sessionSummary.duration_seconds}s
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Report Link */}
          {reportUrl && (
            <div className="flex flex-col gap-2">
              <a
                href={reportUrl}
                className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 font-semibold text-white transition-all duration-300 hover:scale-105 hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-violet-500/50 shadow-lg"
                target="_blank"
                rel="noreferrer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Raporu Görüntüle
              </a>
              <p className="text-xs text-slate-600 dark:text-slate-400">Bağlantı 15 dakika içinde sona erer.</p>
            </div>
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
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-violet-400/40 to-fuchsia-400/40 blur-2xl opacity-40 dark:from-violet-500/30 dark:to-fuchsia-500/30"></div>
              <div className="relative">
                <ScoreCard evaluation={evaluation} />
              </div>
            </div>
          ) : (
            <div className="relative group">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-300/30 to-fuchsia-300/30 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100 dark:from-violet-500/20 dark:to-fuchsia-500/20"></div>
              <div className="relative rounded-3xl border-2 border-dashed border-slate-300 bg-white p-10 text-center shadow-2xl dark:border-white/20 dark:bg-white/5 dark:backdrop-blur-xl">
                <div className="mb-6 inline-flex rounded-full bg-gradient-to-br from-violet-400/30 to-fuchsia-400/30 p-6 dark:from-violet-500/20 dark:to-fuchsia-500/20">
                  <svg className="h-14 w-14 text-violet-500 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="mb-3 text-xl font-semibold text-slate-800 dark:text-white">Yapay Zekâ Geri Bildirimi</h3>
                <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                  Değerlendirmeyi başlatarak TOEFL tarzı puanlama, CEFR seviyeleri ve kişiselleştirilmiş gelişim önerilerine ulaşabilirsiniz.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
