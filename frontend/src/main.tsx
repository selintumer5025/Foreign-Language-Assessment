import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPanel } from "./components/ChatPanel";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
          <ChatPanel />
          <footer className="text-center text-xs text-slate-400">
            English Interview Coach · Built for TOEFL-style speaking practice · Interface and prompts in English only
          </footer>
        </div>
      </div>
    </QueryClientProvider>
  </React.StrictMode>
);
