# Resume imports

Supported uploads (up to 5 MB): PDF, DOC, DOCX, ODT, RTF, HTML/HTM, TXT,
Markdown, CSV, JSON text, LaTeX, PNG, JPG/JPEG, and WebP. Files must contain
readable resume content; accepting an extension does not make corrupt,
encrypted, or unrelated files readable.

OfficeParser extracts document text, Word Extractor reads legacy DOC, and
Tesseract reads images/scanned PDFs. OCR currently uses English language data,
downloaded on first use. The server must have outbound access to the Tesseract
language-data source. HTML is parsed into text without running embedded scripts;
Word macros are not executed. The original uploaded file is not retained.

The default structured importer transcribes explicit fields and sections into
editable profile suggestions. Missing or ambiguous values stay blank. Source text
is stored with the structured record so students can review their import.

Resume import no longer requires an Anthropic key. To enable optional AI
enrichment, set `RESUME_AI_ENABLED=1` and supply a valid `ANTHROPIC_API_KEY`.
Provider failures fall back to the local importer and do not expose API errors
or request identifiers to students. This switch does not repair credentials
for other AI tools.

Verification includes generated PDF/DOCX/ODT/RTF documents, script-containing
HTML, plain text, corrupt documents, and OCR of a synthetic resume image and
image-only PDF. Authenticated browser checks also uploaded real HTML, Word,
and PDF bytes, confirmed database records, and confirmed profile autofill.
