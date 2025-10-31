import { useEffect, useRef, useState } from "react";
import type { InteractionMode } from "../types";

interface ChatInputProps {
  disabled?: boolean;
  mode: InteractionMode;
  onSend: (message: string) => void;
}

export function ChatInput({ disabled, onSend, mode }: ChatInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [lastCaptured, setLastCaptured] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const sendRef = useRef(onSend);
  const disabledRef = useRef(Boolean(disabled));
  const captureBufferRef = useRef("");
  const manualStopRef = useRef(false);
  const shouldResetOnStartRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    sendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    disabledRef.current = Boolean(disabled);
  }, [disabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
      if (manualStopRef.current) {
        manualStopRef.current = false;
        if (finalMessage && !disabledRef.current) {
          sendRef.current(finalMessage);
          setLastCaptured(finalMessage);
        }
        captureBufferRef.current = "";
        return;
      }

      if (!disabledRef.current && recognitionRef.current) {
        restartTimeoutRef.current = window.setTimeout(() => {
          try {
            recognitionRef.current.start();
          } catch {
            // Ignore restart failures
          }
        }, 250);
      }
    };
    recognition.onerror = () => {
      setIsRecording(false);
    };
    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript ?? "";
      const normalized = transcript.trim();
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

  const handleToggleRecording = () => {
    if (!recognitionRef.current || disabled) return;
    try {
      if (isRecording) {
        manualStopRef.current = true;
        recognitionRef.current.stop();
      } else {
        setLastCaptured(null);
        captureBufferRef.current = "";
        manualStopRef.current = false;
        shouldResetOnStartRef.current = true;
        recognitionRef.current.start();
      }
    } catch {
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (mode !== "voice") {
      console.warn("ChatInput now only supports voice mode.");
    }
  }, [mode]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleToggleRecording}
          disabled={disabled || !speechSupported}
          className={`h-20 rounded-lg px-4 text-sm font-semibold text-white shadow transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-700 ${
            isRecording ? "bg-blue-800 hover:bg-blue-900" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isRecording ? "İngilizce Kaydını Durdur" : "İngilizce Kaydı Başlat"}
        </button>
      </div>
      {!speechSupported && (
        <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
          Bu tarayıcıda ses yakalama desteklenmiyor. İngilizce pratiğe devam etmek için desteklenen bir tarayıcıya geçebilirsiniz.
        </p>
      )}
      {lastCaptured && (
        <div className="rounded-lg border border-blue-200 bg-slate-50 p-3 text-xs text-slate-700 shadow dark:border-blue-400/60 dark:bg-slate-800/60 dark:text-slate-200">
          <p className="font-semibold text-blue-700 dark:text-blue-300">Son kaydedilen yanıt</p>
          <p className="mt-1 leading-snug text-slate-800 dark:text-slate-100">{lastCaptured}</p>
        </div>
      )}
    </div>
  );
}
