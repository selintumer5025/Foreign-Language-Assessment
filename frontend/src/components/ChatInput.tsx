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
  const recognitionRef = useRef<any>(null);
  const sendRef = useRef(onSend);
  const disabledRef = useRef(Boolean(disabled));

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

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript ?? "";
      const normalized = transcript.trim();
      if (!normalized) {
        return;
      }
      if (!disabledRef.current) {
        sendRef.current(normalized);
      }
    };

    recognitionRef.current = recognition;
    setSpeechSupported(true);

    return () => {
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
        recognitionRef.current.stop();
      } else {
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
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleToggleRecording}
          disabled={disabled || !speechSupported}
          className={`h-20 rounded-lg px-4 text-sm font-semibold text-white shadow focus:outline-none focus:ring disabled:cursor-not-allowed ${
            isRecording ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600 disabled:bg-slate-400"
          }`}
        >
          {isRecording ? "Stop Recording" : "Start Recording"}
        </button>
      </div>
      {!speechSupported && (
        <p className="mt-2 text-xs text-slate-500">
          Voice capture is not supported in this browser. Please switch to a supported browser to continue.
        </p>
      )}
    </div>
  );
}
