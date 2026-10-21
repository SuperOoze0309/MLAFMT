"""Shared, JSON-compatible layout profiles for desktop, web and Android."""

import math


FORMAT_IDS = ("mla", "apa", "custom")
FONT_CHOICES = ("Times New Roman", "Arial", "Calibri", "宋体", "黑体")
DEFAULT_CUSTOM_PROFILE = {
    "label": "Course template",
    "paper_size": "Letter",
    "font_name": "Times New Roman",
    "font_size": 12,
    "line_spacing": 2.0,
    "margin_cm": 2.54,
    "first_line_cm": 1.27,
    "alignment": "left",
    "header": "page",
    "title_page": False,
    "references_title": "References",
    "sort_references": True,
    "page_number_position": "top_right",
    "show_cover_page_number": True,
    "page_number_start": 1,
    "typography": "western",
    "latin_font_name": "Times New Roman",
    "first_line_chars": 0,
    "line_spacing_pt": 0,
}

# Editable starting points, kept separate from a user's saved templates.
BUILTIN_CUSTOM_PRESETS = tuple(
    {
        "id": preset_id,
        "label_zh": label,
        "label_en": english,
        "profile": {
            **DEFAULT_CUSTOM_PROFILE,
            "label": label, "paper_size": "A4", "font_name": "宋体",
            "font_size": 12, "line_spacing": 1.5, "margin_cm": 2.5,
            "first_line_cm": 0.8466666667, "alignment": "justify",
            "page_number_position": "bottom_center",
            "title_page": cover, "show_cover_page_number": False,
            "references_title": "参考文献", "sort_references": False,
            "typography": "chinese", "first_line_chars": 2,
            "line_spacing_pt": fixed_spacing,
        },
    }
    for preset_id, label, english, cover, fixed_spacing in (
        ("zh_course", "中文课程论文（通用）", "Chinese course paper", False, 0),
        ("zh_thesis", "中文毕业论文（基础版）", "Chinese thesis (basic)", True, 20),
    )
)


def normalize_custom_profile(profile=None):
    """Validate a partial profile, supply defaults, and return a fresh dictionary.

    Imported templates contain layout settings only. Unknown keys are rejected
    so a misspelled setting cannot silently produce an unexpected document.
    """
    if profile is None:
        return dict(DEFAULT_CUSTOM_PROFILE)
    if not isinstance(profile, dict):
        raise ValueError("The course template must be a JSON object.")
    if set(profile) - set(DEFAULT_CUSTOM_PROFILE):
        raise ValueError("The course template contains unknown settings.")
    result = {**DEFAULT_CUSTOM_PROFILE, **profile}
    for key, maximum in (("label", 60), ("references_title", 80)):
        value = result[key]
        if (not isinstance(value, str) or not value.strip()
                or len(value.strip()) > maximum
                or any(ord(char) < 32 or 127 <= ord(char) <= 159
                       or 0xD800 <= ord(char) <= 0xDFFF
                       or ord(char) in (0xFFFE, 0xFFFF) for char in value)):
            raise ValueError(f"{key} must be nonempty text of at most {maximum} characters.")
        result[key] = value.strip()
    for key, choices in (
        ("paper_size", ("Letter", "A4")), ("font_name", FONT_CHOICES),
        ("alignment", ("left", "justify")),
        ("header", ("surname_page", "page", "none")),
        ("page_number_position", ("top_right", "bottom_center", "bottom_right")),
        ("typography", ("western", "chinese")),
        ("latin_font_name", ("Times New Roman", "Arial", "Calibri")),
    ):
        if result[key] not in choices:
            raise ValueError(f"Unsupported {key} in the course template.")
    for key, minimum, maximum in (
        ("font_size", 8, 24), ("line_spacing", 1, 3),
        ("margin_cm", 0.5, 5.08), ("first_line_cm", 0, 2.54),
        ("first_line_chars", 0, 4), ("line_spacing_pt", 0, 60),
    ):
        value = result[key]
        if (isinstance(value, bool) or not isinstance(value, (int, float))
                or not minimum <= value <= maximum or not math.isfinite(value)):
            raise ValueError(f"{key} must be a number from {minimum} to {maximum}.")
    if (isinstance(result["page_number_start"], bool)
            or not isinstance(result["page_number_start"], int)
            or not 1 <= result["page_number_start"] <= 9999):
        raise ValueError("page_number_start must be an integer from 1 to 9999.")
    for key in ("title_page", "sort_references", "show_cover_page_number"):
        if not isinstance(result[key], bool):
            raise ValueError(f"{key} must be true or false.")
    return result


def resolve_profile(format_id="mla", custom_profile=None):
    """Return an independent layout profile; built-in styles are immutable."""
    if not isinstance(format_id, str) or format_id not in FORMAT_IDS:
        raise ValueError("Choose MLA 9, APA 7 student, or a custom course template.")
    if format_id == "custom":
        result = normalize_custom_profile(custom_profile)
    else:
        result = dict(DEFAULT_CUSTOM_PROFILE)
        result.update(
            label="MLA 9" if format_id == "mla" else "APA 7 Student",
            header="surname_page" if format_id == "mla" else "page",
            title_page=format_id == "apa",
            references_title="Works Cited" if format_id == "mla" else "References",
        )
    return {**result, "format_id": format_id}
