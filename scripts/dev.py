"""Run the local API and Vite together; stop both with Ctrl+C (WSL/Linux)."""
import argparse
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5173)
    parser.add_argument('--api-port', type=int, default=8000)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    python = root / 'backend/.venv/bin/python'
    if not python.exists():
        raise SystemExit('Create backend/.venv and install backend/requirements-dev.txt first.')
    for port in (args.port, args.api_port):
        if not 1 <= port <= 65535:
            raise SystemExit('Invalid port')
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('0.0.0.0', port))
            except OSError:
                raise SystemExit(f'Port {port} is already in use. Stop the previous server first.')
    if args.port == args.api_port:
        raise SystemExit('Web and API ports must be different')
    env = {**os.environ, 'PAROLA_API_URL': f'http://127.0.0.1:{args.api_port}'}
    children = []
    try:
        children.append(subprocess.Popen([str(python), '-m', 'uvicorn', 'app.main:app', '--reload', '--port', str(args.api_port)], cwd=root/'backend', env=env, start_new_session=True))
        children.append(subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(args.port), '--strictPort'], cwd=root, env=env, start_new_session=True))
        print(f'Parola: http://localhost:{args.port} — Ctrl+C stops both servers.', flush=True)
        while all(child.poll() is None for child in children):
            time.sleep(.25)
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)


if __name__ == '__main__':
    main()
