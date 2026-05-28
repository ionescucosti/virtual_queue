import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Optional
from jose import JWTError, jwt
import os

from app.websocket.manager import manager
from app.websocket.redis_pubsub import (
    redis_pubsub, publish_to_queue, publish_to_user,
    store_notification, clear_notifications
)

logger = logging.getLogger("virtual_queue")

router = APIRouter(prefix="/ws", tags=["WebSocket"])

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"

def verify_token(token: str) -> Optional[dict]:
    """Verify JWT token and return payload."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

@router.websocket("/notify")
async def websocket_notify(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    queue_id: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for real-time notifications.

    Connect with: ws://host/ws/notify?token=JWT_TOKEN&queue_id=QUEUE_ID

    Messages sent:
    - type: "announcement" - Instant announcement from staff
    - type: "position_update" - Queue position update
    - type: "your_turn" - Customer's turn notification
    - type: "queue_status" - Queue status change
    """
    # Verify token if provided
    user_id = None
    role = None
    if token:
        payload = verify_token(token)
        if payload:
            user_id = payload.get("sub")
            role = payload.get("role")

    # Connect
    connection_id = await manager.connect(
        websocket=websocket,
        user_id=user_id,
        queue_id=queue_id,
        role=role
    )

    # Send welcome message
    await manager.send_to_connection(connection_id, {
        "type": "connected",
        "connection_id": connection_id,
        "queue_id": queue_id,
        "message": "Connected to notification service"
    })

    try:
        while True:
            # Receive and handle messages from client
            data = await websocket.receive_json()

            # Handle ping/pong for connection health
            if data.get("type") == "ping":
                await manager.send_to_connection(connection_id, {"type": "pong"})

            # Handle subscription to queue
            elif data.get("type") == "subscribe_queue":
                new_queue_id = data.get("queue_id")
                if new_queue_id:
                    # Update queue subscription
                    conn_info = manager.active_connections.get(connection_id)
                    if conn_info:
                        # Remove from old queue
                        if conn_info.queue_id and conn_info.queue_id in manager.queue_connections:
                            manager.queue_connections[conn_info.queue_id].discard(connection_id)

                        # Add to new queue
                        conn_info.queue_id = new_queue_id
                        if new_queue_id not in manager.queue_connections:
                            manager.queue_connections[new_queue_id] = set()
                        manager.queue_connections[new_queue_id].add(connection_id)

                        await manager.send_to_connection(connection_id, {
                            "type": "subscribed",
                            "queue_id": new_queue_id,
                            "customers_watching": manager.get_queue_connection_count(new_queue_id)
                        })

    except WebSocketDisconnect:
        await manager.disconnect(connection_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await manager.disconnect(connection_id)

@router.websocket("/staff")
async def websocket_staff(
    websocket: WebSocket,
    token: str = Query(...)
):
    """
    WebSocket endpoint for staff to send announcements.

    Staff can send:
    - Announcements to specific queue
    - Call next customer
    - Broadcast to all in queue
    """
    # Verify token
    payload = verify_token(token)
    if not payload or payload.get("role") not in ["ADMIN", "MANAGER", "STAFF"]:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    connection_id = await manager.connect(
        websocket=websocket,
        user_id=payload.get("sub"),
        role=payload.get("role")
    )

    await manager.send_to_connection(connection_id, {
        "type": "connected",
        "role": payload.get("role"),
        "message": "Staff WebSocket connected"
    })

    try:
        while True:
            data = await websocket.receive_json()

            # Handle announcement to queue
            if data.get("type") == "announce":
                queue_id = data.get("queue_id")
                message = data.get("message")

                if queue_id and message:
                    announcement = {
                        "type": "announcement",
                        "message": message,
                        "from": payload.get("sub"),
                        "queue_id": queue_id
                    }

                    # Broadcast to all connections; client filters by queue_id
                    await manager.broadcast(announcement)

                    # Also publish to Redis for cross-instance delivery
                    await publish_to_queue(queue_id, announcement)

                    # Store for HTTP fallback polling
                    await store_notification(queue_id, announcement)

                    logger.info(f"Announcement to queue {queue_id}: {message}")

                    await manager.send_to_connection(connection_id, {
                        "type": "announce_sent",
                        "queue_id": queue_id,
                        "recipients": manager.get_queue_connection_count(queue_id)
                    })

            # Handle temporary notification (auto-dismissed on client after 5s)
            elif data.get("type") == "notify":
                queue_id = data.get("queue_id")
                message = data.get("message")
                if queue_id and message:
                    notification = {
                        "type": "notification",
                        "queue_id": queue_id,
                        "message": message,
                    }
                    await manager.broadcast(notification)
                    await publish_to_queue(queue_id, notification)
                    # Store for HTTP fallback polling
                    await store_notification(queue_id, notification)
                    logger.info(f"Notification to queue {queue_id}: {message}")

            # Handle clearing an active announcement
            elif data.get("type") == "clear_announcement":
                queue_id = data.get("queue_id")
                if queue_id:
                    clear_msg = {
                        "type": "announcement_cleared",
                        "queue_id": queue_id,
                    }
                    await manager.broadcast(clear_msg)
                    await publish_to_queue(queue_id, clear_msg)
                    # Clear stored announcements
                    await clear_notifications(queue_id, "announcement")
                    logger.info(f"Announcement cleared for queue {queue_id}")

            # Handle calling specific customer
            elif data.get("type") == "call_customer":
                customer_id = data.get("customer_id")
                message = data.get("message", "It's your turn!")

                if customer_id:
                    notification = {
                        "type": "your_turn",
                        "message": message,
                        "sound": True,
                        "vibrate": True
                    }

                    await manager.send_to_user(customer_id, notification)
                    await publish_to_user(customer_id, notification)

                    logger.info(f"Called customer {customer_id}: {message}")

            # Ping/pong
            elif data.get("type") == "ping":
                await manager.send_to_connection(connection_id, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(connection_id)
    except Exception as e:
        logger.error(f"Staff WebSocket error: {e}")
        await manager.disconnect(connection_id)

