from __future__ import annotations

from datetime import datetime
from html import escape
from pathlib import Path
from typing import Optional

from ..config import get_settings
from ..models import DualEvaluationResponse, StandardEvaluation

REPORTS_DIR = Path("backend/generated_reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _parse_iso_datetime(raw: str) -> datetime | None:
    value = raw.strip()
    if not value:
        return None
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _format_criteria_rows(standard: StandardEvaluation) -> str:
    rows = []
    for criterion_id, criterion in standard.criteria.items():
        label = standard.criterion_labels.get(criterion_id, criterion_id.replace("_", " ").title())
        max_scale = 4 if standard.standard_id == "toefl" else 9
        rows.append(
            "<tr>"
            f"<td>{label}</td>"
            f"<td>{criterion.score:.2f} / {max_scale}</td>"
            f"<td>{criterion.comment}</td>"
            "</tr>"
        )
    return "".join(rows)


def _format_errors_list(standard: StandardEvaluation) -> str:
    return "".join(f"<li><strong>{error.issue}:</strong> {error.fix}</li>" for error in standard.common_errors)


def _format_quotes(quotes: list[str]) -> str:
    return "".join(f"<blockquote>“{quote}”</blockquote>" for quote in quotes)


def _render_standard_section(standard: StandardEvaluation) -> str:
    if standard.status != "ok":
        return f"""
        <section class=\"card\">
            <h2>{standard.label}</h2>
            <div class=\"alert alert-error\">Evaluation failed: {standard.error or 'Unknown error'}.</div>
        </section>
        """

    criteria_rows = _format_criteria_rows(standard)
    errors_list = _format_errors_list(standard)
    recs_list = "".join(f"<li>{item}</li>" for item in standard.recommendations)
    quotes_html = _format_quotes(standard.evidence_quotes)
    overall_caption = (
        f"{standard.overall:.2f} / 4" if standard.standard_id == "toefl" else f"Band {standard.overall:.1f}"
    )

    return f"""
    <section class=\"card\">
        <div class=\"card-header\">
            <h2>{standard.label}</h2>
            <div class=\"score\">{overall_caption}</div>
            <div class=\"cefr\">Approx. CEFR: {standard.cefr or '—'}</div>
        </div>
        <h3>Criteria Breakdown</h3>
        <table>
            <thead>
                <tr><th>Criterion</th><th>Score</th><th>Comment</th></tr>
            </thead>
            <tbody>
                {criteria_rows}
            </tbody>
        </table>
        <h3>Common Errors</h3>
        <ul>{errors_list}</ul>
        <h3>Recommendations</h3>
        <ol>{recs_list}</ol>
        <h3>Evidence Quotes</h3>
        <div class=\"quotes\">{quotes_html}</div>
    </section>
    """


def _format_participant_sentence(evaluation: DualEvaluationResponse, session_metadata: Optional[dict]) -> str:
    participant_data: dict[str, str] = {}
    if session_metadata and isinstance(session_metadata, dict):
        raw_participant = session_metadata.get("participant")
        if isinstance(raw_participant, dict):
            participant_data = raw_participant  # type: ignore[assignment]

    full_name = str(participant_data.get("full_name") or "").strip()
    email = str(participant_data.get("email") or "").strip()

    report_timestamp = None
    timestamp_source = "evaluation"
    if session_metadata and isinstance(session_metadata, dict):
        raw_timestamp = session_metadata.get("report_generated_at")
        if isinstance(raw_timestamp, str):
            parsed_timestamp = _parse_iso_datetime(raw_timestamp)
            if parsed_timestamp:
                report_timestamp = parsed_timestamp
                timestamp_source = "metadata"

    if report_timestamp is None:
        report_timestamp = evaluation.generated_at
        timestamp_source = "evaluation"

    formatted_timestamp = report_timestamp.strftime("%d.%m.%Y %H:%M")
    timezone_suffix = ""
    if report_timestamp.tzinfo:
        tz_name = report_timestamp.tzinfo.tzname(report_timestamp)
        timezone_suffix = f" ({tz_name or report_timestamp.tzinfo})"
    elif timestamp_source == "evaluation":
        timezone_suffix = " (UTC)"

    identity_parts: list[str] = []
    if full_name:
        identity_parts.append(escape(full_name))
    if email:
        identity_parts.append(f"({escape(email)})" if full_name else escape(email))

    identity = " ".join(identity_parts).strip()

    if identity:
        return f"Bu rapor {formatted_timestamp}{timezone_suffix} tarihinde {identity} tarafından gerçekleştirilen değerlendirmeye aittir."
    return f"Bu rapor {formatted_timestamp}{timezone_suffix} tarihinde oluşturuldu."




def build_html_report(evaluation: DualEvaluationResponse, session_metadata: Optional[dict] = None) -> str:
    settings = get_settings()
    warnings_html = "".join(f"<div class=\"alert alert-warning\">{w}</div>" for w in (evaluation.warnings or []))

    standard_sections = "".join(_render_standard_section(std) for std in evaluation.standards)

    toefl_badge = next((s for s in evaluation.standards if s.standard_id == "toefl"), None)
    ielts_badge = next((s for s in evaluation.standards if s.standard_id == "ielts"), None)

    def badge_text(standard: StandardEvaluation | None, denom: str) -> str:
        if not standard or standard.status != "ok" or standard.overall is None:
            return f"{denom} unavailable"
        if standard.standard_id == "toefl":
            return f"TOEFL {standard.overall:.2f}/4 (~{standard.cefr})"
        return f"IELTS {standard.overall:.1f}/9 (~{standard.cefr})"

    badges = "".join(
        f"<span class=\"badge\">{text}</span>"
        for text in (
            badge_text(toefl_badge, "TOEFL"),
            badge_text(ielts_badge, "IELTS"),
            f"Consensus CEFR: {evaluation.crosswalk.consensus_cefr}",
        )
    )

    participant_sentence = _format_participant_sentence(evaluation, session_metadata)
    participant_summary_html = f"<p class=\"metadata\">{participant_sentence}</p>"
    session_summary_html = ""
    if session_metadata and isinstance(session_metadata, dict):
        raw_summary = session_metadata.get("summary")
        if isinstance(raw_summary, str) and raw_summary.strip():
            session_summary_html = f"<p class=\"metadata\"><strong>Session Summary:</strong> {escape(raw_summary.strip())}</p>"

    report_timestamp = evaluation.generated_at
    timestamp_suffix = " (UTC)"
    if session_metadata and isinstance(session_metadata, dict):
        raw_report_timestamp = session_metadata.get("report_generated_at")
        if isinstance(raw_report_timestamp, str):
            parsed_report_timestamp = _parse_iso_datetime(raw_report_timestamp)
            if parsed_report_timestamp:
                report_timestamp = parsed_report_timestamp
                if parsed_report_timestamp.tzinfo:
                    tz_name = parsed_report_timestamp.tzinfo.tzname(parsed_report_timestamp)
                    timestamp_suffix = f" ({tz_name or parsed_report_timestamp.tzinfo})"
                else:
                    timestamp_suffix = ""

    report_generated_display = f"{report_timestamp.strftime('%Y-%m-%d %H:%M:%S')}{timestamp_suffix}"

    report_html = f"""
    <html lang=\"{settings.report_language}\">
    <head>
        <meta charset=\"utf-8\" />
        <title>Dual Speaking Assessment Report</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 2rem; color: #1f2933; }}
            h1, h2, h3 {{ color: #0f172a; }}
            .summary {{ background: #eef2ff; padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 2rem; }}
            .summary .badge {{ display: inline-block; background: #4338ca; color: #fff; padding: 0.4rem 0.8rem; border-radius: 999px; font-size: 0.9rem; margin-right: 0.5rem; }}
            .card {{ background: #fff; border: 1px solid #cbd5e1; border-radius: 1rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }}
            .card-header {{ display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }}
            table {{ width: 100%; border-collapse: collapse; margin-bottom: 1rem; }}
            th, td {{ border: 1px solid #e2e8f0; padding: 0.75rem; text-align: left; }}
            th {{ background: #f8fafc; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.08em; }}
            ul, ol {{ margin-left: 1.5rem; }}
            blockquote {{ border-left: 4px solid #6366f1; padding-left: 1rem; margin: 0.5rem 0; font-style: italic; color: #4338ca; }}
            .alert {{ padding: 0.75rem 1rem; border-radius: 0.75rem; margin-bottom: 1rem; }}
            .alert-warning {{ background: #fef3c7; color: #92400e; }}
            .alert-error {{ background: #fee2e2; color: #b91c1c; }}
            .metadata {{ font-size: 0.9rem; color: #475569; margin-top: 1rem; }}
            .crosswalk {{ background: #ecfdf5; border-radius: 0.75rem; padding: 1.5rem; border: 1px solid #d1fae5; margin-bottom: 2rem; }}
            .crosswalk h2 {{ margin-top: 0; }}
        </style>
    </head>
    <body>
        <h1>English Speaking Assessment Report</h1>
        <div class=\"summary\">
            <p>{badges}</p>
            {participant_summary_html}
            {session_summary_html}
            <p><strong>Consensus CEFR:</strong> {evaluation.crosswalk.consensus_cefr}</p>
            <p><strong>Cross-standard note:</strong> {evaluation.crosswalk.notes}</p>
        </div>
        {warnings_html}
        <section class=\"crosswalk\">
            <h2>Crosswalk Insights</h2>
            <p><strong>Strengths:</strong> {', '.join(evaluation.crosswalk.strengths)}</p>
            <p><strong>Focus Areas:</strong> {', '.join(evaluation.crosswalk.focus)}</p>
        </section>
        {standard_sections}
        <h2>Session Notes</h2>
        <p><strong>Session ID:</strong> {evaluation.session.id}</p>
        <p><strong>Started At:</strong> {evaluation.session.started_at.isoformat()}</p>
        <p><strong>Ended At:</strong> {evaluation.session.ended_at.isoformat()}</p>
        <p><strong>Duration:</strong> {evaluation.session.duration_sec} seconds</p>
        <p><strong>Turns:</strong> {evaluation.session.turns}</p>
        <p><strong>Report Generated:</strong> {report_generated_display}</p>
    </body>
    </html>
    """
    return report_html


def persist_report(evaluation: DualEvaluationResponse, session_metadata: Optional[dict] = None) -> tuple[str, str]:
    report_html = build_html_report(evaluation, session_metadata=session_metadata)
    filename = f"report_{evaluation.session.id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.html"
    filepath = REPORTS_DIR / filename
    filepath.write_text(report_html, encoding="utf-8")
    report_url = f"{get_settings().app_base_url}/reports/{filename}"
    return report_html, report_url
