import os
import json
import asyncio
import logging
from typing import Optional, Callable, Awaitable
import redis.asyncio as redis
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("virtual_queue")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

class RedisPubSub:
    """Redis Pub/Sub for scalable real-time messaging."""

    def __init__(self):
        self.redis: Optional[redis.Redis] = None
        self.pubsub: Optional[redis.client.PubSub] = None
        self._listener_task: Optional[asyncio.Task] = None
        self._handlers: dict[str, Callable[[dict], Awaitable[None]]] = {}

    async def connect(self):
        """Connect to Redis."""
        try:
            self.redis = redis.from_url(REDIS_URL, decode_responses=True)
            self.pubsub = self.redis.pubsub()
            logger.info(f"Connected to Redis: {REDIS_URL}")
        except Exception as e:
            logger.warning(f"Redis not available: {e}. Running without Redis scaling.")
            self.redis = None
            self.pubsub = None

    async def disconnect(self):
        """Disconnect from Redis."""
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass

        if self.pubsub:
            await self.pubsub.close()

        if self.redis:
            await self.redis.close()

        logger.info("Disconnected from Redis")

    async def subscribe(self, channel: str, handler: Callable[[dict], Awaitable[None]]):
        """Subscribe to a channel with a handler."""
        if not self.pubsub:
            logger.warning("Redis not available, skipping subscription")
            return

        self._handlers[channel] = handler
        await self.pubsub.subscribe(channel)
        logger.info(f"Subscribed to channel: {channel}")

    async def unsubscribe(self, channel: str):
        """Unsubscribe from a channel."""
        if not self.pubsub:
            return

        await self.pubsub.unsubscribe(channel)
        self._handlers.pop(channel, None)
        logger.info(f"Unsubscribed from channel: {channel}")

    async def publish(self, channel: str, message: dict):
        """Publish a message to a channel."""
        if not self.redis:
            logger.warning("Redis not available, skipping publish")
            return

        await self.redis.publish(channel, json.dumps(message))
        logger.debug(f"Published to {channel}: {message}")

    async def start_listener(self):
        """Start listening for messages."""
        if not self.pubsub:
            logger.warning("Redis not available, skipping listener")
            return

        async def listener():
            try:
                async for message in self.pubsub.listen():
                    if message["type"] == "message":
                        channel = message["channel"]
                        try:
                            data = json.loads(message["data"])
                            if channel in self._handlers:
                                await self._handlers[channel](data)
                        except json.JSONDecodeError:
                            logger.error(f"Invalid JSON in message: {message['data']}")
                        except Exception as e:
                            logger.error(f"Error handling message: {e}")
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Redis listener error: {e}")

        self._listener_task = asyncio.create_task(listener())
        logger.info("Redis listener started")

# Global Redis pub/sub instance
redis_pubsub = RedisPubSub()

# Notification channels
CHANNEL_QUEUE_PREFIX = "queue:"  # queue:{queue_id}
CHANNEL_USER_PREFIX = "user:"    # user:{user_id}
CHANNEL_BROADCAST = "broadcast"  # Global announcements

async def publish_to_queue(queue_id: str, message: dict):
    """Publish a message to a queue channel."""
    channel = f"{CHANNEL_QUEUE_PREFIX}{queue_id}"
    await redis_pubsub.publish(channel, message)

async def publish_to_user(user_id: int, message: dict):
    """Publish a message to a user channel."""
    channel = f"{CHANNEL_USER_PREFIX}{user_id}"
    await redis_pubsub.publish(channel, message)

async def publish_broadcast(message: dict):
    """Publish a broadcast message to all."""
    await redis_pubsub.publish(CHANNEL_BROADCAST, message)


# ── Notification storage for HTTP fallback ────────────────────────────────────

NOTIFICATIONS_KEY_PREFIX = "notifications:"  # notifications:{queue_id}
NOTIFICATION_TTL = 60  # seconds - notifications expire after 60s

async def store_notification(queue_id: str, notification: dict):
    """Store a notification in Redis for HTTP fallback polling."""
    if not redis_pubsub.redis:
        return

    key = f"{NOTIFICATIONS_KEY_PREFIX}{queue_id}"
    try:
        # Add timestamp if not present
        if "timestamp" not in notification:
            import time
            notification["timestamp"] = int(time.time() * 1000)

        # Store as JSON in a sorted set (score = timestamp)
        await redis_pubsub.redis.zadd(
            key,
            {json.dumps(notification): notification["timestamp"]}
        )
        # Set TTL on the key
        await redis_pubsub.redis.expire(key, NOTIFICATION_TTL * 2)

        # Remove old notifications (older than TTL)
        cutoff = notification["timestamp"] - (NOTIFICATION_TTL * 1000)
        await redis_pubsub.redis.zremrangebyscore(key, "-inf", cutoff)

    except Exception as e:
        logger.error(f"Error storing notification: {e}")


async def get_notifications(queue_id: str, since_timestamp: int = 0) -> list[dict]:
    """Get notifications for a queue since a given timestamp."""
    if not redis_pubsub.redis:
        return []

    key = f"{NOTIFICATIONS_KEY_PREFIX}{queue_id}"
    try:
        # Get notifications newer than since_timestamp
        items = await redis_pubsub.redis.zrangebyscore(
            key, since_timestamp + 1, "+inf"
        )
        return [json.loads(item) for item in items]
    except Exception as e:
        logger.error(f"Error getting notifications: {e}")
        return []


async def clear_notifications(queue_id: str, notification_type: str = None):
    """Clear notifications for a queue (optionally by type)."""
    if not redis_pubsub.redis:
        return

    key = f"{NOTIFICATIONS_KEY_PREFIX}{queue_id}"
    try:
        if notification_type:
            # Remove only specific type
            all_items = await redis_pubsub.redis.zrange(key, 0, -1)
            for item in all_items:
                data = json.loads(item)
                if data.get("type") == notification_type:
                    await redis_pubsub.redis.zrem(key, item)
        else:
            # Clear all
            await redis_pubsub.redis.delete(key)
    except Exception as e:
        logger.error(f"Error clearing notifications: {e}")


