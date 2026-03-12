"""
WebSocket Gateway

Maintains a pool of connected clients and fans out Redis pub/sub
messages to all of them. No state stored in the WebSocket layer —
Redis is the single source of truth for events.
"""

import asyncio
import json
import logging
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.redis_client import (
    CHANNEL_BREAKING,
    CHANNEL_CLUSTER_UPDATE,
    CHANNEL_NEW_ARTICLE,
    CHANNEL_STRATEGY_UPDATE,
    get_redis,
)

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.add(ws)
        logger.info("WS client connected. Total: %d", len(self._active))

    def disconnect(self, ws: WebSocket) -> None:
        self._active.discard(ws)
        logger.info("WS client disconnected. Total: %d", len(self._active))

    async def broadcast(self, message: dict) -> None:
        if not self._active:
            return
        data = json.dumps(message)
        dead = set()
        for ws in self._active:
            try:
                await ws.send_text(data)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._active.discard(ws)

    @property
    def client_count(self) -> int:
        return len(self._active)


manager = ConnectionManager()


async def redis_listener() -> None:
    """
    Background task: subscribes to Redis pub/sub channels and
    broadcasts messages to all connected WebSocket clients.
    """
    r = get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(
        CHANNEL_NEW_ARTICLE,
        CHANNEL_CLUSTER_UPDATE,
        CHANNEL_BREAKING,
        CHANNEL_STRATEGY_UPDATE,
    )
    logger.info("Redis pub/sub listener started")

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            payload = json.loads(message["data"])
            event_type = {
                CHANNEL_NEW_ARTICLE:     "new_article",
                CHANNEL_CLUSTER_UPDATE:  "cluster_update",
                CHANNEL_BREAKING:        "breaking",
                CHANNEL_STRATEGY_UPDATE: "strategy_update",
            }.get(message["channel"], "unknown")

            await manager.broadcast({"type": event_type, "data": payload})
        except Exception as e:
            logger.error("WS broadcast error: %s", e)


# Start the listener as a background task when the module loads
_listener_task: asyncio.Task | None = None


@router.on_event("startup")
async def start_redis_listener():
    global _listener_task
    _listener_task = asyncio.create_task(redis_listener())


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        # Send connection ack with current client count
        await ws.send_json({
            "type": "connected",
            "data": {
                "clients": manager.client_count,
                "channels": [CHANNEL_NEW_ARTICLE, CHANNEL_CLUSTER_UPDATE],
            },
        })
        # Keep connection alive — heartbeat every 30s
        while True:
            try:
                # Wait for client ping or disconnect
                data = await asyncio.wait_for(ws.receive_text(), timeout=30)
                if data == "ping":
                    await ws.send_text("pong")
            except asyncio.TimeoutError:
                # Send server-side heartbeat
                await ws.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        manager.disconnect(ws)
