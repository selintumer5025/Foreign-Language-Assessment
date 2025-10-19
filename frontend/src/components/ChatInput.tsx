import { FormEvent, useEffect, useRef, useState } from "react";
import type { InteractionMode } from "../types";

interface ChatInputProps {
  disabled?: boolean;
  mode: InteractionMode;
  onSend: (message: string) => void;
}

export function ChatInput({ disabled, onSend, mode }: ChatInputProps) {
  const [message, setMessage] = useState("");
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
        setMessage("");
      } else {
        setMessage(normalized);
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

  useEffect(() => {
    if (mode !== "voice" && recognitionRef.current && isRecording) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, [mode, isRecording]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    onSend(message.trim());
    setMessage("");
  }

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

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          className="h-20 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring"
          placeholder={mode === "voice" ? "Speak or type your response..." : "Type your response..."}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={disabled}
        />
        {mode === "voice" && (
          <button
            type="button"
            onClick={handleToggleRecording}
            disabled={disabled || !speechSupported}
            className={`h-20 rounded-lg px-4 text-sm font-semibold text-white shadow focus:outline-none focus:ring disabled:cursor-not-allowed ${
              isRecording ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600 disabled:bg-slate-400"
            }`}
          >
            {isRecording ? "Stop" : "Record"}
          </button>
        )}
        <button
          type="submit"
          disabled={disabled || message.trim().length === 0}
          className="h-20 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Send
        </button>
      </form>
      {mode === "voice" && !speechSupported && (
        <p className="mt-2 text-xs text-slate-500">
          Voice capture is not supported in this browser. You can still type your answers.
        </p>
      )}
    </div>
  );
}
