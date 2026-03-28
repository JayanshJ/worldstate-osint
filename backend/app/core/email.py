"""
Email delivery via Resend (https://resend.com).
Uses httpx directly — no SDK needed.
Falls back silently if RESEND_API_KEY is not configured.
"""

import logging
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
_RESEND_URL = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, html: str) -> bool:
    """Send an email via Resend. Returns True on success."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.debug("Resend API key not configured — skipping email to %s", to)
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                _RESEND_URL,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from":    "WorldState <alerts@worldstate.io>",
                    "to":      [to],
                    "subject": subject,
                    "html":    html,
                },
            )
            if r.status_code in (200, 201):
                logger.info("Email sent to %s: %s", to, subject)
                return True
            logger.warning("Resend error %d: %s", r.status_code, r.text[:200])
            return False
    except Exception as e:
        logger.warning("Email send failed: %s", e)
        return False


def _alert_html(watch_name: str, cluster_label: str, bullets: list[str], volatility: float, base_url: str) -> str:
    vol_pct = int(volatility * 100)
    vol_color = "#ef4444" if volatility >= 0.7 else "#f97316" if volatility >= 0.4 else "#22c55e"
    bullets_html = "".join(f"<li style='margin:4px 0;color:#d1d5db;'>{b}</li>" for b in (bullets or [])[:3])
    return f"""
<!DOCTYPE html>
<html>
<body style="background:#08090f;font-family:monospace;color:#e5e7eb;padding:32px;max-width:560px;margin:0 auto;">
  <p style="color:#00d4ff;font-size:10px;letter-spacing:4px;margin:0 0 16px;">WORLDSTATE ALERT</p>
  <h2 style="color:#ffffff;margin:0 0 4px;font-size:18px;">⚡ {watch_name}</h2>
  <p style="color:#6b7280;font-size:12px;margin:0 0 20px;">Alert watch fired</p>

  <div style="background:#13151f;border:1px solid #1f2937;padding:16px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="color:#00d4ff;font-size:11px;font-weight:700;">CLUSTER</span>
      <span style="color:{vol_color};font-size:11px;font-weight:700;">VOL {vol_pct}%</span>
    </div>
    <p style="color:#ffffff;font-size:14px;font-weight:600;margin:0 0 12px;">{cluster_label or "Intelligence Cluster"}</p>
    <ul style="margin:0;padding-left:20px;font-size:12px;line-height:1.6;">
      {bullets_html}
    </ul>
  </div>

  <a href="{base_url}" style="display:inline-block;background:#00d4ff;color:#08090f;padding:10px 20px;font-size:11px;font-weight:700;letter-spacing:2px;text-decoration:none;">
    VIEW IN WORLDSTATE →
  </a>

  <p style="color:#374151;font-size:10px;margin-top:24px;">
    You are receiving this because you created the watch rule "{watch_name}".
    To unsubscribe, manage your watches in WorldState.
  </p>
</body>
</html>"""
