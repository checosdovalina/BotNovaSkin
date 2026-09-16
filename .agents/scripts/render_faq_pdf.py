from pathlib import Path

import fitz


SOURCE = Path("attached_assets/PAGINA_WEB_Y_BOTS_1789521708795.pdf")
OUTPUT = Path(".agents/outputs/faq-pdf")
OUTPUT.mkdir(parents=True, exist_ok=True)

document = fitz.open(SOURCE)
for page_number in [0, 3, 7, 10, 13, 16, 18]:
    page = document[page_number]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pixmap.save(OUTPUT / f"page-{page_number + 1}.png")

print(f"Rendered {7} representative pages from {document.page_count} pages")