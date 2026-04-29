"""
Admin endpoints — Phase 2 stubs.

Routes:
  GET  /admin/users/{user_id}/permissions     read user's UI-permission flags
  PUT  /admin/users/{user_id}/permissions     update flags

The `default_only` flag drives the Trade page's restricted-mode banner
(hides manual builder, leaves only the Default Strategy CTA). See
HANDOFF §2.1 — "Some traders should be restricted to Default only".

Today these are in-memory; Phase 3 will persist on the User model
(`User.permissions JSONB` column) and gate routes via `require_permission`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user, require_role
from app.auth.models import User
from app.common.types import UserRole

router = APIRouter()


class Permissions(BaseModel):
    default_only: bool = False
    can_execute_now: bool = True
    can_use_multi_broker: bool = True
    max_lots_without_approval: int = 4


# In-memory store keyed by user_id — Phase 3 moves to User.permissions JSONB
_PERMISSIONS: dict[int, Permissions] = {}


def _default_perms_for_user(user_id: int) -> Permissions:
    return _PERMISSIONS.setdefault(user_id, Permissions())


@router.get("/users/{user_id}/permissions", response_model=Permissions)
async def get_permissions(
    user_id: int,
    _admin: User = Depends(require_role(UserRole.ADMIN)),
) -> Permissions:
    return _default_perms_for_user(user_id)


@router.put("/users/{user_id}/permissions", response_model=Permissions)
async def set_permissions(
    user_id: int,
    perms: Permissions,
    _admin: User = Depends(require_role(UserRole.ADMIN)),
) -> Permissions:
    _PERMISSIONS[user_id] = perms
    return perms


@router.get("/me/permissions", response_model=Permissions)
async def my_permissions(user: User = Depends(get_current_user)) -> Permissions:
    """Self-service read for the frontend to gate the UI."""
    return _default_perms_for_user(user.id)
