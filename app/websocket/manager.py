import asyncio
import json
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket
from dataclasses import dataclass, field

logger = logging.getLogger("virtual_queue")

@dataclass
class ConnectionInfo:
    websocket: WebSocket
    user_id: Optional[int] = None
    queue_id: Optional[str] = None
    role: Optional[str] = None

class ConnectionManager:
    """Manages WebSocket connections for real-time notifications."""

    def __init__(self):
        # All active connections: connection_id -> ConnectionInfo
        self.active_connections: Dict[str, ConnectionInfo] = {}
        # Connections by queue: queue_id -> set of connection_ids
        self.queue_connections: Dict[str, Set[str]] = {}
        # Connections by user: user_id -> set of connection_ids
        self.user_connections: Dict[int, Set[str]] = {}
        # Connection counter for unique IDs
        self._counter = 0
        self._lock = asyncio.Lock()

    async def _generate_connection_id(self) -> str:
        async with self._lock:
            self._counter += 1
            return f"conn_{self._counter}"

    async def connect(
        self,
        websocket: WebSocket,
        user_id: Optional[int] = None,
        queue_id: Optional[str] = None,
        role: Optional[str] = None
    ) -> str:
        """Accept a new WebSocket connection."""
        await websocket.accept()

        connection_id = await self._generate_connection_id()
        connection_info = ConnectionInfo(
            websocket=websocket,
            user_id=user_id,
            queue_id=queue_id,
            role=role
        )

        self.active_connections[connection_id] = connection_info

        # Track by queue
        if queue_id:
            if queue_id not in self.queue_connections:
                self.queue_connections[queue_id] = set()
            self.queue_connections[queue_id].add(connection_id)

        # Track by user
        if user_id:
            if user_id not in self.user_connections:
                self.user_connections[user_id] = set()
            self.user_connections[user_id].add(connection_id)

        logger.info(f"WebSocket connected: {connection_id} (user={user_id}, queue={queue_id})")
        return connection_id

    async def disconnect(self, connection_id: str):
        """Remove a WebSocket connection."""
        if connection_id not in self.active_connections:
            return

        connection_info = self.active_connections[connection_id]

        # Remove from queue tracking
        if connection_info.queue_id and connection_info.queue_id in self.queue_connections:
            self.queue_connections[connection_info.queue_id].discard(connection_id)
            if not self.queue_connections[connection_info.queue_id]:
                del self.queue_connections[connection_info.queue_id]

        # Remove from user tracking
        if connection_info.user_id and connection_info.user_id in self.user_connections:
            self.user_connections[connection_info.user_id].discard(connection_id)
            if not self.user_connections[connection_info.user_id]:
                del self.user_connections[connection_info.user_id]

        del self.active_connections[connection_id]
        logger.info(f"WebSocket disconnected: {connection_id}")

    async def send_to_connection(self, connection_id: str, message: dict):
        """Send a message to a specific connection."""
        if connection_id in self.active_connections:
            try:
                await self.active_connections[connection_id].websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to {connection_id}: {e}")
                await self.disconnect(connection_id)

    async def send_to_user(self, user_id: int, message: dict):
        """Send a message to all connections of a specific user."""
        if user_id in self.user_connections:
            for connection_id in list(self.user_connections[user_id]):
                await self.send_to_connection(connection_id, message)

    async def send_to_queue(self, queue_id: str, message: dict):
        """Send a message to all connections in a specific queue."""
        if queue_id in self.queue_connections:
            tasks = []
            for connection_id in list(self.queue_connections[queue_id]):
                tasks.append(self.send_to_connection(connection_id, message))
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast(self, message: dict):
        """Send a message to all active connections."""
        tasks = []
        for connection_id in list(self.active_connections.keys()):
            tasks.append(self.send_to_connection(connection_id, message))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def get_queue_connection_count(self, queue_id: str) -> int:
        """Get the number of connections in a queue."""
        return len(self.queue_connections.get(queue_id, set()))

    def get_total_connections(self) -> int:
        """Get the total number of active connections."""
        return len(self.active_connections)

# Global connection manager instance
manager = ConnectionManager()

