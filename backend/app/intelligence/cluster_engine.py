"""
HDBSCAN Clustering Engine + Intelligence Layer

Flow:
  1. Pull all embeddings from the last N hours that aren't in an active cluster
  2. Run HDBSCAN on the embedding matrix
  3. For each new cluster:
     a. Check if it matches an existing cluster (centroid similarity)
        → If yes: merge / update existing cluster
        → If no: create new cluster
  4. When cluster hits the intelligence threshold, trigger AI summarization
  5. Publish cluster update to Redis pub/sub
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
from hdbscan import HDBSCAN
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import CHANNEL_CLUSTER_UPDATE, publish_event
from app.intelligence.summarizer import summarize_cluster
from app.models.article import ArticleEmbedding, ClusterMember, EventCluster, RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)


# ─── Fetch recent un-clustered embeddings ─────────────────────────────────

async def fetch_unclassified_embeddings(
    db: AsyncSession,
    within_hours: int = 6,
) -> tuple[list[uuid.UUID], np.ndarray]:
    """
    Returns (article_ids, embedding_matrix) for articles not yet in any cluster.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=within_hours)

    # Find article IDs that already have a cluster membership
    clustered_subq = select(ClusterMember.article_id)

    result = await db.execute(
        select(ArticleEmbedding.article_id, ArticleEmbedding.embedding)
        .join(RawArticle, RawArticle.id == ArticleEmbedding.article_id)
        .where(
            RawArticle.ingested_at >= since,
            ArticleEmbedding.article_id.notin_(clustered_subq),
        )
        .order_by(RawArticle.ingested_at.asc())
    )
    rows = result.fetchall()
    if not rows:
        return [], np.array([])

    ids   = [row.article_id for row in rows]
    vecs  = np.array([row.embedding for row in rows], dtype=np.float32)
    return ids, vecs


# ─── HDBSCAN Runner ───────────────────────────────────────────────────────

def run_hdbscan(embeddings: np.ndarray) -> np.ndarray:
    """
    Returns label array where -1 = noise (unclustered).
    Uses cosine metric via precomputed approach for high-dim vectors.
    """
    if len(embeddings) < settings.cluster_min_cluster_size:
        return np.full(len(embeddings), -1, dtype=int)

    clusterer = HDBSCAN(
        min_cluster_size=settings.cluster_min_cluster_size,
        min_samples=settings.cluster_min_samples,
        metric="euclidean",      # L2 on unit-normalized vecs ≈ cosine
        cluster_selection_method="eom",
        prediction_data=True,
    )
    # Normalize to unit sphere so euclidean ≈ cosine distance
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1e-10, norms)
    normalized = embeddings / norms

    labels = clusterer.fit_predict(normalized)
    return labels


# ─── Centroid Similarity ──────────────────────────────────────────────────

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    return float(dot / norm) if norm > 0 else 0.0


async def find_existing_cluster(
    db: AsyncSession,
    centroid: np.ndarray,
) -> EventCluster | None:
    """
    Look up the nearest active cluster by centroid similarity.
    Returns cluster if cosine similarity > threshold.
    """
    threshold = 1 - settings.cluster_cosine_threshold  # convert distance to similarity

    result = await db.execute(
        text("""
            SELECT id, centroid,
                   1 - (centroid <=> CAST(:vec AS vector)) AS similarity
            FROM   event_clusters
            WHERE  is_active = TRUE
            ORDER  BY centroid <=> CAST(:vec AS vector)
            LIMIT  1
        """),
        {"vec": str(centroid.tolist())},
    )
    row = result.fetchone()
    if row and row.similarity >= threshold:
        cluster_result = await db.execute(
            select(EventCluster).where(EventCluster.id == row.id)
        )
        return cluster_result.scalar_one_or_none()
    return None


# ─── Cluster Lifecycle ────────────────────────────────────────────────────

async def create_cluster(
    db: AsyncSession,
    centroid: np.ndarray,
    hdbscan_label: int,
) -> EventCluster:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.cluster_hard_expire_hours)
    cluster = EventCluster(
        centroid=centroid.tolist(),
        hdbscan_label=hdbscan_label,
        expires_at=expires_at,
    )
    db.add(cluster)
    await db.flush()
    return cluster


async def update_cluster_centroid(
    db: AsyncSession,
    cluster: EventCluster,
    new_centroid: np.ndarray,
    new_member_count: int,
    new_weighted_score: float,
) -> None:
    await db.execute(
        update(EventCluster)
        .where(EventCluster.id == cluster.id)
        .values(
            centroid=new_centroid.tolist(),
            member_count=new_member_count,
            weighted_score=new_weighted_score,
            last_updated_at=datetime.now(timezone.utc),
        )
    )


async def add_members_to_cluster(
    db: AsyncSession,
    cluster_id: uuid.UUID,
    article_ids: list[uuid.UUID],
    centroid: np.ndarray,
    embeddings: np.ndarray,
) -> None:
    for i, article_id in enumerate(article_ids):
        vec = embeddings[i]
        distance = float(1 - cosine_similarity(vec, centroid))
        member = ClusterMember(
            cluster_id=cluster_id,
            article_id=article_id,
            distance=distance,
        )
        db.add(member)
    try:
        await db.flush()
    except Exception:
        await db.rollback()


# ─── Intelligence Trigger ─────────────────────────────────────────────────

async def maybe_trigger_intelligence(
    db: AsyncSession,
    cluster: EventCluster,
) -> None:
    """
    If cluster has enough weighted credibility, trigger AI summarization.
    Uses weighted_score (sum of credibility scores) instead of raw count
    so a single Reuters article can trigger faster than 10 Reddit posts.
    """
    # Weighted threshold: e.g. 2 Reuters articles (2 * 0.93 ≈ 1.86)
    # or 2 CoinDesk + 1 CoinTelegraph (0.78+0.74+0.74 ≈ 2.26)
    # or 3 TechCrunch/Verge (0.82+0.81+0.81 ≈ 2.44)
    WEIGHTED_THRESHOLD = 1.8

    if cluster.weighted_score < WEIGHTED_THRESHOLD:
        return
    if cluster.label:
        return  # Already summarized; don't re-trigger immediately

    logger.info(
        "Triggering intelligence for cluster %s (score=%.2f, members=%d)",
        str(cluster.id)[:8], cluster.weighted_score, cluster.member_count,
    )

    # Fetch member articles for summarization
    result = await db.execute(
        select(RawArticle)
        .join(ClusterMember, ClusterMember.article_id == RawArticle.id)
        .where(ClusterMember.cluster_id == cluster.id)
        .order_by(RawArticle.credibility_score.desc())
        .limit(10)
    )
    articles = result.scalars().all()

    try:
        intel = await summarize_cluster(articles)
        await db.execute(
            update(EventCluster)
            .where(EventCluster.id == cluster.id)
            .values(
                label=intel["title"],
                summary_bullets=intel["bullets"],
                key_entities=intel["entities"],
                volatility=intel["volatility"],
                sentiment=intel["sentiment"],
            )
        )
        await db.commit()

        # Broadcast to frontend
        await publish_event(CHANNEL_CLUSTER_UPDATE, {
            "cluster_id": str(cluster.id),
            "label": intel["title"],
            "bullets": intel["bullets"],
            "entities": intel["entities"],
            "volatility": intel["volatility"],
            "sentiment": intel["sentiment"],
            "member_count": cluster.member_count,
            "weighted_score": cluster.weighted_score,
        })

        # Evaluate alert watches against this cluster (fire-and-forget)
        try:
            from app.intelligence.alert_engine import evaluate_alerts
            await evaluate_alerts(str(cluster.id))
        except Exception as ae:
            logger.warning("Alert evaluation error: %s", ae)

    except Exception as e:
        logger.error("Intelligence layer failed for cluster %s: %s", str(cluster.id)[:8], e)


# ─── Drift: Expire old clusters ───────────────────────────────────────────

async def expire_stale_clusters(db: AsyncSession) -> None:
    await db.execute(text("SELECT expire_old_clusters()"))
    await db.commit()
    logger.debug("Drift check complete — stale clusters expired")


# ─── Main Cycle ───────────────────────────────────────────────────────────

async def run_cluster_cycle() -> None:
    async with AsyncSessionLocal() as db:
        # Step 1: Expire stale clusters
        await expire_stale_clusters(db)

        # Step 2: Fetch unclassified embeddings
        article_ids, embeddings = await fetch_unclassified_embeddings(db)
        if len(article_ids) < settings.cluster_min_cluster_size:
            logger.debug("Not enough unclassified articles (%d) to cluster", len(article_ids))
            return

        logger.info("Running HDBSCAN on %d embeddings", len(article_ids))

        # Step 3: Run HDBSCAN
        labels = run_hdbscan(embeddings)
        unique_labels = set(labels) - {-1}
        logger.info("HDBSCAN found %d clusters (noise: %d)", len(unique_labels), (labels == -1).sum())

        # Step 4: Process each cluster
        for label in unique_labels:
            mask = labels == label
            cluster_ids = [article_ids[i] for i, m in enumerate(mask) if m]
            cluster_vecs = embeddings[mask]
            centroid = cluster_vecs.mean(axis=0)

            # Fetch credibility scores for weighted score
            result = await db.execute(
                select(RawArticle.id, RawArticle.credibility_score)
                .where(RawArticle.id.in_(cluster_ids))
            )
            cred_map = {row.id: row.credibility_score for row in result.fetchall()}
            weighted_score = sum(cred_map.values())

            # Match against existing cluster or create new
            existing = await find_existing_cluster(db, centroid)
            if existing:
                # Merge into existing
                new_member_count = existing.member_count + len(cluster_ids)
                new_centroid = (
                    np.array(existing.centroid) * existing.member_count + centroid * len(cluster_ids)
                ) / new_member_count  # weighted running mean
                new_score = existing.weighted_score + weighted_score

                await add_members_to_cluster(db, existing.id, cluster_ids, centroid, cluster_vecs)
                await update_cluster_centroid(db, existing, new_centroid, new_member_count, new_score)
                await db.commit()
                # Refresh so in-memory object reflects the UPDATE (weighted_score, member_count)
                await db.refresh(existing)
                await maybe_trigger_intelligence(db, existing)
            else:
                # Create new cluster
                cluster = await create_cluster(db, centroid, int(label))
                await add_members_to_cluster(db, cluster.id, cluster_ids, centroid, cluster_vecs)
                await update_cluster_centroid(db, cluster, centroid, len(cluster_ids), weighted_score)
                await db.commit()
                # Refresh so in-memory object reflects the UPDATE (weighted_score, member_count)
                await db.refresh(cluster)
                await maybe_trigger_intelligence(db, cluster)


async def cluster_worker_loop() -> None:
    logger.info(
        "Cluster worker started. Interval: %ds",
        settings.cluster_run_interval_seconds,
    )
    while True:
        try:
            await run_cluster_cycle()
        except Exception as e:
            logger.error("Cluster cycle error: %s", e, exc_info=True)
        await asyncio.sleep(settings.cluster_run_interval_seconds)
