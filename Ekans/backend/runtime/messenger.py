"""Agent-to-Agent Messenger — dynamic non-linear communication layer.

Any agent can send a message to any other agent at any point during a run.
The manager acts as router and can intercept, redirect, or summarise messages.
Agents signal BLOCKED to pause their task and wait for a reply before proceeding.
A cycle-guard ensures no agent pair can ping-pong more than MAX_EXCHANGES times.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.models.domain import AgentDefinition


MAX_EXCHANGES = 3   # max times agent A may ask agent B in one run
MESSAGE_TIMEOUT = 60.0  # seconds before an unanswered message is auto-resolved


@dataclass
class AgentMessage:
    """A message sent from one agent to another."""
    id: str
    run_id: str
    from_agent_id: str
    from_agent_name: str
    to_agent_id: str
    to_agent_name: str
    subject: str          # short label shown in UI
    body: str             # full question / context
    reply: str = ""
    resolved: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    resolved_at: datetime | None = None


class AgentMessenger:
    """In-process non-linear agent communication hub for a single run."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        # pending reply futures keyed by message id
        self._pending: dict[str, asyncio.Future[str]] = {}
        # inbox queues keyed by agent_id
        self._inboxes: dict[str, asyncio.Queue[AgentMessage]] = defaultdict(asyncio.Queue)
        # full message log for the run
        self.log: list[AgentMessage] = []
        # exchange counter: (from_agent_id, to_agent_id) → count
        self._exchange_count: dict[tuple[str, str], int] = defaultdict(int)

    # ── Public API ────────────────────────────────────────────────────────────

    def can_ask(self, from_agent_id: str, to_agent_id: str) -> bool:
        """Returns False when the pair has already exchanged MAX_EXCHANGES times."""
        return self._exchange_count[(from_agent_id, to_agent_id)] < MAX_EXCHANGES

    def send(self, msg: AgentMessage) -> None:
        """Record a message handled inline by the runtime's router.

        Peer replies are often generated immediately instead of by a dedicated
        worker.  Recording that delivery keeps the inbox/outbox audit trail
        intact and makes the exchange available to the manager and UI.
        """
        self._exchange_count[(msg.from_agent_id, msg.to_agent_id)] += 1
        self._inboxes[msg.to_agent_id].put_nowait(msg)
        self.log.append(msg)

    async def ask(
        self,
        msg: AgentMessage,
    ) -> str:
        """
        Deliver a message and *await* the reply (suspends the caller).
        Returns the reply text when the recipient answers, or an auto-resolution
        string if MESSAGE_TIMEOUT seconds elapse without a reply.
        """
        self._exchange_count[(msg.from_agent_id, msg.to_agent_id)] += 1
        loop = asyncio.get_event_loop()
        future: asyncio.Future[str] = loop.create_future()
        self._pending[msg.id] = future
        self._inboxes[msg.to_agent_id].put_nowait(msg)
        self.log.append(msg)

        try:
            reply = await asyncio.wait_for(asyncio.shield(future), timeout=MESSAGE_TIMEOUT)
        except asyncio.TimeoutError:
            reply = f"[No reply from {msg.to_agent_name} within timeout — proceeding with best judgement.]"
            msg.reply = reply
            msg.resolved = True
            msg.resolved_at = datetime.utcnow()
            future.cancel()
            self._pending.pop(msg.id, None)

        return reply

    def reply(self, message_id: str, reply_text: str) -> bool:
        """
        Called by the recipient agent to answer a pending message.
        Returns True if the message was pending, False if it was already resolved.
        """
        future = self._pending.pop(message_id, None)
        found = False
        for msg in self.log:
            if msg.id == message_id:
                msg.reply = reply_text
                msg.resolved = True
                msg.resolved_at = datetime.utcnow()
                found = True
                break
        if future is not None and not future.done():
            future.set_result(reply_text)
        return found

    def pending_for(self, agent_id: str) -> list[AgentMessage]:
        """Return all unresolved messages waiting for this agent."""
        msgs: list[AgentMessage] = []
        q = self._inboxes[agent_id]
        # Drain without blocking — only return what's already queued
        while not q.empty():
            try:
                msgs.append(q.get_nowait())
            except asyncio.QueueEmpty:
                break
        return msgs

    def all_messages(self) -> list[dict]:
        """Serialise the full message log for the run result payload."""
        return [
            {
                "id": m.id,
                "from": m.from_agent_name,
                "to": m.to_agent_name,
                "subject": m.subject,
                "body": m.body,
                "reply": m.reply,
                "resolved": m.resolved,
                "created_at": m.created_at.isoformat(),
                "resolved_at": m.resolved_at.isoformat() if m.resolved_at else None,
            }
            for m in self.log
        ]
