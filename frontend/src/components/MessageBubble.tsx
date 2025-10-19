import { clsx } from "clsx";
import type { ChatMessage } from "../types";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <div className={clsx("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={clsx(
          "max-w-xl rounded-2xl px-4 py-2 shadow",
          isUser ? "bg-blue-600 text-white" : "bg-white text-slate-900"
        )}
      >
        <p className="text-sm whitespace-pre-line">{message.content}</p>
        <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
