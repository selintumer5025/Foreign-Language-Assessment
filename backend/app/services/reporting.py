from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

from ..config import get_settings
from ..models import EvaluationResponse

REPORTS_DIR = Path("backend/generated_reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _format_dimension_rows(evaluation: EvaluationResponse) -> str:
    rows = []
    for dimension in evaluation.dimensions:
        rows.append(
            f"<tr><td>{dimension.name}</td><td>{dimension.score:.2f}/4</td><td>{dimension.feedback}</td></tr>"
        )
    return "".join(rows)


def build_html_report(evaluation: EvaluationResponse, session_metadata: Optional[dict] = None) -> str:
    settings = get_settings()
    metadata = session_metadata or {}
    started_at = metadata.get("started_at")
    started_at_str = started_at if isinstance(started_at, str) else "Not available"
    duration = metadata.get("duration_seconds", "-" )

    dimension_rows = _format_dimension_rows(evaluation)
    errors_list = "".join(f"<li>{err}</li>" for err in evaluation.errors)
    actions_list = "".join(f"<li>{item}</li>" for item in evaluation.action_plan)

    html = f"""
    <html lang=\"{settings.report_language}\">
    <head>
        <meta charset=\"utf-8\" />
        <title>English Speaking Assessment Report</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 2rem; color: #1f2933; }}
            h1, h2 {{ color: #0f172a; }}
            .summary-box {{ background: #f1f5f9; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; }}
            table {{ width: 100%; border-collapse: collapse; margin-bottom: 1rem; }}
            th, td {{ border: 1px solid #cbd5e1; padding: 0.75rem; text-align: left; }}
            th {{ background: #e2e8f0; }}
            .metadata {{ font-size: 0.9rem; color: #475569; margin-top: 1rem; }}
        </style>
    </head>
    <body>
        <h1>English Speaking Assessment Report</h1>
        <div class=\"summary-box\">
            <p><strong>Overall Score:</strong> {evaluation.overall_score:.2f} / 4</p>
            <p><strong>CEFR Level:</strong> {evaluation.cefr_level}</p>
            <p><strong>Summary:</strong> {evaluation.summary}</p>
        </div>
        <h2>Detailed Scores</h2>
        <table>
            <thead>
                <tr><th>Dimension</th><th>Score</th><th>Feedback</th></tr>
            </thead>
            <tbody>
                {dimension_rows}
            </tbody>
        </table>
        <h2>Common Errors & Corrections</h2>
        <ul>{errors_list}</ul>
        <h2>30-Day Action Plan</h2>
        <ol>{actions_list}</ol>
        <h2>Session Notes</h2>
        <p><strong>Session ID:</strong> {evaluation.session_id or 'N/A'}</p>
        <p><strong>Started At:</strong> {started_at_str}</p>
        <p><strong>Duration:</strong> {duration} seconds</p>
        <p><strong>Report Generated:</strong> {evaluation.generated_at.strftime('%Y-%m-%d %H:%M:%S')} (UTC)</p>
    </body>
    </html>
    """
    return html


def persist_report(evaluation: EvaluationResponse, session_metadata: Optional[dict] = None) -> tuple[str, str]:
    html = build_html_report(evaluation, session_metadata=session_metadata)
    filename = f"report_{evaluation.session_id or 'adhoc'}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.html"
    filepath = REPORTS_DIR / filename
    filepath.write_text(html, encoding="utf-8")
    report_url = f"{get_settings().app_base_url}/reports/{filename}"
    return html, report_url
