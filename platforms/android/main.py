"""
main.py - Android wrapper for MLAFMT Web (built with Buildozer / python-for-android).

  1. starts the Flask server on 127.0.0.1:8600 in a background thread
  2. waits until the port answers
  3. shows it in a native android.webkit.WebView (via pyjnius)

Note: Kivy has no built-in WebView widget, so the native Android one is used.
"""

import os
import socket
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kivy.app import App
from kivy.clock import Clock
from kivy.uix.label import Label

from mla_web import app as flask_app

PORT = 8600
URL = f"http://127.0.0.1:{PORT}"


def _run_flask():
    flask_app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)


def _wait_for_port(timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.1)
    return False


class MLAFMTApp(App):
    def build(self):
        threading.Thread(target=_run_flask, daemon=True).start()
        self.label = Label(text="Loading MLA Formatter…")
        Clock.schedule_once(self._open_webview, 0)
        return self.label

    def _open_webview(self, _dt):
        if not _wait_for_port():
            self.label.text = "Could not start the local server."
            return
        try:
            from android.runnable import run_on_ui_thread  # noqa
            from jnius import autoclass
        except ImportError:          # desktop testing: open a normal browser instead
            import webbrowser
            webbrowser.open(URL)
            self.label.text = URL
            return

        WebView = autoclass("android.webkit.WebView")
        WebViewClient = autoclass("android.webkit.WebViewClient")
        activity = autoclass("org.kivy.android.PythonActivity").mActivity

        @run_on_ui_thread
        def show():
            wv = WebView(activity)
            s = wv.getSettings()
            s.setJavaScriptEnabled(True)
            s.setDomStorageEnabled(True)
            s.setAllowFileAccess(True)
            wv.setWebViewClient(WebViewClient())
            wv.loadUrl(URL)
            activity.setContentView(wv)

        show()


if __name__ == "__main__":
    MLAFMTApp().run()
