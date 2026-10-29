"""Native conversion output commits preserve the source and complete atomically."""

from pathlib import Path
import threading
import tkinter as tk
from unittest.mock import patch

import pytest

import desktop_conversion as desktop
from document_conversion import ConversionError


def test_save_result_preserves_source_and_commits_exact_output(tmp_path):
    source = tmp_path / "draft.pdf"
    destination = tmp_path / "converted.docx"
    source.write_bytes(b"original private source")
    desktop.save_result(destination, b"converted fixture", source)
    assert destination.read_bytes() == b"converted fixture"
    assert source.read_bytes() == b"original private source"
    assert sorted(path.name for path in tmp_path.iterdir()) == ["converted.docx", "draft.pdf"]


def test_save_result_refuses_source_and_hardlink_alias(tmp_path):
    source = tmp_path / "draft.docx"
    alias = tmp_path / "alias.docx"
    source.write_bytes(b"original")
    with pytest.raises(ConversionError, match="source_overwrite"):
        desktop.save_result(source, b"replacement", source)
    alias.hardlink_to(source)
    with pytest.raises(ConversionError, match="source_overwrite"):
        desktop.save_result(alias, b"replacement", source)
    assert source.read_bytes() == b"original"


def test_save_failure_keeps_existing_destination_and_removes_partial_output(tmp_path):
    source = tmp_path / "draft.pdf"
    target = tmp_path / "converted.docx"
    source.write_bytes(b"original")
    target.write_bytes(b"previous result")
    with patch("desktop_conversion.os.replace", side_effect=OSError("fixture failed commit")):
        with pytest.raises(OSError):
            desktop.save_result(target, b"new result", source)
    assert target.read_bytes() == b"previous result"
    assert not list(tmp_path.glob(".formcapy-*"))


def test_desktop_dialog_translations_cover_same_actions_and_warnings():
    assert set(desktop._TEXT) == {"en", "zh", "es"}
    for messages in desktop._TEXT.values():
        assert set(messages) == set(desktop._TEXT["en"])
        assert all(isinstance(value, str) and value.strip() for value in messages.values())


def test_parent_window_destruction_cancels_active_conversion_and_allows_cleanup(tmp_path):
    try:
        parent = tk.Tk()
    except tk.TclError:
        pytest.skip("A Tk display is unavailable")
    parent.withdraw()
    dialog = desktop.launch(parent, "en")
    source = tmp_path / "original.pdf"
    source.write_bytes(b"fictional local input")
    dialog.source = str(source)
    started, cleaned = threading.Event(), threading.Event()
    cancelled = []

    def active_conversion(_data, _name, _target, *, cancel_event):
        started.set()
        try:
            assert cancel_event.wait(3), "Parent destruction must cancel the worker"
            cancelled.append(cancel_event.is_set())
            raise ConversionError("cancelled")
        finally:
            cleaned.set()

    worker = None
    try:
        with patch("desktop_conversion.convert_document", side_effect=active_conversion):
            dialog.convert()
            worker = dialog.worker
            assert started.wait(2)
            assert not worker.daemon
            # This bypasses dialog.close()/WM_DELETE_WINDOW, matching app exit.
            parent.destroy()
            assert dialog.closed
            assert dialog.cancel_event.is_set()
            assert dialog.result is None
            worker.join(3)
            assert not worker.is_alive()
            assert cleaned.is_set() and cancelled == [True]
            assert source.read_bytes() == b"fictional local input"
    finally:
        dialog.cancel_event.set()
        if worker is not None:
            worker.join(3)
        try:
            parent.destroy()
        except tk.TclError:
            pass
