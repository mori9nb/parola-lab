"""Local administration only; never exposed through HTTP."""
import argparse
import getpass
from pydantic import TypeAdapter, EmailStr
from sqlalchemy import select, delete
from app.auth import passwords
from app.database import SessionLocal
from app.models import User, LoginSession, DEV_USER_ID


def claim_development(session, email, display_name, password):
    email = str(TypeAdapter(EmailStr).validate_python(email)).casefold()
    if len(password) < 12 or len(password) > 128:
        raise ValueError("Use a password of 12–128 characters")
    if not display_name.strip() or len(display_name.strip()) > 100:
        raise ValueError("Display name must be 1–100 characters")
    owner = session.scalar(select(User).where(User.id == DEV_USER_ID).with_for_update())
    if owner is None:
        raise ValueError("Development owner is missing; run migrations first")
    if owner.password_hash:
        raise ValueError("Owner account already exists; use normal sign-in")
    if session.scalar(select(User).where(User.email == email, User.id != DEV_USER_ID)):
        raise ValueError("Email already belongs to another account")
    owner.email = email
    owner.display_name = display_name.strip()
    owner.password_hash = passwords.hash(password)
    session.commit()
    return owner.id


def reset_password(session, email, password):
    email = str(TypeAdapter(EmailStr).validate_python(email)).casefold()
    if not 12 <= len(password) <= 128:
        raise ValueError("Use a password of 12–128 characters")
    user = session.scalar(select(User).where(User.email == email).with_for_update())
    if user is None or not user.password_hash:
        raise ValueError("Account not found")
    user.password_hash = passwords.hash(password)
    session.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    session.commit()


def main():
    parser = argparse.ArgumentParser(description="Parola local account setup")
    parser.add_argument("command", choices=["create-owner", "reset-password"])
    args = parser.parse_args()
    email = input("Account email: ").strip()
    name = input("Display name: ").strip() if args.command == "create-owner" else None
    password = getpass.getpass("Password (minimum 12 characters): ")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords do not match; no changes made")
    try:
        with SessionLocal() as session:
            if args.command == "create-owner":
                claim_development(session, email, name, password)
            else:
                reset_password(session, email, password)
    except ValueError as exc:
        raise SystemExit(str(exc))
    print("Owner created; existing data preserved." if args.command == "create-owner" else "Password reset; existing sessions revoked.")


if __name__ == "__main__":
    main()
