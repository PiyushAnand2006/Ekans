"""Small in-process pub/sub bus used by REST, WebSocket, and the runtime."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import DefaultDict

from backend.models.domain import RuntimeEvent


class EventBus:
    def __init__(self) -> None:
        self._subscribers: DefaultDict[str, set[asyncio.Queue[RuntimeEvent]]] = defaultdict(set)

    async def publish(self, event: RuntimeEvent) -> None:
        for queue in tuple(self._subscribers[event.run_id]):
            await queue.put(event)

    def subscribe(self, run_id: str) -> asyncio.Queue[RuntimeEvent]:
        queue: asyncio.Queue[RuntimeEvent] = asyncio.Queue()
        self._subscribers[run_id].add(queue)
        return queue

    def unsubscribe(self, run_id: str, queue: asyncio.Queue[RuntimeEvent]) -> None:
        self._subscribers[run_id].discard(queue)
        if not self._subscribers[run_id]:
            self._subscribers.pop(run_id, None)


event_bus = EventBus()
