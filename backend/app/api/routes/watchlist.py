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

# ── Lua scripts for atomic read-modify-write (prevents lost updates) ──────

_ADD_LUA = """
local key = KEYS[1]
local name = ARGV[1]
local item_type = ARGV[2]
local data = redis.call('GET', key)
local items = {}
if data then items = cjson.decode(data) end
for _, i in ipairs(items) do
  if string.lower(i['name']) == string.lower(name) then
    return cjson.encode(items)
  end
end
table.insert(items, {name = name, type = item_type})
redis.call('SET', key, cjson.encode(items))
return cjson.encode(items)
"""

_REMOVE_LUA = """
local key = KEYS[1]
local name = ARGV[1]
local data = redis.call('GET', key)
local items = {}
if data then items = cjson.decode(data) end
local filtered = {}
for _, i in ipairs(items) do
  if string.lower(i['name']) ~= string.lower(name) then
    table.insert(filtered, i)
  end
end
redis.call('SET', key, cjson.encode(filtered))
return cjson.encode(filtered)
"""

_add_script = None
_remove_script = None


def _get_scripts(r):
    global _add_script, _remove_script
    if _add_script is None:
        _add_script = r.register_script(_ADD_LUA)
    if _remove_script is None:
        _remove_script = r.register_script(_REMOVE_LUA)
    return _add_script, _remove_script


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
    add_script, _ = _get_scripts(r)
    result = await add_script(keys=[key], args=[body.name, body.type])
    return json.loads(result)


@router.delete("/{name}")
async def remove_entity(
    name: str,
    user: Annotated[User, Depends(get_current_user)],
):
    r = get_redis()
    key = _key(str(user.id))
    _, remove_script = _get_scripts(r)
    result = await remove_script(keys=[key], args=[name])
    return json.loads(result)
