"""Keep python-docx's source directories and document templates in POSIX bundles.

python-docx opens headers through parts/../templates. POSIX path traversal needs
the parts directory to exist, even when its Python modules live in the PYZ.
"""

from PyInstaller.utils.hooks import collect_data_files

datas = collect_data_files("docx")
module_collection_mode = "pyz+py"
