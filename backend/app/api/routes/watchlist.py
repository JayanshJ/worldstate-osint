"""
Watchlist API — user-pinned entities stored in Redis.
"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.redis_client import get_redis
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(dependencies=[Depends(get_current_user)])


class WatchlistItem(BaseModel):
    name: str
    type: str  # 'person' | 'org' | 'location' | 'keyword'


def _key(user_id: str) -> str:
    return f"watchlist:{user_id}"


@router.get("/")
async def get_watchlist(user: Annotated[User, Depends(get_current_user)]):
    r = get_redis()
    data = await r.get(_key(str(user.id)))
    return json.loads(data) if data else []


@router.post("/")
async def add_entity(
    body: WatchlistItem,
    user: Annotated[User, Depends(get_current_user)],
):
    r = get_redis()
    key = _key(str(user.id))
    data = await r.get(key)
    items = json.loads(data) if data else []
    # Deduplicate by name (case-insensitive)
    if not any(i["name"].lower() == body.name.lower() for i in items):
        items.append({"name": body.name, "type": body.type})
    await r.set(key, json.dumps(items))
    return items


@router.delete("/{name}")
async def remove_entity(
    name: str,
    user: Annotated[User, Depends(get_current_user)],
):
    r = get_redis()
    key = _key(str(user.id))
    data = await r.get(key)
    items = json.loads(data) if data else []
    items = [i for i in items if i["name"].lower() != name.lower()]
    await r.set(key, json.dumps(items))
    return items
