from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://parola:parola@db:5432/parola"
    api_token: str = ""  # Deprecated; never authorizes a request.
    public_origin: str = ""  # Set to the HTTPS origin during deployment.
    session_cookie_secure: bool = False  # Set true when HTTPS deployment is configured.
    session_lifetime_days: int = 14
    auth_registration_enabled: bool = True
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
