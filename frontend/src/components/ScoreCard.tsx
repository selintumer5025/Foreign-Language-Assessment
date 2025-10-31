import { useEffect, useMemo, useState } from "react";
import type { DualEvaluationResponse, StandardEvaluation } from "../types";

interface ScoreCardProps {
  evaluation: DualEvaluationResponse;
}

const ORDER = ["toefl", "ielts"] as const;

function renderStandardHeader(standard: StandardEvaluation) {
  if (standard.standard_id === "toefl" && standard.overall != null) {
    return `TOEFL ${standard.overall.toFixed(2)}/4`;
  }
  if (standard.standard_id === "ielts" && standard.overall != null) {
    return `IELTS ${standard.overall.toFixed(1)}/9`;
  }
  return `${standard.label} kullanılamıyor`;
}

function StandardDetails({ standard }: { standard: StandardEvaluation }) {
  if (standard.status !== "ok" || standard.overall == null) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
        {standard.error ?? "Değerlendirme tamamlanamadı. Lütfen daha sonra tekrar deneyin."}
      </div>
    );
  }

  const criteriaEntries = Object.entries(standard.criteria);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-500/10">
          <p className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-200">Genel Sonuç</p>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{renderStandardHeader(standard)}</p>
        </div>
        <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-500/10">
          <p className="text-xs font-semibold uppercase text-violet-600 dark:text-violet-200">Yaklaşık CEFR</p>
          <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">{standard.cefr ?? "—"}</p>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Değerlendirme Kriterleri</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Kriter</th>
                <th className="px-4 py-3">Puan</th>
                <th className="px-4 py-3">Yorum</th>
              </tr>
            </thead>
            <tbody>
              {criteriaEntries.map(([id, assessment]) => {
                const label = standard.criterion_labels[id] ?? id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                const max = standard.standard_id === "toefl" ? 4 : 9;
                return (
                  <tr key={id} className="border-t border-slate-100 dark:border-slate-700/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{label}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{assessment.score.toFixed(2)} / {max}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{assessment.comment}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sık Yapılan Hatalar</h3>
        <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {standard.common_errors.map((error) => (
            <li key={error.issue} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{error.issue}</p>
              <p>{error.fix}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Öneriler</h3>
        <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm text-slate-700 dark:text-slate-300">
          {standard.recommendations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Kanıt Alıntıları</h3>
        <div className="mt-2 space-y-3 text-sm italic text-slate-700 dark:text-slate-300">
          {standard.evidence_quotes.map((quote, index) => (
            <p key={`${quote}-${index}`} className="rounded-lg border-l-4 border-violet-400 bg-violet-50/60 p-3 dark:border-violet-500 dark:bg-violet-500/10">
              “{quote}”
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScoreCard({ evaluation }: ScoreCardProps) {
  const orderedStandards = useMemo(() => {
    const mapping = new Map(evaluation.standards.map((std) => [std.standard_id, std] as const));
    return ORDER.map((id) => mapping.get(id)).filter(Boolean) as StandardEvaluation[];
  }, [evaluation.standards]);

  const [activeStandard, setActiveStandard] = useState<StandardEvaluation>(
    orderedStandards[0] ?? evaluation.standards[0]
  );

  useEffect(() => {
    if (!activeStandard) {
      if (orderedStandards[0]) {
        setActiveStandard(orderedStandards[0]);
      }
      return;
    }

    const exists = orderedStandards.some(
      (standard) => standard.standard_id === activeStandard.standard_id
    );

    if (!exists) {
      setActiveStandard(orderedStandards[0] ?? evaluation.standards[0]);
    }
  }, [activeStandard, evaluation.standards, orderedStandards]);

  const warnings = evaluation.warnings ?? [];

  return (
    <div className="space-y-6 rounded-2xl bg-white/95 p-6 shadow-2xl dark:bg-slate-900/80 dark:text-slate-100">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Konuşma Değerlendirme Özeti</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Yerel saat ile {new Date(evaluation.generated_at).toLocaleString()} tarihinde oluşturuldu
        </p>
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-slate-700 dark:text-slate-200">
          {orderedStandards.map((standard) => (
            <span
              key={standard.standard_id}
              className="rounded-full bg-violet-100 px-3 py-1 text-violet-700"
            >
              {renderStandardHeader(standard)}
            </span>
          ))}
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
            Ortak CEFR: {evaluation.crosswalk.consensus_cefr}
          </span>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
          <p className="font-semibold">Çapraz Değerlendirme Notu</p>
          <p>{evaluation.crosswalk.notes}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <p>
              <span className="font-semibold text-emerald-900 dark:text-emerald-100">Güçlü Yönler:</span> {evaluation.crosswalk.strengths.join(", ")}
            </p>
            <p>
              <span className="font-semibold text-emerald-900 dark:text-emerald-100">Gelişim Alanları:</span> {evaluation.crosswalk.focus.join(", ")}
            </p>
          </div>
        </div>
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((warning) => (
              <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
                ⚠️ {warning}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex gap-2">
          {orderedStandards.map((standard) => (
            <button
              key={standard.standard_id}
              type="button"
              onClick={() => setActiveStandard(standard)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeStandard.standard_id === standard.standard_id
                  ? "bg-violet-600 text-white shadow-lg"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {standard.label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <StandardDetails standard={activeStandard} />
        </div>
      </div>
    </div>
  );
}
