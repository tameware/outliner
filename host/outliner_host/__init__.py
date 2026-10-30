"""Optional Flask host kit: Drive share tokens + public OPML proxy.

Mount on any Flask app that serves the Outliner static client:

    from outliner_host import register_outliner_host
    register_outliner_host(app)

Set ``OUTLINER_SHARE_SECRET`` in the environment (or ``app.config``).
Writable shares need ADC credentials with Drive access (App Engine default SA).
"""

from __future__ import annotations

from flask import Flask

from .drive_proxy import bp as drive_proxy_bp


def register_outliner_host(app: Flask) -> None:
    """Attach ``/api/outliner/drive/…`` routes to ``app``."""
    app.register_blueprint(drive_proxy_bp)


def create_app() -> Flask:
    """Minimal app for tests and standalone demos."""
    app = Flask('outliner_host')
    register_outliner_host(app)
    return app
