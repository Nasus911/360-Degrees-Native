import hashlib
from pathlib import Path
from urllib.request import urlretrieve


MODELS = {
    "face_detection_yunet_2023mar.onnx": {
        "url": (
            "https://github.com/opencv/opencv_zoo/raw/refs/heads/main/"
            "models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        ),
        "sha256": "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    },
    "face_recognition_sface_2021dec.onnx": {
        "url": (
            "https://github.com/opencv/opencv_zoo/raw/refs/heads/main/"
            "models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
        ),
        "sha256": "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    },
}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model(path: Path, expected_sha256: str) -> None:
    if file_sha256(path) != expected_sha256:
        raise RuntimeError(f"SHA-256 verification failed for {path.name}.")


def main() -> None:
    model_dir = Path(__file__).parent / "models"
    model_dir.mkdir(exist_ok=True)
    for filename, model in MODELS.items():
        target = model_dir / filename
        if target.exists():
            verify_model(target, model["sha256"])
            print(f"Verified existing model: {target}")
            continue
        temporary = model_dir / f"{filename}.download"
        print(f"Downloading {filename} from the OpenCV Zoo...")
        try:
            urlretrieve(model["url"], temporary)
            verify_model(temporary, model["sha256"])
            temporary.replace(target)
        finally:
            if temporary.exists():
                temporary.unlink()
        print(f"Saved and verified {target}")


if __name__ == "__main__":
    main()
