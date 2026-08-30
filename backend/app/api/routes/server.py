"""
Server monitoring endpoint — admin only.
Returns Docker container stats, system metrics, SSL info, and site ping.
"""
import asyncio
import datetime
import os
import socket
import ssl
import time
from typing import Annotated

import psutil
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from app.core.security import get_current_user
from app.models.user import User

router = APIRouter()


async def require_admin(user: User = Depends(get_current_user)) -> User:
    from fastapi import HTTPException
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _get_system_metrics() -> dict:
    cpu = psutil.cpu_percent(interval=0.2)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    boot_time = psutil.boot_time()
    uptime = int(time.time() - boot_time)
    return {
        "cpu_percent":    round(cpu, 1),
        "ram_used_mb":    round(ram.used / 1024 / 1024),
        "ram_total_mb":   round(ram.total / 1024 / 1024),
        "ram_percent":    round(ram.percent, 1),
        "disk_used_gb":   round(disk.used / 1024 / 1024 / 1024, 1),
        "disk_total_gb":  round(disk.total / 1024 / 1024 / 1024, 1),
        "disk_percent":   round(disk.percent, 1),
        "uptime_seconds": uptime,
    }


def _get_containers() -> list[dict]:
    try:
        import docker as docker_sdk
        client = docker_sdk.from_env()
        result = []
        for c in client.containers.list(all=True):
            stats = {}
            try:
                raw = c.stats(stream=False)
                # CPU %
                cpu_delta = raw["cpu_stats"]["cpu_usage"]["total_usage"] - raw["precpu_stats"]["cpu_usage"]["total_usage"]
                sys_delta  = raw["cpu_stats"].get("system_cpu_usage", 0) - raw["precpu_stats"].get("system_cpu_usage", 0)
                num_cpus   = raw["cpu_stats"].get("online_cpus") or len(raw["cpu_stats"]["cpu_usage"].get("percpu_usage", [1]))
                cpu_pct    = round((cpu_delta / sys_delta) * num_cpus * 100, 2) if sys_delta > 0 else 0.0
                # Memory
                mem_usage  = raw["memory_stats"].get("usage", 0)
                mem_limit  = raw["memory_stats"].get("limit", 1)
                mem_mb     = round(mem_usage / 1024 / 1024, 1)
                mem_pct    = round((mem_usage / mem_limit) * 100, 1) if mem_limit else 0.0
                stats = {"cpu_percent": cpu_pct, "mem_mb": mem_mb, "mem_percent": mem_pct}
            except Exception:
                stats = {"cpu_percent": 0.0, "mem_mb": 0.0, "mem_percent": 0.0}

            health = "none"
            if c.attrs.get("State", {}).get("Health"):
                health = c.attrs["State"]["Health"].get("Status", "none")

            result.append({
                "id":          c.short_id,
                "name":        c.name,
                "image":       c.image.tags[0] if c.image.tags else c.image.short_id,
                "status":      c.status,
                "health":      health,
                **stats,
            })
        return result
    except Exception as e:
        return [{"error": str(e)}]


def _get_ssl_info(domain: str) -> dict:
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.socket(), server_hostname=domain) as s:
            s.settimeout(5)
            s.connect((domain, 443))
            cert = s.getpeercert()
        expire_str = cert["notAfter"]  # e.g. "Jun 25 12:00:00 2026 GMT"
        expire_dt  = datetime.datetime.strptime(expire_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=datetime.timezone.utc)
        days_left  = (expire_dt - datetime.datetime.now(datetime.timezone.utc)).days
        return {
            "domain":        domain,
            "expires_at":    expire_dt.strftime("%Y-%m-%d"),
            "days_remaining": days_left,
            "valid":         days_left > 0,
        }
    except Exception as e:
        return {"domain": domain, "error": str(e), "valid": False}


async def _ping_site(url: str) -> dict:
    import httpx
    try:
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
        ms = round((time.monotonic() - start) * 1000)
        return {"url": url, "status_code": r.status_code, "latency_ms": ms, "up": r.status_code < 500}
    except Exception as e:
        return {"url": url, "up": False, "error": str(e)}


async def _noop_ping() -> dict:
    return {"up": None}


@router.get("/status")
async def server_status(admin: Annotated[User, Depends(require_admin)]):
    domain = os.getenv("DOMAIN", "")
    system, containers, ping = await asyncio.gather(
        asyncio.to_thread(_get_system_metrics),
        asyncio.to_thread(_get_containers),
        _ping_site(f"https://{domain}/health") if domain else _noop_ping(),
    )
    ssl_info = await asyncio.to_thread(_get_ssl_info, domain) if domain else {}
    return {
        "system":     system,
        "containers": containers,
        "ssl":        ssl_info,
        "ping":       ping,
    }


@router.get("/logs", response_class=PlainTextResponse)
async def nginx_logs(admin: Annotated[User, Depends(require_admin)], lines: int = 100):
    """Tail nginx access log from host (if mounted)."""
    log_paths = [
        "/var/log/nginx/access.log",
        "/proc/1/fd/1",  # fallback: stdout of PID 1
    ]
    for path in log_paths:
        if os.path.exists(path):
            try:
                result = await asyncio.to_thread(
                    lambda p=path: "\n".join(open(p).readlines()[-lines:])
                )
                return result
            except Exception:
                continue
    return "Log file not accessible. Mount /var/log/nginx into the api container to enable."
