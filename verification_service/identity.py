import os
import re
import shutil
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np


DOCUMENT_TYPE = "philippine_national_id"
REQUIRED_FIELDS = ("full_name", "date_of_birth", "address", "id_number")
FACE_MATCH_THRESHOLD = 0.363
MAX_IMAGE_PIXELS = 20_000_000


def configure_tesseract(pytesseract) -> str:
    configured_path = os.getenv("TESSERACT_CMD")
    if configured_path:
        executable = Path(configured_path).expanduser()
        if not executable.is_file():
            raise FileNotFoundError(
                f"TESSERACT_CMD does not point to an executable: {configured_path}"
            )
        command = str(executable)
    else:
        command = shutil.which("tesseract")
        if not command and os.name == "nt":
            program_files = (
                os.getenv("ProgramFiles", r"C:\Program Files"),
                os.getenv("ProgramFiles(x86)"),
            )
            for root in program_files:
                if not root:
                    continue
                candidate = Path(root) / "Tesseract-OCR" / "tesseract.exe"
                if candidate.is_file():
                    command = str(candidate)
                    break
        if not command:
            raise FileNotFoundError(
                "Tesseract was not found. Install it or set TESSERACT_CMD."
            )

    pytesseract.pytesseract.tesseract_cmd = command
    return command


FIELD_LABELS = {
    "full_name": re.compile(r"^(?:FULL\s+NAME|NAME)(?:\s*/[^:]*)?\s*[:\-]?\s*(.*)$", re.I),
    "date_of_birth": re.compile(
        r"^(?:DATE\s+OF\s+BIRTH|BIRTH\s+DATE|DOB|PETSA\s+NG\s+KAPANGANAKAN)"
        r"(?:\s*[/.:-][^:]*)?\s*[:\-]?\s*(.*)$",
        re.I,
    ),
    "address": re.compile(
        r"^(?:ADDRESS|RESIDENCE|TIRAHAN|ADDRES[ S]?)(?:\s*[/.:-][^:]*)?\s*[:\-]?\s*(.*)$", re.I
    ),
    "id_number": re.compile(
        r"^(?:PCN|PHILSYS(?:\s+CARD)?\s+NUMBER|ID\s+(?:NO\.?|NUMBER))"
        r"(?:\s*/[^:]*)?\s*[:\-]?\s*(.*)$",
        re.I,
    ),
}
NAME_PART_LABELS = {
    "surname": re.compile(
        r"^(?:SURNAME|LAST\s+NAME|APELYIDO)(?:\s*[/.:-][^:]*)?\s*[:\-]?\s*(.*)$", re.I
    ),
    "given": re.compile(
        r"^(?:GIVEN\s+NAMES|GIVEN\s+NAME|FIRST\s+NAME|MGA\s+PANGALAN|PANGALAN)"
        r"(?:\s*[/.:-][^:]*)?\s*[:\-]?\s*(.*)$",
        re.I,
    ),
    "middle": re.compile(
        r"^(?:MIDDLE\s+NAME|GITNANG\s+APELYIDO)(?:\s*[/.:-][^:]*)?\s*[:\-]?\s*(.*)$",
        re.I,
    ),
}
ANY_FIELD_LABEL = re.compile(
    r"^(?:FULL\s+NAME|NAME|SURNAME|LAST\s+NAME|APELYIDO|GIVEN\s+NAME|FIRST\s+NAME|"
    r"GIVEN\s+NAMES|MGA\s+PANGALAN|PANGALAN|MIDDLE\s+NAME|GITNANG\s+APELYIDO|"
    r"DATE\s+OF\s+BIRTH|BIRTH\s+DATE|DOB|PETSA\s+NG\s+KAPANGANAKAN|"
    r"ADDRESS|RESIDENCE|TIRAHAN|PCN|PHILSYS(?:\s+CARD)?\s+NUMBER|ID\s+(?:NO\.?|NUMBER))\b",
    re.I,
)


def decode_image(image_bytes: bytes) -> np.ndarray:
    if not image_bytes:
        raise ValueError("The uploaded image is empty. Choose a JPG or PNG image.")
    try:
        image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    except cv2.error as error:
        raise ValueError("The image could not be opened. Upload a clear JPG or PNG.") from error
    if image is None:
        raise ValueError("The image could not be opened. Upload a clear JPG or PNG.")
    height, width = image.shape[:2]
    if width < 300 or height < 200:
        raise ValueError("The image is too small. Upload a higher-resolution image.")
    if width * height > MAX_IMAGE_PIXELS:
        raise ValueError("The image is too large to process. Resize it and try again.")
    return image


def image_quality_issues(image: np.ndarray) -> list[str]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    issues = []
    if cv2.Laplacian(gray, cv2.CV_64F).var() < 35:
        issues.append("The image looks blurry. Retake it with the ID in focus.")
    brightness = float(np.mean(gray))
    if brightness < 38:
        issues.append("The image is too dark. Improve the lighting and try again.")
    elif brightness > 250 and float(np.std(gray)) < 5:
        issues.append("The image is overexposed. Reduce glare and try again.")
    return issues


def _clean_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" \t:;,-")


def _read_labeled_value(lines: list[str], index: int, inline: str) -> str:
    noise_inline = {
        "ADDRESS", "ADDRE", "ADDRES", "ADDRI", "NAME", "GIVEN NAMES",
        "MGA PANGALAN", "MIDDLE NAME", "MIDOLE NAME", "LAST NAME",
        "SURNAME", "APELYIDO", "DATE OF BIRTH", "PETSA NG KAPANGANAKAN",
        "DIGITAL ID NUMBER",
    }
    inline_value = _clean_value(inline)
    values = [inline_value] if inline_value.upper() not in noise_inline else []
    for line in lines[index + 1 :]:
        if ANY_FIELD_LABEL.match(line):
            break
        candidate = _clean_value(line)
        if candidate:
            values.append(candidate)
        if len(values) >= 3:
            break
    return " ".join(values)


def _read_name_part_value(lines: list[str], index: int, inline: str) -> str:
    label_noise = re.compile(
        r"^(?:NAME|FULL\s+NAME|SURNAME|LAST\s+NAME|APELYIDO|GIVEN\s+NAMES?|"
        r"FIRST\s+NAME|MGA\s+PANGALAN|PANGALAN|MIDDLE\s+NAME|MIDOLE\s+NAME|"
        r"GITNANG\s+APELYIDO)\b",
        re.I,
    )
    inline_value = _clean_value(inline)
    if inline_value and not label_noise.match(inline_value) and not inline_value.isdigit():
        return inline_value[:160]
    for line in lines[index + 1 :]:
        if ANY_FIELD_LABEL.match(line):
            break
        candidate = _clean_value(line)
        if candidate and not candidate.isdigit() and not label_noise.match(candidate):
            return candidate[:160]
    return ""


def _normalize_date(value: str) -> str | None:
    candidate = _clean_value(value)
    for fmt in (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%m-%d-%Y",
        "%d-%m-%Y",
        "%d %b %Y",
        "%d %B %Y",
        "%b %d, %Y",
        "%B %d, %Y",
    ):
        try:
            return datetime.strptime(candidate, fmt).date().isoformat()
        except ValueError:
            continue
    month_match = re.search(
        r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+\d{1,2},?\s+\d{4}\b",
        candidate,
        re.I,
    )
    if month_match:
        month_value = month_match.group(0).replace(",", "")
        for fmt in ("%B %d %Y", "%b %d %Y"):
            try:
                return datetime.strptime(month_value, fmt).date().isoformat()
            except ValueError:
                continue
    iso_match = re.search(r"\b\d{4}-\d{1,2}-\d{1,2}\b", candidate)
    if iso_match:
        try:
            return datetime.strptime(iso_match.group(0), "%Y-%m-%d").date().isoformat()
        except ValueError:
            pass
    return None


def parse_national_id_text(text: str) -> dict:
    lines = [_clean_value(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    found = {}
    name_parts = {}
    for index, line in enumerate(lines):
        for field, pattern in NAME_PART_LABELS.items():
            match = pattern.match(line)
            if match:
                inline = match.group(1)
                if ":" in line:
                    inline = line.rsplit(":", 1)[1]
                name_parts[field] = _read_name_part_value(lines, index, inline)
                break
        for field, pattern in FIELD_LABELS.items():
            match = pattern.match(line)
            if match:
                inline = match.group(1)
                if ":" in line:
                    inline = line.rsplit(":", 1)[1]
                found[field] = _read_labeled_value(lines, index, inline)
                break

    if not found.get("full_name") and name_parts:
        found["full_name"] = " ".join(
            name_parts[key] for key in ("given", "middle", "surname") if name_parts.get(key)
        )
    date_of_birth = _normalize_date(found.get("date_of_birth", ""))
    if not date_of_birth:
        date_of_birth = _normalize_date(text)
    id_digits = re.sub(r"\D", "", found.get("id_number", ""))
    if not id_digits:
        candidates = re.findall(r"(?<!\d)(?:\d[\d\s-]{10,}\d)(?!\d)", text)
        for candidate in candidates:
            digits = re.sub(r"\D", "", candidate)
            if 12 <= len(digits) <= 16:
                id_digits = digits
                break
    fields = {
        "full_name": found.get("full_name", "")[:160] or None,
        "date_of_birth": date_of_birth,
        "address": found.get("address", "")[:300] or None,
        "id_number": id_digits if 12 <= len(id_digits) <= 16 else None,
        "expiration_date": None,
    }
    missing = [field for field in REQUIRED_FIELDS if not fields[field]]
    issues = [
        f"Could not read {field.replace('_', ' ')}. Retake the ID photo or check the field."
        for field in missing
    ]
    return {"fields": fields, "issues": issues, "passed": not missing}


def _read_pcn_from_image(image: np.ndarray, pytesseract) -> str | None:
    data = pytesseract.image_to_data(
        image,
        lang="eng",
        config="--psm 6",
        output_type=pytesseract.Output.DICT,
    )
    lines = {}
    for index, value in enumerate(data["text"]):
        if not value.strip():
            continue
        key = (
            data["page_num"][index],
            data["block_num"][index],
            data["par_num"][index],
            data["line_num"][index],
        )
        lines.setdefault(key, []).append(index)

    for indexes in lines.values():
        label_indexes = [
            index
            for index in indexes
            if re.sub(r"\W", "", data["text"][index].upper()).startswith("PCN")
        ]
        if not label_indexes:
            continue
        label_right = max(
            data["left"][index] + data["width"][index] for index in label_indexes
        )
        value_indexes = [
            index
            for index in indexes
            if data["left"][index] >= label_right
        ]
        if not value_indexes:
            continue
        x1 = max(data["left"][index] + data["width"][index] for index in value_indexes)
        y0 = min(data["top"][index] for index in indexes)
        y1 = max(data["top"][index] + data["height"][index] for index in indexes)
        crop = image[max(0, y0 - 8) : y1 + 8, max(0, label_right - 4) : x1 + 8]
        if crop.size == 0:
            continue
        text = pytesseract.image_to_string(
            crop,
            lang="eng",
            config="--psm 7 -c tessedit_char_whitelist=0123456789-",
        )
        digits = re.sub(r"\D", "", text)
        if 12 <= len(digits) <= 16:
            return digits
    return None


def extract_id_fields(image: np.ndarray) -> dict:
    import pytesseract

    configure_tesseract(pytesseract)
    quality_issues = image_quality_issues(image)
    if quality_issues:
        return {"fields": None, "issues": quality_issues, "passed": False}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if min(gray.shape[:2]) < 500:
        gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    prepared = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )[1]
    text_11 = pytesseract.image_to_string(prepared, lang="eng", config="--psm 11")
    text_6 = pytesseract.image_to_string(prepared, lang="eng", config="--psm 6")
    parsed = parse_national_id_text(text_11)
    fallback = parse_national_id_text(text_6)
    for field in ("full_name", "date_of_birth", "address", "id_number"):
        if not parsed["fields"].get(field) and fallback["fields"].get(field):
            parsed["fields"][field] = fallback["fields"][field]
    missing = [field for field in REQUIRED_FIELDS if not parsed["fields"].get(field)]
    parsed["issues"] = [
        f"Could not read {field.replace('_', ' ')}. Retake the ID photo or check the field."
        for field in missing
    ]
    parsed["passed"] = not missing
    pcn = _read_pcn_from_image(prepared, pytesseract)
    if pcn:
        parsed["fields"]["id_number"] = pcn
        parsed["issues"] = [
            issue
            for issue in parsed["issues"]
            if issue != "Could not read id number. Retake the ID photo or check the field."
        ]
        parsed["passed"] = not parsed["issues"]
    parsed["fields"]["expiration_date"] = None
    return parsed


def find_single_face(image: np.ndarray, detector) -> tuple[np.ndarray | None, str | None]:
    height, width = image.shape[:2]
    scale = min(1.0, 1920 / max(height, width))
    detection_image = image
    if scale < 1:
        detection_image = cv2.resize(
            image,
            (round(width * scale), round(height * scale)),
            interpolation=cv2.INTER_AREA,
        )
    detector.setInputSize((detection_image.shape[1], detection_image.shape[0]))
    _, faces = detector.detect(detection_image)
    count = 0 if faces is None else len(faces)
    if count == 0:
        return None, "No face was detected. Use a clear, front-facing photo."
    if count > 1:
        return None, "More than one face was detected. Make sure only one face is visible."
    face = faces[0].copy()
    if scale < 1:
        face[:14] /= scale
    return face, None


def compare_face_features(similarity: float) -> bool:
    return similarity >= FACE_MATCH_THRESHOLD


def normalized_similarity(face_recognizer, id_image, id_face, selfie_image, selfie_face):
    id_aligned = face_recognizer.alignCrop(id_image, id_face.reshape(1, -1))
    selfie_aligned = face_recognizer.alignCrop(selfie_image, selfie_face.reshape(1, -1))
    id_feature = face_recognizer.feature(id_aligned)
    selfie_feature = face_recognizer.feature(selfie_aligned)
    return float(
        face_recognizer.match(
            id_feature, selfie_feature, cv2.FaceRecognizerSF_FR_COSINE
        )
    )
