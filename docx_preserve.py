"""Format DOCX text while retaining its document package and body objects.

Original paragraphs, tables, drawings, links, notes and their relationships stay
in the source package. Generated cover/body styles live in a separate namespace;
source styles and document defaults are never edited.
"""

from copy import deepcopy
import hashlib
import io
import re
import zipfile

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor
from docx.text.paragraph import Paragraph
from docx.text.run import Run


MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_DOCX_EXPANDED = 80 * 1024 * 1024
MAX_BODY_PARAGRAPHS = 100000
_P = qn("w:p")
_SECT = qn("w:sectPr")
_IMAGE_TAGS = {qn("a:blip"), "{urn:schemas-microsoft-com:vml}imagedata"}
_TEXT_TAGS = {qn("w:t"), qn("w:delText")}
_TOGGLE_TAGS = {"w:b", "w:bCs", "w:i", "w:iCs", "w:caps", "w:smallCaps",
                "w:strike", "w:dstrike", "w:outline", "w:shadow", "w:emboss",
                "w:imprint", "w:vanish"}
_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_CONTENT_TAGS = {qn(tag) for tag in (
    "w:drawing", "w:pict", "w:object", "w:footnoteReference", "w:endnoteReference",
    "m:oMath", "m:oMathPara", "w:commentRangeStart", "w:commentReference",
    "w:ins", "w:del", "w:moveFrom", "w:moveTo", "w:fldSimple", "w:fldChar",
    "w:bookmarkStart", "w:bookmarkEnd",
)}


def _load_docx(input_path):
    with open(input_path, "rb") as stream:
        data = stream.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise ValueError("too_large")
    if not data:
        raise ValueError("empty_file")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = archive.infolist()
        if (len(members) > 2000 or sum(item.file_size for item in members) > MAX_DOCX_EXPANDED
                or any(item.file_size > 20 * 1024 * 1024 or item.flag_bits & 1 for item in members)):
            raise ValueError("DOCX archive exceeds processing limits")
        if "[Content_Types].xml" not in archive.namelist():
            raise ValueError("Not a DOCX package")
    return Document(io.BytesIO(data)), hashlib.sha256(data).hexdigest()


def _text(element):
    # Include visible inserted/deleted text in the picker so selecting a tracked
    # paragraph remains possible; the actual XML is retained unchanged.
    return "".join(node.text or "" for node in element.iter()
                   if node.tag in _TEXT_TAGS)


def _has_images(element):
    return any(node.tag in _IMAGE_TAGS for node in element.iter())


def _has_content(element):
    return bool(_text(element).strip()) or any(node.tag in _CONTENT_TAGS for node in element.iter())


def inspect_draft_paragraphs(input_path):
    """List visible direct body paragraphs; ids count empty source paragraphs too."""
    source, fingerprint = _load_docx(input_path)
    result, paragraph_id = [], 0
    for element in source.element.body:
        if element.tag != _P:
            continue
        paragraph_id += 1
        if paragraph_id > MAX_BODY_PARAGRAPHS:
            raise ValueError("unsupported_document")
        if _has_content(element):
            result.append({"id": paragraph_id, "text": _text(element)[:300],
                           "has_images": _has_images(element)})
            if len(result) > 10000:
                raise ValueError("unsupported_document")
    return {"source_fingerprint": fingerprint, "paragraphs": result}


def _validate_preserved(values, count, expected_fingerprint, actual_fingerprint):
    if values is None:
        return set()
    if not isinstance(values, (list, tuple)) or len(values) > 10000:
        raise ValueError("invalid_options")
    if any(isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= count
           for value in values):
        raise ValueError("invalid_options")
    selected = set(values)
    if selected and (not isinstance(expected_fingerprint, str)
                     or expected_fingerprint.lower() != actual_fingerprint):
        raise ValueError("draft_changed")
    return selected


def _merge_properties(target, incoming):
    """Merge compound XML properties by attributes instead of discarding siblings."""
    for key, value in incoming.attrib.items():
        target.set(key, value)
    for child in incoming:
        existing = target.find(child.tag)
        if existing is None:
            target.append(deepcopy(child))
        else:
            _merge_properties(existing, child)


def _set_property(parent, tag, value):
    element = parent.find(qn(tag))
    if element is None:
        getter = getattr(parent, "get_or_add_" + tag.split(":", 1)[1], None)
        if getter is not None:
            element = getter()
        else:
            element = OxmlElement(tag)
            parent.append(element)
    element.set(qn("w:val"), value)


def _import_generated_styles(source, generated, profile):
    """Copy generated styles into a collision-free namespace in the source."""
    existing = {style.get(qn("w:styleId")) for style in source.styles.element}
    serial = 1
    while any(value and value.startswith(f"MLAFMTLayout{serial}_") for value in existing):
        serial += 1
    prefix = f"MLAFMTLayout{serial}_"
    styles = [element for element in generated.styles.element if element.tag == qn("w:style")]
    mapping = {element.get(qn("w:styleId")): prefix + element.get(qn("w:styleId")) for element in styles}
    defaults = generated.styles.element.find(qn("w:docDefaults"))
    source_defaults = source.styles.element.find(qn("w:docDefaults"))
    source_rpr_default = source_defaults.find(qn("w:rPrDefault")) if source_defaults is not None else None
    source_rpr = source_rpr_default.find(qn("w:rPr")) if source_rpr_default is not None else None
    normal_id = mapping.get("Normal")
    for element in styles:
        clone = deepcopy(element)
        original_id = clone.get(qn("w:styleId"))
        clone.set(qn("w:styleId"), mapping[original_id])
        clone.attrib.pop(qn("w:default"), None)
        clone.set(qn("w:customStyle"), "1")
        name = clone.find(qn("w:name"))
        if name is not None:
            name.set(qn("w:val"), prefix + (name.get(qn("w:val")) or original_id))
        for node in clone.iter():
            if node.tag in {qn(tag) for tag in ("w:basedOn", "w:next", "w:link", "w:pStyle", "w:rStyle", "w:tblStyle")}:
                value = node.get(qn("w:val"))
                if value in mapping:
                    node.set(qn("w:val"), mapping[value])
        if original_id == "Normal":
            # Generated text must not inherit unusual source document defaults.
            # Original paragraphs never refer to this isolated style.
            for tag, default_tag in (("w:pPr", "w:pPrDefault"), ("w:rPr", "w:rPrDefault")):
                merged = OxmlElement(tag)
                default = defaults.find(qn(default_tag)) if defaults is not None else None
                default_properties = default.find(qn(tag)) if default is not None else None
                if default_properties is not None:
                    _merge_properties(merged, default_properties)
                own = clone.find(qn(tag))
                if own is not None:
                    _merge_properties(merged, own)
                    clone.remove(own)
                clone.append(merged)
            rpr = clone.find(qn("w:rPr"))
            for tag in ("w:b", "w:bCs", "w:i", "w:iCs", "w:caps", "w:smallCaps",
                        "w:strike", "w:dstrike", "w:outline", "w:shadow", "w:emboss",
                        "w:imprint", "w:vanish", "w:webHidden", "w:specVanish", "w:rtl", "w:cs"):
                inherited = source_rpr.find(qn(tag)) if source_rpr is not None else None
                inherited_on = (inherited is not None
                                and inherited.get(qn("w:val"), "1").casefold() not in ("0", "false", "off", "no"))
                # Style-level toggles reverse the inherited state. A true
                # source default therefore needs one compensating true toggle.
                _set_property(rpr, tag, "1" if tag in _TOGGLE_TAGS and inherited_on else "0")
            for tag, value in (("w:color", "000000"), ("w:u", "none"),
                               ("w:highlight", "none"), ("w:vertAlign", "baseline"),
                               ("w:spacing", "0"), ("w:position", "0"), ("w:w", "100")):
                _set_property(rpr, tag, value)
            ppr = clone.find(qn("w:pPr"))
            for tag in ("w:keepNext", "w:keepLines", "w:pageBreakBefore", "w:bidi", "w:contextualSpacing"):
                _set_property(ppr, tag, "0")
            _set_property(ppr, "w:widowControl", "1")
        source.styles.element.append(clone)
    return mapping, normal_id


def _remap_generated(element, mapping, normal_id):
    for node in element.iter():
        if node.tag in (qn("w:pStyle"), qn("w:rStyle"), qn("w:tblStyle")):
            value = node.get(qn("w:val"))
            if value in mapping:
                node.set(qn("w:val"), mapping[value])
        if node.tag == _P:
            ppr = node.get_or_add_pPr()
            if ppr.find(qn("w:pStyle")) is None:
                style = OxmlElement("w:pStyle")
                style.set(qn("w:val"), normal_id)
                ppr.insert(0, style)
        elif node.tag == qn("w:r") and "DefaultParagraphFont" in mapping:
            rpr = node.get_or_add_rPr()
            if rpr.find(qn("w:rStyle")) is None:
                style = OxmlElement("w:rStyle")
                style.set(qn("w:val"), mapping["DefaultParagraphFont"])
                rpr.insert(0, style)


def _effective_num_pr(paragraph):
    styles, seen = [], set()
    style = paragraph.style
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        styles.append(style)
        style = style.base_style
    merged = OxmlElement("w:numPr")
    for style in reversed(styles):
        ppr = style.element.find(qn("w:pPr"))
        num = ppr.find(qn("w:numPr")) if ppr is not None else None
        if num is not None:
            _merge_properties(merged, num)
    ppr = paragraph._p.find(qn("w:pPr"))
    direct = ppr.find(qn("w:numPr")) if ppr is not None else None
    if direct is not None:
        _merge_properties(merged, direct)
    return merged if len(merged) else None


def _is_plain_sortable(element, paragraph):
    return (not any(node.tag in _CONTENT_TAGS or any(key.startswith(_REL_NS) for key in node.attrib)
                    for node in element.iter()) and _effective_num_pr(paragraph) is None)


def _remove_source_sections(element):
    for section in list(element.iter(_SECT)):
        section.getparent().remove(section)


def _character_style_emphasis(run, attribute):
    style, seen = run.style, set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        value = getattr(style.font, attribute)
        if value is not None:
            return bool(value)
        style = style.base_style
    return False


def _normalize_text_xml(element):
    """Normalize simple text nodes without assigning Run.text or losing objects."""
    if any(node.tag in _CONTENT_TAGS for node in element.iter()):
        return False
    for node in list(element.iter()):
        if next(node.iterancestors(_P), None) is not element:
            continue
        if node.tag == qn("w:tab") or (node.tag in (qn("w:br"), qn("w:cr"))
                                        and node.get(qn("w:type"), "textWrapping") == "textWrapping"):
            replacement = OxmlElement("w:t")
            replacement.text = " "
            replacement.set(qn("xml:space"), "preserve")
            node.getparent().replace(node, replacement)
    nodes = [node for node in element.iter(qn("w:t"))
             if next(node.iterancestors(_P), None) is element]
    started, trailing_space = False, False
    for node in nodes:
        value = re.sub(r"[ \t\r\n\u00a0\u000b]+", " ", node.text or "")
        if not started:
            value = value.lstrip()
        elif trailing_space:
            value = value.lstrip(" ")
        node.text = value
        if value:
            started = True
            trailing_space = value.endswith(" ")
        if value.startswith(" ") or value.endswith(" "):
            node.set(qn("xml:space"), "preserve")
    for node in reversed(nodes):
        value = (node.text or "").rstrip()
        node.text = value
        if value:
            break
    return True


def _strip_xml_block_marker(element):
    nodes = [node for node in element.iter(qn("w:t"))
             if next(node.iterancestors(_P), None) is element]
    prefix = "".join(node.text or "" for node in nodes)
    match = re.match(r"^>+\s*", prefix)
    if match is None:
        return
    remaining = len(match.group(0))
    for node in nodes:
        value = node.text or ""
        removed = min(remaining, len(value))
        node.text = value[removed:]
        remaining -= removed
        if not remaining:
            break


def _format_existing(element, original, source, profile, mapping, core, *, role="body", heading_level=0):
    """Change direct text/paragraph formatting without replacing XML content."""
    paragraph = Paragraph(element, source._body)
    numbering = _effective_num_pr(original)
    paragraph._p.style = mapping.get(f"Heading{heading_level}" if heading_level else "Normal", mapping["Normal"])
    if numbering is not None:
        ppr = paragraph._p.get_or_add_pPr()
        old = ppr.find(qn("w:numPr"))
        if old is not None:
            ppr.remove(old)
        ppr._insert_numPr(numbering)
    for original_run, copied_run in zip(original._p.iter(qn("w:r")), element.iter(qn("w:r"))):
        if next(original_run.iterancestors(_P), None) is not original._p:
            continue  # Text inside a drawing/textbox keeps its own formatting.
        before, after = Run(original_run, original), Run(copied_run, paragraph)
        emphasis = [core._effective_emphasis(before, original, key) for key in ("bold", "italic", "underline")]
        core._style_profile_run(after, profile, role=role, heading_level=heading_level)
        rpr = copied_run.get_or_add_rPr()
        if rpr.find(qn("w:rStyle")) is None and "DefaultParagraphFont" in mapping:
            style = OxmlElement("w:rStyle")
            style.set(qn("w:val"), mapping["DefaultParagraphFont"])
            rpr.insert(0, style)
        forced_bold = bool(heading_level) or (role == "reference_title" and
                      (profile["format_id"] == "apa" or profile["typography"] == "chinese"))
        forced_italic = heading_level == 3 and profile["format_id"] == "apa"
        for attribute, active in (("bold", emphasis[0] or forced_bold),
                                  ("italic", emphasis[1] or forced_italic),
                                  ("underline", emphasis[2])):
            value = True if active else (False if _character_style_emphasis(before, attribute) else None)
            setattr(after, attribute, value)
        after.font.color.rgb = RGBColor(0, 0, 0)
    pf = core._profile_spacing(paragraph, profile)
    pf.left_indent = pf.right_indent = pf.first_line_indent = Inches(0)
    core._reset_profile_character_indents(paragraph)
    pf.keep_with_next = bool(heading_level) or role == "reference_title"
    pf.keep_together = False
    pf.page_break_before = role == "reference_title"
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    if role == "reference_title":
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif role == "reference":
        if profile["typography"] != "chinese":
            pf.left_indent, pf.first_line_indent = Inches(0.5), Inches(-0.5)
    elif role == "block":
        pf.left_indent = Inches(0.5)
    elif heading_level:
        if heading_level == 1 and profile["format_id"] == "apa":
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif role == "body" and numbering is None:
        core._profile_first_line(paragraph, profile)
        if profile["alignment"] == "justify":
            paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    return paragraph


def _prefix_removals(records, profile, name, instructor, course, date_str, title, affiliation, last_name, selected, core):
    blocks, ids = [], []
    for record in records:
        if record["id"] is None:
            break
        paragraph = record["paragraph"]
        if not _is_plain_sortable(record["element"], paragraph):
            break
        segments = core._normalize_segments(core._docx_paragraph_segments(paragraph))
        if segments:
            blocks.append((segments, 0))
            ids.append(record["id"])
    removed = core._strip_profile_front_matter(blocks, profile, name, instructor, course,
                                              date_str, title, affiliation, last_name)
    matches = set(ids[:removed])
    return set() if selected.intersection(matches) else matches


def _page_break_before(paragraph):
    """Resolve an explicit or inherited paragraph page break."""
    value = paragraph.paragraph_format.page_break_before
    style, seen = paragraph.style, set()
    while value is None and style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        value = style.paragraph_format.page_break_before
        style = style.base_style
    return bool(value)


def _edge_page_break(element, *, first=False):
    """Recognize a hard break at the visible start/end of a paragraph."""
    if element.tag != _P:
        return False
    content_tags = {qn(tag) for tag in (
        "w:br", "w:cr", "w:tab", "w:sym", "w:drawing", "w:pict", "w:object",
        "w:footnoteReference", "w:endnoteReference", "w:fldChar", "m:oMath",
    )}
    boundary = None
    for node in element.iter():
        if node.tag in content_tags or (node.tag in _TEXT_TAGS and (node.text or "").strip()):
            boundary = node
            if first:
                break
    return (boundary is not None and boundary.tag == qn("w:br")
            and boundary.get(qn("w:type")) == "page")


def _separate_preserved_reference_title(output_nodes, element, source, normal_id):
    """Keep a selected title's XML intact while placing references on a new page."""
    if _page_break_before(Paragraph(element, source._body)) or _edge_page_break(element, first=True):
        return
    if output_nodes:
        previous = output_nodes[-1]
        if (_edge_page_break(previous) or (previous.tag == _P and not _has_content(previous)
                and _page_break_before(Paragraph(previous, source._body)))):
            return
    control = OxmlElement("w:p")
    control.style = normal_id
    paragraph = Paragraph(control, source._body)
    paragraph.paragraph_format.space_before = paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = Pt(1)
    run = paragraph.add_run()
    run.font.size = Pt(1)
    page_break = OxmlElement("w:br")
    page_break.set(qn("w:type"), "page")
    run._r.append(page_break)
    output_nodes.append(control)


def convert_docx_draft(input_path, output, name, instructor, course, date_str, title,
                       last_name_override=None, txt_paragraph_mode="blank_line",
                       enable_heading_detection=False, enable_block_quote=False,
                       markdown_emphasis=True, strip_existing_heading=True, *,
                       profile, preserve_paragraphs=None, source_fingerprint=None, affiliation=""):
    """Format a DOCX package while retaining body objects and selected paragraph XML.

    Source section layout is replaced by the selected global page layout. Source
    headers/footers are replaced by the configured page-number scheme.
    """
    import mla_formatter as core

    core._ensure_distinct_output(input_path, output)
    source, fingerprint = _load_docx(input_path)
    records, paragraph_count = [], 0
    for element in source.element.body:
        if element.tag == _SECT:
            continue
        if element.tag == _P:
            paragraph_count += 1
            if paragraph_count > MAX_BODY_PARAGRAPHS:
                raise ValueError("unsupported_document")
            paragraph = Paragraph(element, source._body)
            segments = core._docx_paragraph_segments(paragraph)
            records.append({"id": paragraph_count, "element": element, "paragraph": paragraph,
                            "text": core._plain(segments).strip()})
        else:
            records.append({"id": None, "element": element, "paragraph": None, "text": ""})
    selected = _validate_preserved(preserve_paragraphs, paragraph_count, source_fingerprint, fingerprint)
    removals = set()
    if strip_existing_heading:
        removals = _prefix_removals(records, profile, name, instructor, course, date_str, title,
                                    affiliation, core.extract_last_name(name, last_name_override), selected, core)
    if profile["format_id"] == "mla":
        generated = core._new_mla_document(name, instructor, course, date_str, title, last_name_override)
    else:
        generated = core._new_profile_document(profile, name, instructor, course, date_str, title,
                                                last_name_override, affiliation)
    mapping, normal_id = _import_generated_styles(source, generated, profile)
    output_nodes = []
    final_section = None
    for element in generated.element.body:
        clone = deepcopy(element)
        if clone.tag == _SECT:
            final_section = clone
        else:
            _remap_generated(clone, mapping, normal_id)
            output_nodes.append(clone)
    in_references, references_finished = False, False
    reference_records, reference_start, body_count, unsupported_headings = [], None, 0, 0
    generated_reference_label = None
    for record in records:
        if record["id"] in removals:
            continue
        original_element, paragraph, plain = record["element"], record["paragraph"], record["text"]
        element = deepcopy(original_element)
        _remove_source_sections(element)
        if paragraph is None:
            output_nodes.append(element)
            if in_references:
                reference_records.append((record, element, False))
            continue
        is_selected = record["id"] in selected
        level = core._paragraph_heading_level(paragraph)
        is_reference_label = bool(plain and core._profile_reference_title(plain, profile))
        if is_reference_label and not in_references and not references_finished:
            in_references = True
            if not is_selected and _is_plain_sortable(original_element, paragraph):
                label = profile["references_title"]
                if profile["format_id"] == "mla":
                    match = core._WORKS_CITED_RE.match(plain)
                    label = core._works_cited_title(match.group(1)) if match else label
                temporary = core._add_profile_paragraph(generated, [core._seg(label)], profile, role="reference_title")
                element = deepcopy(temporary._p)
                _remap_generated(element, mapping, normal_id)
                Paragraph(element, source._body).paragraph_format.page_break_before = True
                generated_reference_label = (label, element)
            elif not is_selected:
                _format_existing(element, paragraph, source, profile, mapping, core, role="reference_title")
            else:
                _separate_preserved_reference_title(output_nodes, element, source, normal_id)
            reference_start = len(output_nodes) + 1
            output_nodes.append(element)
            continue
        if in_references and level:
            in_references, references_finished = False, True
        role = "reference" if in_references else "body"
        if not is_selected:
            simple_text = _normalize_text_xml(element)
            unsupported_level = level > 3
            if unsupported_level:
                unsupported_headings += 1
                level = 0
            elif profile["format_id"] == "mla":
                level = 0
            if role == "body" and enable_block_quote and plain.startswith(">"):
                role, level = "block", 0
                if simple_text:
                    _strip_xml_block_marker(element)
            elif (role == "body" and not level and not unsupported_level and enable_heading_detection
                  and core.is_likely_heading(plain)):
                level = 1
            # Image-only paragraphs retain their placement and paragraph style.
            if plain or not _has_images(original_element):
                _format_existing(element, paragraph, source, profile, mapping, core,
                                  role=role, heading_level=level if role == "body" else 0)
        output_nodes.append(element)
        if in_references:
            reference_records.append((record, element,
                                      not is_selected and _is_plain_sortable(original_element, paragraph)))
        elif _has_content(original_element):
            body_count += 1
    reference_count = sum(1 for record, _element, _safe in reference_records
                          if record["id"] is not None and record["text"])
    if (profile["format_id"] == "mla" and reference_count == 1
            and generated_reference_label is not None and generated_reference_label[0] == "Works Cited"):
        label_element = generated_reference_label[1]
        next(label_element.iter(qn("w:t"))).text = "Work Cited"
    sort_skipped = 0
    if reference_start is not None and reference_records and profile["sort_references"]:
        key = core._wc_sort_key if profile["format_id"] == "mla" else core._reference_sort_key
        run_start = 0
        while run_start < len(reference_records):
            record, _element, safe = reference_records[run_start]
            if not safe or not record["text"]:
                sort_skipped = 1
                run_start += 1
                continue
            run_end = run_start + 1
            while run_end < len(reference_records):
                following, _following_element, following_safe = reference_records[run_end]
                if not following_safe or not following["text"]:
                    break
                run_end += 1
            ordered = sorted(reference_records[run_start:run_end],
                             key=lambda item: key([core._seg(item[0]["text"])]))
            output_nodes[reference_start + run_start:reference_start + run_end] = [element for _record, element, _safe in ordered]
            run_start = run_end
    # Neither source nor generated header rIds may be copied between packages.
    # Body-object rIds still belong to the original source package and remain valid.
    if final_section is None:
        raise ValueError("Missing output page layout")
    output_nodes.append(final_section)
    for element in output_nodes:
        for section in element.iter(_SECT):
            for reference in list(section):
                if reference.tag in (qn("w:headerReference"), qn("w:footerReference")):
                    section.remove(reference)
    original_body = source.element.body
    for element in list(original_body):
        original_body.remove(element)
    for element in output_nodes:
        original_body.append(element)
    core._configure_page_numbers(source, profile, name, last_name_override,
                                 header_style_id=mapping.get("Header"))
    for section in source.sections:
        for reference in section._sectPr:
            if reference.tag in (qn("w:headerReference"), qn("w:footerReference")):
                part = source.part.related_parts.get(reference.get(qn("r:id")))
                if part is not None:
                    _remap_generated(part._element, mapping, normal_id)
    core._save_document(source, output)
    image_count = sum(1 for node in source.element.body.iter()
                      if node.tag in _IMAGE_TAGS)
    table_count = sum(1 for node in source.element.body.iter(qn("w:tbl")))
    return {"body": body_count, "works_cited": reference_count, "removed_heading_lines": len(removals),
            "preserved_paragraphs": len(selected), "retained_images": image_count,
            "retained_tables": table_count, "omitted_elements": 0,
            "unsupported_headings": unsupported_headings, "reference_sort_skipped": sort_skipped}
