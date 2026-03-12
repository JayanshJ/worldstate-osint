"""
Alert Engine

After every cluster update, evaluates all active AlertWatch rules against the
cluster. If a watch matches and hasn't fired in the last N minutes, it fires:
  1. Persists an AlertFiring record
  2. Publishes to Redis channel worldstate:alert with full payload
  3. Updates watch.last_fired_at + fire_count
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import get_redis, publish_event
from app.models.alert import AlertFiring, AlertWatch
from app.models.article import ClusterMember, EventCluster, RawArticle

CHANNEL_ALERT = "worldstate:alert"
ALERT_COOLDOWN_MINUTES = 15          # min time between firings for same watch+cluster

settings = get_settings()
logger = logging.getLogger(__name__)


def _cluster_matches_watch(
    cluster: EventCluster,
    watch: AlertWatch,
    member_titles: list[str],
    member_entities: list[str],
    source_ids: list[str],
) -> bool:
    # Volatility gate
    if cluster.volatility < watch.min_volatility:
        return False

    # Source count gate
    if cluster.member_count < watch.min_sources:
        return False

    # Source ID filter
    if watch.source_ids:
        if not any(s in source_ids for s in watch.source_ids):
            return False

    # Keyword match (case-insensitive, against titles)
    if watch.keywords:
        combined_text = " ".join(member_titles + [cluster.label or ""]).lower()
        if not any(kw.lower() in combined_text for kw in watch.keywords):
            return False

    # Entity match
    if watch.entities:
        cluster_entities_flat: list[str] = []
        if cluster.key_entities:
            for v in cluster.key_entities.values():
                if isinstance(v, list):
                    cluster_entities_flat.extend(v)
        all_entities = [e.lower() for e in cluster_entities_flat + member_entities]
        if not any(e.lower() in all_entities for e in watch.entities):
            return False

    return True


async def evaluate_alerts(cluster_id: str) -> None:
    async with AsyncSessionLocal() as db:
        # Load cluster
        result = await db.execute(
            select(EventCluster).where(EventCluster.id == uuid.UUID(cluster_id))
        )
        cluster = result.scalar_one_or_none()
        if not cluster or not cluster.is_active:
            return

        # Load member article metadata
        member_result = await db.execute(
            select(RawArticle.title, RawArticle.source_id)
            .join(ClusterMember, ClusterMember.article_id == RawArticle.id)
            .where(ClusterMember.cluster_id == cluster.id)
        )
        rows = member_result.fetchall()
        member_titles  = [r.title for r in rows]
        source_ids     = list({r.source_id for r in rows})
        member_entities: list[str] = []   # expanded from cluster.key_entities later

        # Load all active watches
        watches_result = await db.execute(
            select(AlertWatch).where(AlertWatch.is_active == True)
        )
        watches = watches_result.scalars().all()

        now = datetime.now(timezone.utc)
        cooldown_cutoff = now - timedelta(minutes=ALERT_COOLDOWN_MINUTES)

        for watch in watches:
            # Cooldown: don't re-fire the same watch too quickly
            if watch.last_fired_at and watch.last_fired_at.replace(tzinfo=timezone.utc) > cooldown_cutoff:
                continue

            if not _cluster_matches_watch(cluster, watch, member_titles, member_entities, source_ids):
                continue

            # FIRE
            payload = {
                "watch_id":       str(watch.id),
                "watch_name":     watch.name,
                "cluster_id":     cluster_id,
                "cluster_label":  cluster.label,
                "volatility":     cluster.volatility,
                "sentiment":      cluster.sentiment,
                "member_count":   cluster.member_count,
                "bullets":        cluster.summary_bullets,
                "entities":       cluster.key_entities,
                "fired_at":       now.isoformat(),
                "keywords_matched": watch.keywords,
            }

            firing = AlertFiring(
                watch_id=watch.id,
                cluster_id=cluster.id,
                fired_at=now,
                payload=payload,
            )
            db.add(firing)

            await db.execute(
                update(AlertWatch)
                .where(AlertWatch.id == watch.id)
                .values(last_fired_at=now, fire_count=AlertWatch.fire_count + 1)
            )

            await publish_event(CHANNEL_ALERT, payload)
            logger.info(
                "Alert fired: watch=%s cluster=%s volt=%.2f",
                watch.name, cluster_id[:8], cluster.volatility,
            )

        await db.commit()
