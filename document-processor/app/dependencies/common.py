import datetime
from typing import Any, List
from redis.asyncio.client import Redis

from app.core.config import settings
from app.core import util
from app.core.global_app import redis_connection_pool


# Dependency
async def get_redis():
    r = Redis(connection_pool=redis_connection_pool)
    try:
        yield r
    finally:
        await r.close()

async def get_log():
    log = util.init_logger("api")

    try:
        yield log
    finally:
        await log.shutdown()
