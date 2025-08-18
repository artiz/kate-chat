
import redis.asyncio as aioredis
from app.core.config import settings

redis_connection_pool: aioredis.ConnectionPool = aioredis.ConnectionPool.from_url(
    settings.redis_url, decode_responses=True
)

async def startup():
    await redis_connection_pool.make_connection()

async def shutdown():
    await redis_connection_pool.disconnect()
