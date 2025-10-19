import type { EvaluationResponse } from "../types";

interface ScoreCardProps {
  evaluation: EvaluationResponse;
}

const weightLabels: Record<number, string> = {
  0.25: "25%",
  0.35: "35%",
  0.15: "15%"
};

export function ScoreCard({ evaluation }: ScoreCardProps) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-xl space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">English Assessment Summary</h2>
        <p className="text-sm text-slate-600">Generated at {new Date(evaluation.generated_at).toLocaleString()} (local time)</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-600 uppercase">Overall English Score</p>
          <p className="text-3xl font-bold text-blue-800">{evaluation.overall_score.toFixed(2)} / 4</p>
        </div>
        <div className="rounded-lg bg-blue-100 p-4">
          <p className="text-sm font-semibold text-blue-700 uppercase">CEFR Level</p>
          <p className="text-3xl font-bold text-blue-900">{evaluation.cefr_level}</p>
        </div>
      </div>
      <p className="text-slate-700">{evaluation.summary}</p>
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Detailed English Scores</h3>
        <ul className="mt-2 space-y-2">
          {evaluation.dimensions.map((dimension) => (
            <li
              key={dimension.name}
              className="rounded-lg border border-slate-200 p-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{dimension.name}</p>
                <p className="text-sm text-slate-600">
                  {dimension.score.toFixed(2)} / 4 · {weightLabels[dimension.weight] ?? `${Math.round(dimension.weight * 100)}%`}
                </p>
              </div>
              <p className="mt-1 text-sm text-slate-700">{dimension.feedback}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Key English Errors</h3>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-700">
          {evaluation.errors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900">30-Day English Action Plan</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm text-slate-700">
          {evaluation.action_plan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
