import json
import re
import unicodedata
from pathlib import Path

import fitz


SOURCE = Path("attached_assets/PAGINA_WEB_Y_BOTS_1789521708795.pdf")
OUTPUT = Path(".agents/outputs/pdf-faq-catalog.json")

SECTIONS = [
    ("toxina-botulinica", "TOXINA BOTULÍNICA (BOTOX) — PREGUNTAS FRECUENTES"),
    ("bioestimuladores", "BIOESTIMULADORES — PREGUNTAS FRECUENTES"),
    ("pdrn-salmon", "*PDRN SALMON"),
    ("skinbooster", "SKINBOOSTER — PREGUNTAS FRECUENTES"),
    ("nctf-revitalizante", "NCTF REVITALIZANTE — PREGUNTAS FRECUENTES"),
    ("mesoterapia-capilar", "MESOTERAPIA CAPILAR — PREGUNTAS FRECUENTES"),
]


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFD", value)
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return re.sub(r"\W+", " ", value.lower()).strip()


def clean_answer(lines: list[str]) -> str:
    value = " ".join(line.strip() for line in lines if line.strip())
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"(?<=\w)- (?=\w)", "", value)
    value = value.replace("*", "").strip()
    return value


document = fitz.open(SOURCE)
lines = [
    line.strip()
    for page in document
    for line in page.get_text().splitlines()
    if line.strip()
]

section_positions = []
for slug, heading in SECTIONS:
    section_positions.append((lines.index(heading), slug))
section_positions.append((lines.index("INFORMACION PARA SERVICIOS DE LA PAGINA WEB"), "end"))

catalog = []
for section_index in range(len(SECTIONS)):
    start, slug = section_positions[section_index]
    end, _ = section_positions[section_index + 1]
    section_lines = lines[start + 1 : end]
    current_question = None
    current_answer: list[str] = []

    def flush() -> None:
        global current_question, current_answer
        if current_question:
            answer = clean_answer(current_answer)
            if answer:
                catalog.append(
                    {
                        "serviceSlug": slug,
                        "question": current_question,
                        "answer": answer,
                    }
                )
        current_question = None
        current_answer = []

    for line in section_lines:
        numbered = re.match(r"^\d+\.\s*(.+)$", line)
        custom = re.match(r"^-\s*(.+)$", line)
        candidate = numbered.group(1) if numbered else custom.group(1) if custom else None
        is_question = candidate is not None and (
            "?" in candidate
            or candidate.upper() == candidate
            or candidate.startswith("¿")
        )
        if is_question:
            flush()
            if "?" in candidate:
                question, trailing = candidate.split("?", 1)
                current_question = f"{question.strip()}?"
                if trailing.strip():
                    current_answer.append(trailing.strip())
            else:
                current_question = candidate.strip().rstrip("?") + "?"
        elif current_question:
            current_answer.append(line)
    flush()

deduplicated = []
seen = set()
for item in catalog:
    key = (item["serviceSlug"], normalize(item["question"]))
    if key not in seen:
        seen.add(key)
        deduplicated.append(item)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    json.dumps(deduplicated, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

counts = {
    slug: sum(1 for item in deduplicated if item["serviceSlug"] == slug)
    for slug, _ in SECTIONS
}
print(json.dumps({"total": len(deduplicated), "counts": counts}, ensure_ascii=False))