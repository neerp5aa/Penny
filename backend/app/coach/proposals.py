"""Owner-bound, version-bound, single-use records of changes Penny has suggested."""

import hashlib
import secrets
from dataclasses import dataclass
from threading import RLock
from typing import Literal

from fastapi import HTTPException, status

ProposalKind = Literal["goal_contribution", "budget_limit"]


@dataclass(slots=True)
class StoredProposal:
    id: str
    version: str
    owner_user_id: str
    kind: ProposalKind
    target_id: str
    # The value the target had when proposed; approval fails if it has changed since.
    expected_current_cents: int
    proposed_cents: int
    applied: bool = False


class ProposalStore:
    def __init__(self) -> None:
        self._proposals: dict[str, StoredProposal] = {}
        self._lock = RLock()

    def create(
        self,
        owner_user_id: str,
        kind: ProposalKind,
        target_id: str,
        expected_current_cents: int,
        proposed_cents: int,
    ) -> StoredProposal:
        proposal_id = f"proposal-{secrets.token_urlsafe(12)}"
        version = hashlib.sha256(
            f"{proposal_id}:{owner_user_id}:{kind}:{target_id}:"
            f"{expected_current_cents}:{proposed_cents}".encode()
        ).hexdigest()[:24]
        proposal = StoredProposal(
            id=proposal_id,
            version=version,
            owner_user_id=owner_user_id,
            kind=kind,
            target_id=target_id,
            expected_current_cents=expected_current_cents,
            proposed_cents=proposed_cents,
        )
        with self._lock:
            self._proposals[proposal_id] = proposal
        return proposal

    def consume_for_approval(self, proposal_id: str, user_id: str, version: str) -> StoredProposal:
        with self._lock:
            proposal = self._proposals.get(proposal_id)
            if not proposal:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
            if proposal.owner_user_id != user_id:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Proposal belongs to another user")
            if proposal.version != version:
                raise HTTPException(status.HTTP_409_CONFLICT, "Proposal version is stale")
            if proposal.applied:
                raise HTTPException(status.HTTP_409_CONFLICT, "Proposal was already applied")
            # Reserve the single-use command while still holding the lock so two
            # concurrent approvals cannot both pass authorization.
            proposal.applied = True
            return proposal


proposal_store = ProposalStore()
