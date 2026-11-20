from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://parola:parola@db:5432/parola"
    api_token: str = ""  # Deprecated; never authorizes a request.
    public_origin: str = ""  # Set to the HTTPS origin during deployment.
    render_external_url: str = ""
    serve_frontend: bool = False
    frontend_directory: str = "frontend"
    session_cookie_secure: bool = False  # Set true when HTTPS deployment is configured.
    session_lifetime_days: int = 14
    auth_registration_enabled: bool = True
    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_postgres_url(cls, value):
        if isinstance(value, str):
            for prefix in ("postgresql://", "postgres://"):
                if value.startswith(prefix):
                    return "postgresql+psycopg://" + value[len(prefix):]
        return value

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

settings = Settings()
