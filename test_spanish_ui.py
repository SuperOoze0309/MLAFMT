"""Narrow Spanish-locale coverage for the desktop and web interfaces."""

import ast
import inspect
import json
import os
import re
import unittest
from pathlib import Path
from unittest import mock

import mla_gui as gui


ROOT = Path(__file__).resolve().parent


class SpanishCatalogTests(unittest.TestCase):
    def test_spanish_catalog_covers_every_english_key(self):
        self.assertEqual(set(gui.T["es"]), set(gui.T["en"]))
        self.assertEqual(set(gui.T["en"]), set(gui.T["zh"]))

    def test_spanish_catalog_has_actual_translations(self):
        for key in ("hero", "tagline", "menu_file", "adv_title", "preserve_title",
                    "citation_hint", "howto", "about", "chinese_course", "template_validation_hint"):
            with self.subTest(key=key):
                self.assertNotEqual(gui.T["es"][key], gui.T["en"][key])

    def test_spanish_default_locale_detection(self):
        with mock.patch.object(gui.sys, "platform", "linux"), \
                mock.patch.object(gui.locale, "getlocale", return_value=("es_ES", "UTF-8")), \
                mock.patch.dict(os.environ, {"LANG": ""}):
            self.assertEqual(gui._default_lang(), "es")
        with mock.patch.object(gui.sys, "platform", "linux"), \
                mock.patch.object(gui.locale, "getlocale", return_value=("en_US", "UTF-8")), \
                mock.patch.dict(os.environ, {"LANG": ""}):
            self.assertEqual(gui._default_lang(), "en")

    def test_spanish_environment_locale_has_a_separate_boundary(self):
        for environment_locale in ("es", "es_ES.UTF-8", "es_MX.UTF-8", "es_419.UTF-8"):
            with self.subTest(environment_locale=environment_locale), \
                    mock.patch.object(gui.sys, "platform", "linux"), \
                    mock.patch.object(gui.locale, "getlocale", return_value=("en_US", "UTF-8")), \
                    mock.patch.dict(os.environ, {"LANG": environment_locale}):
                self.assertEqual(gui._default_lang(), "es")

    def test_template_validation_uses_localized_hints_without_internal_details(self):
        errors = (
            ValueError("line_spacing_pt must be a number from 0 to 60."),
            ValueError("Expected a template object"),
            TypeError("first_line_chars has an unsupported type"),
            json.JSONDecodeError("Expecting property name", "{", 1),
            UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte"),
            gui.tk.TclError('expected integer but got "invalid"'),
        )
        for language in ("zh", "en", "es"):
            catalog = gui.T[language]
            expected = catalog["template_invalid"].format(e=catalog["template_validation_hint"])
            for error in errors:
                with self.subTest(language=language, error=type(error).__name__):
                    actual = gui._template_error_message(language, error)
                    self.assertEqual(actual, expected)
                    self.assertNotIn(str(error), actual)

    def test_template_file_errors_keep_diagnostic_information(self):
        error = OSError("Access denied: H:/drafts/template.json")
        for language in ("zh", "en", "es"):
            with self.subTest(language=language):
                self.assertEqual(gui._template_error_message(language, error),
                                 gui.T[language]["template_io"].format(e=str(error)))

    def test_known_localized_template_validation_details_are_retained(self):
        for language in ("zh", "en", "es"):
            catalog = gui.T[language]
            for key in ("template_too_large", "page_number_invalid"):
                with self.subTest(language=language, key=key):
                    self.assertEqual(gui._template_error_message(language, ValueError(catalog[key])),
                                     catalog["template_invalid"].format(e=catalog[key]))

    def test_desktop_smoke_check_includes_spanish(self):
        tree = ast.parse(inspect.getsource(gui._smoke_test))
        language_loops = [ast.literal_eval(node.iter) for node in ast.walk(tree)
                          if isinstance(node, ast.For) and isinstance(node.target, ast.Name)
                          and node.target.id == "language"]
        self.assertIn(("zh", "en", "es"), language_loops)


class SpanishWebTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")

    def test_language_switch_has_an_accessible_spanish_option(self):
        self.assertIn('id="lang-es"', self.html)
        self.assertIn('lang="es"', self.html)
        self.assertIn("Español", self.html)
        self.assertIn('LANGUAGES = ["zh", "en", "es"]', self.html)

    def test_spanish_dictionary_and_privacy_copy(self):
        self.assertIn('T.es = { ...T.en };', self.html)
        self.assertIn('language: "Idioma de la interfaz"', self.html)
        self.assertIn(
            "El formato se aplica en tu dispositivo. El borrador actual no se sube automáticamente.",
            self.html,
        )
        self.assertIn("排版在你的设备上完成，当前文稿不会自动上传。", self.html)

    def test_spanish_locale_is_used_for_numbers_and_document_language(self):
        self.assertIn('es: "es-ES"', self.html)
        self.assertIn('document.documentElement.lang = LANGUAGE_LOCALES[lang] || "en";', self.html)
        self.assertIn('t("page_title")', self.html)

    def test_no_language_specific_ternaries_remain_in_preview(self):
        for pattern in ('lang === "zh"', 'const zh = lang', '["zh", "en"].includes'):
            with self.subTest(pattern=pattern):
                self.assertIsNone(re.search(re.escape(pattern), self.html))


if __name__ == "__main__":
    unittest.main()
