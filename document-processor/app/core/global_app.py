import redis.asyncio as aioredis
from app.core.config import settings
from app.core import util

logger = util.init_logger(__name__)

redis_connection_pool: aioredis.ConnectionPool = aioredis.ConnectionPool.from_url(
    settings.redis_url, decode_responses=True
)


async def startup():
    logger.debug(f"Connecting to Redis at {settings.redis_url}...")
    con = redis_connection_pool.make_connection()
    await redis_connection_pool.ensure_connection(con)
    logger.debug("Connected to Redis")


async def shutdown():
    await redis_connection_pool.disconnect()
