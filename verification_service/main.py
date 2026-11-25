from asyncio import gather
import hmac
import os
from functools import lru_cache
from pathlib import Path
from threading import Lock

import cv2
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from identity import (
    DOCUMENT_TYPE,
    compare_face_features,
    configure_tesseract,
    decode_image,
    extract_id_fields,
    find_single_face,
    image_quality_issues,
    normalized_similarity,
)


app = FastAPI(title="Identity Verification Processor", docs_url=None, redoc_url=None)
MAX_IMAGE_BYTES = 12 * 1024 * 1024
FACE_PROCESSING_LOCK = Lock()


class FaceAlignmentError(Exception):
    pass


YUNET_PATH = Path(
    os.getenv(
        "YUNET_MODEL_PATH",
        str(Path(__file__).parent / "models" / "face_detection_yunet_2023mar.onnx"),
    )
)
SFACE_PATH = Path(
    os.getenv(
        "SFACE_MODEL_PATH",
        str(Path(__file__).parent / "models" / "face_recognition_sface_2021dec.onnx"),
    )
)


def require_service_token(token: str | None) -> None:
    expected = os.getenv("VERIFICATION_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Verification service is not configured.")
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")


async def read_image_upload(file: UploadFile) -> bytes:
    content = await file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 12 MB limit.")
    return content


@lru_cache(maxsize=1)
def load_face_models():
    if not YUNET_PATH.is_file() or not SFACE_PATH.is_file():
        raise RuntimeError("Face models are missing. Run download_models.py first.")
    detector = cv2.FaceDetectorYN.create(
        str(YUNET_PATH), "", (320, 320), 0.6, 0.3, 5000
    )
    recognizer = cv2.FaceRecognizerSF.create(str(SFACE_PATH), "")
    return detector, recognizer


def compare_face_images(id_image, selfie_image):
    with FACE_PROCESSING_LOCK:
        detector, recognizer = load_face_models()
        id_face, id_issue = find_single_face(id_image, detector)
        if id_issue:
            return None, id_issue
        selfie_face, selfie_issue = find_single_face(selfie_image, detector)
        if selfie_issue:
            return None, selfie_issue
        try:
            score = normalized_similarity(
                recognizer, id_image, id_face, selfie_image, selfie_face
            )
        except cv2.error as error:
            raise FaceAlignmentError from error
    return score, None


@app.get("/health")
def health():
    return {
        "ok": True,
        "ocr_configured": _tesseract_on_path(),
        "face_models_configured": YUNET_PATH.is_file() and SFACE_PATH.is_file(),
    }


@lru_cache(maxsize=1)
def _tesseract_on_path() -> bool:
    try:
        import pytesseract

        configure_tesseract(pytesseract)
        pytesseract.get_tesseract_version()
        return True
    except (ImportError, OSError, RuntimeError):
        return False


@app.post("/scan-id")
async def scan_id(
    file: UploadFile = File(...),
    document_type: str = "philippine_national_id",
    x_verification_token: str | None = Header(default=None),
):
    require_service_token(x_verification_token)
    if document_type != DOCUMENT_TYPE:
        raise HTTPException(status_code=422, detail="Unsupported ID type.")
    try:
        image_bytes = await read_image_upload(file)
        image = await run_in_threadpool(decode_image, image_bytes)
    except ValueError as error:
        return JSONResponse(
            status_code=200,
            content={"status": "failed", "fields": None, "issues": [str(error)]},
        )

    try:
        result = await run_in_threadpool(extract_id_fields, image)
    except (OSError, RuntimeError) as error:
        raise HTTPException(
            status_code=503,
            detail="OCR is unavailable. Install Tesseract and configure TESSERACT_CMD.",
        ) from error
    return {
        "status": "passed" if result["passed"] else "failed",
        "fields": result["fields"],
        "issues": result["issues"],
    }


@app.post("/match-face")
async def match_face(
    id_document: UploadFile = File(...),
    selfie: UploadFile = File(...),
    x_verification_token: str | None = Header(default=None),
):
    require_service_token(x_verification_token)
    try:
        id_bytes, selfie_bytes = await gather(
            read_image_upload(id_document),
            read_image_upload(selfie),
        )
        id_image, selfie_image = await gather(
            run_in_threadpool(decode_image, id_bytes),
            run_in_threadpool(decode_image, selfie_bytes),
        )
    except ValueError as error:
        return {"status": "failed", "match": False, "score": None, "issues": [str(error)]}

    quality_issues = await run_in_threadpool(image_quality_issues, selfie_image)
    if quality_issues:
        return {
            "status": "failed",
            "match": False,
            "score": None,
            "issues": quality_issues,
        }

    try:
        score, face_issue = await run_in_threadpool(
            compare_face_images, id_image, selfie_image
        )
    except FaceAlignmentError as error:
        raise HTTPException(
            status_code=422, detail="Could not align the faces. Retake the photos."
        ) from error
    except (RuntimeError, cv2.error) as error:
        raise HTTPException(
            status_code=503, detail="Face matching is not configured. Install the models."
        ) from error
    if face_issue:
        return {
            "status": "failed",
            "match": False,
            "score": None,
            "issues": [face_issue],
        }

    matched = compare_face_features(score)
    return {
        "status": "passed" if matched else "failed",
        "match": matched,
        "score": score,
        "issues": [] if matched else ["The faces did not meet the demonstration match threshold."],
    }
