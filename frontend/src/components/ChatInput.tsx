import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { InteractionMode } from "../types";

interface ChatInputProps {
  disabled?: boolean;
  mode: InteractionMode;
  onSend: (message: string) => void;
}

export function ChatInput({ disabled, onSend, mode }: ChatInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [message, setMessage] = useState("");
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

      setMessage((previous) => {
        if (!previous) {
          return normalized;
        }
        return `${previous} ${normalized}`.trim();
      });
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabledRef.current) return;

    const normalized = message.trim();
    if (!normalized) return;

    sendRef.current(normalized);
    setMessage("");
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(event.target.value);
  };

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
          {isRecording ? "Stop Recording" : "Start Recording"}
        </button>
      </div>
      {!speechSupported && (
        <p className="mt-2 text-xs text-blue-600">
          Voice capture is not supported in this browser. Please switch to a supported browser to continue.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-2">
        <label className="block text-sm font-semibold text-slate-700" htmlFor="chat-input-textarea">
          Your response
        </label>
        <textarea
          id="chat-input-textarea"
          value={message}
          onChange={handleChange}
          disabled={disabled}
          placeholder={speechSupported ? "Speak or type your answer here" : "Type your answer here"}
          className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 shadow focus-visible:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-blue-50"
          rows={4}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={disabled || message.trim().length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-700"
          >
            {mode === "voice" ? "Send" : "Next Question"}
          </button>
        </div>
      </form>
    </div>
  );
}
