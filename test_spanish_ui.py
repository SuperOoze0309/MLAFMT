"""Narrow Spanish-locale coverage for the desktop and web interfaces."""

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
                    "citation_hint", "howto", "about", "chinese_course"):
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
