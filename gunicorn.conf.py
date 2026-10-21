"""Small Linux web deployment; Render supplies PORT and terminates HTTPS."""

import os

bind = f"0.0.0.0:{os.environ.get('PORT', '10000')}"
worker_class = "sync"
workers = 1
threads = 1
timeout = 120
graceful_timeout = 30
# Recycle a worker periodically to release document-processing allocations.
max_requests = 100
max_requests_jitter = 20
# The application never logs draft contents or form fields. Keep access logging off.
accesslog = None
errorlog = "-"
loglevel = "info"
