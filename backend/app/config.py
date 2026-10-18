import os
from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    google_cloud_project: str = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    google_cloud_location: str = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    google_genai_use_vertexai: bool = (
        os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true").lower() != "false"
    )

    live_model: str = os.getenv("LIVE_MODEL", "gemini-live-2.5-flash-native-audio")
    live_voice: str = os.getenv("LIVE_VOICE", "Puck")

    avatar_project_id: str = os.getenv("AVATAR_PROJECT_ID", "")
    avatar_model: str = os.getenv("AVATAR_MODEL", "gemini-3.1-flash-live-preview-04-2026")
    avatar_voice: str = os.getenv("AVATAR_VOICE", "kore")

    use_firestore: bool = os.getenv("USE_FIRESTORE", "false").lower() == "true"
    access_token: str = os.getenv("ACCESS_TOKEN", "")
    target_firm: str = os.getenv("TARGET_FIRM", "a top quant trading firm")

    problems_dir: Path = Path(
        os.getenv(
            "PROBLEMS_DIR",
            str(Path(__file__).resolve().parent.parent.parent / "problems"),
        )
    )
    static_dir: Path = Path(
        os.getenv(
            "STATIC_DIR",
            str(Path(__file__).resolve().parent.parent / "static"),
        )
    )


settings = Settings()
