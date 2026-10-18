from typing import Optional
from fastapi import Header, HTTPException, Query, WebSocket, status
import google.auth
import google.auth.transport.requests

from .config import settings


def verify_http_token(
    x_access_token: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
) -> None:
    """Verify optional shared ACCESS_TOKEN if configured."""
    if not settings.access_token:
        return
    provided = x_access_token or token
    if provided != settings.access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing access token",
        )


def verify_ws_token(websocket: WebSocket) -> bool:
    """Verify optional shared ACCESS_TOKEN on WebSocket connection."""
    if not settings.access_token:
        return True
    token = websocket.query_params.get("token") or websocket.headers.get("x-access-token")
    return token == settings.access_token


def get_vertex_access_token() -> dict:
    """Return an OAuth2 access token for Vertex AI Live API / Avatar client."""
    credentials, project_id = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    auth_req = google.auth.transport.requests.Request()
    credentials.refresh(auth_req)
    effective_project = (
        settings.avatar_project_id
        or settings.google_cloud_project
        or project_id
        or ""
    )
    return {
        "access_token": credentials.token,
        "project_id": effective_project,
        "location": settings.google_cloud_location,
        "avatar_model": settings.avatar_model,
        "avatar_voice": settings.avatar_voice,
        "expires_in": 3600,
    }
