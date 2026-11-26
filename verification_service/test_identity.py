import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import cv2
import numpy as np

from identity import (
    _read_pcn_from_image,
    compare_face_features,
    configure_tesseract,
    decode_image,
    extract_id_fields,
    find_single_face,
    image_quality_issues,
    parse_national_id_text,
)


class NationalIdParserTests(unittest.TestCase):
    def test_tesseract_is_discovered_from_path(self):
        pytesseract = SimpleNamespace(pytesseract=SimpleNamespace())
        with patch.dict(os.environ, {"TESSERACT_CMD": ""}):
            with patch("identity.shutil.which", return_value=r"C:\tools\tesseract.exe"):
                command = configure_tesseract(pytesseract)

        self.assertEqual(command, r"C:\tools\tesseract.exe")
        self.assertEqual(pytesseract.pytesseract.tesseract_cmd, command)

    def test_invalid_tesseract_override_is_reported(self):
        pytesseract = SimpleNamespace(pytesseract=SimpleNamespace())
        with patch.dict(os.environ, {"TESSERACT_CMD": r"C:\missing\tesseract.exe"}):
            with self.assertRaisesRegex(FileNotFoundError, "TESSERACT_CMD"):
                configure_tesseract(pytesseract)

    def test_extracts_labeled_fields_and_ignores_expiration(self):
        result = parse_national_id_text(
            """
            FULL NAME: SAMPLE PERSON
            DATE OF BIRTH: 2000-01-02
            ADDRESS: 123 SAMPLE STREET, LIPA CITY
            PCN: 1234-5678-9012-3456
            """
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["fields"]["full_name"], "SAMPLE PERSON")
        self.assertEqual(result["fields"]["date_of_birth"], "2000-01-02")
        self.assertEqual(result["fields"]["id_number"], "1234567890123456")
        self.assertIsNone(result["fields"]["expiration_date"])

    def test_missing_required_fields_fails_scan(self):
        result = parse_national_id_text("FULL NAME: SAMPLE PERSON")
        self.assertFalse(result["passed"])
        self.assertEqual(
            set(result["issues"]),
            {
                "Could not read date of birth. Retake the ID photo or check the field.",
                "Could not read address. Retake the ID photo or check the field.",
                "Could not read id number. Retake the ID photo or check the field.",
            },
        )

    def test_reads_bilingual_name_parts_and_labels(self):
        result = parse_national_id_text(
            """
            GIVEN NAMES / MGA PANGALAN: SAMPLE
            MIDDLE NAME: TEST
            SURNAME / APELYIDO: PERSON
            DATE OF BIRTH / PETSA NG KAPANGANAKAN: 02/01/2000
            ADDRESS / TIRAHAN: SAMPLE STREET, LIPA CITY
            PCN / CARD NUMBER: 1234-5678-9012-3456
            """
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["fields"]["full_name"], "SAMPLE TEST PERSON")
        self.assertEqual(result["fields"]["date_of_birth"], "2000-02-01")

    def test_reads_tagalog_date_and_address_labels(self):
        result = parse_national_id_text(
            """
            PANGALAN: SAMPLE PERSON
            PETSA NG KAPANGANAKAN: 2000-01-02
            TIRAHAN: SAMPLE STREET, LIPA CITY
            PCN: 1234567890123456
            """
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["fields"]["date_of_birth"], "2000-01-02")

    def test_reads_realistic_dot_separated_national_id_labels(self):
        result = parse_national_id_text(
            """
            4357-2685-9736-5348
            APELYIDO. LAST NAME
            RAFAELES
            MGA PANGALAN. GIVEN NAMES
            MARCO
            GITNANG APELYIDO MIDOLE NAME
            TOLENTINO
            PETSA NG KAPANGANAKAN DATE OF BIRTH
            February 05, 2006
            TIRAHAN ADDRI
            PUROK 6, INOSLOBAN, CITY OF LIPA, BATANGAS
            PHILIPPINES, 4217
            """
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["fields"]["full_name"], "MARCO TOLENTINO RAFAELES")
        self.assertEqual(result["fields"]["date_of_birth"], "2006-02-05")
        self.assertEqual(result["fields"]["id_number"], "4357268597365348")

    def test_face_decision_uses_documented_demo_threshold(self):
        self.assertFalse(compare_face_features(0.362))
        self.assertTrue(compare_face_features(0.363))

    def test_invalid_images_and_missing_or_multiple_faces_are_rejected(self):
        with self.assertRaises(ValueError):
            decode_image(b"")

        class FakeDetector:
            def __init__(self, faces):
                self.faces = faces

            def setInputSize(self, size):
                self.size = size

            def detect(self, image):
                return None, self.faces

        image = np.zeros((300, 400, 3), dtype=np.uint8)
        face = np.ones(15)
        self.assertIn("No face", find_single_face(image, FakeDetector(None))[1])
        self.assertIn(
            "More than one",
            find_single_face(image, FakeDetector(np.array([face, face])))[1],
        )

    def test_large_id_images_are_downscaled_before_ocr(self):
        image = np.zeros((3000, 4000, 3), dtype=np.uint8)
        success, encoded = cv2.imencode(".jpg", image)
        self.assertTrue(success)

        decoded = decode_image(encoded.tobytes())

        self.assertEqual(decoded.shape[:2], (1800, 2400))

    def test_ocr_selects_complete_candidate_with_the_highest_confidence(self):
        image = np.full((800, 1200, 3), 255, dtype=np.uint8)
        quality_warning = "The image looks blurry. Retake it with the ID in focus."
        complete_text = (
            "FULL NAME: SAMPLE PERSON\n"
            "DATE OF BIRTH: 2000-01-02\n"
            "ADDRESS: SAMPLE STREET, LIPA CITY\n"
            "PCN: 1254-5678-9012-3456"
        )
        lower_confidence_text = complete_text.replace("SAMPLE PERSON", "WRONG PERSON")

        def make_data(text, confidence):
            lines = text.splitlines()
            return {
                "text": lines,
                "conf": [str(confidence)] * len(lines),
                "page_num": [1] * len(lines),
                "block_num": [1] * len(lines),
                "par_num": [1] * len(lines),
                "line_num": list(range(1, len(lines) + 1)),
            }

        pytesseract = SimpleNamespace(
            Output=SimpleNamespace(DICT=object()),
            image_to_data=Mock(side_effect=[
                make_data(lower_confidence_text, 50),
                make_data(complete_text, 90),
                make_data("FULL NAME: PARTIAL PERSON", 99),
                make_data("FULL NAME: PARTIAL PERSON", 99),
            ]),
        )
        with patch.dict(sys.modules, {"pytesseract": pytesseract}):
            with patch("identity.configure_tesseract"):
                with patch("identity.image_quality_issues", return_value=[quality_warning]):
                    with patch("identity._read_pcn_from_image") as read_pcn:
                        read_pcn.return_value = "1234567890123456"
                        result = extract_id_fields(image)

        self.assertTrue(result["passed"])
        self.assertIn(quality_warning, result["issues"])
        self.assertEqual(result["fields"]["full_name"], "SAMPLE PERSON")
        self.assertEqual(result["fields"]["id_number"], "1234567890123456")
        self.assertEqual(pytesseract.image_to_data.call_count, 4)
        read_pcn.assert_called_once()

    def test_quality_warning_does_not_discard_partially_read_fields(self):
        image = np.full((800, 1200, 3), 255, dtype=np.uint8)
        lines = ["FULL NAME: SAMPLE PERSON"]
        pytesseract = SimpleNamespace(
            Output=SimpleNamespace(DICT=object()),
            image_to_data=Mock(return_value={
                "text": lines,
                "conf": ["90"],
                "page_num": [1],
                "block_num": [1],
                "par_num": [1],
                "line_num": [1],
            }),
        )
        quality_warning = "The image looks blurry. Retake it with the ID in focus."
        with patch.dict(sys.modules, {"pytesseract": pytesseract}):
            with patch("identity.configure_tesseract"):
                with patch("identity.image_quality_issues", return_value=[quality_warning]):
                    with patch("identity._read_pcn_from_image", return_value=None):
                        result = extract_id_fields(image)

        self.assertEqual(result["fields"]["full_name"], "SAMPLE PERSON")
        self.assertFalse(result["passed"])
        self.assertIn(quality_warning, result["issues"])

    def test_large_face_capture_is_downscaled_and_coordinates_restored(self):
        class FakeDetector:
            def setInputSize(self, size):
                self.size = size

            def detect(self, image):
                self.detected_shape = image.shape[:2]
                return None, np.arange(15, dtype=np.float32).reshape(1, 15)

        detector = FakeDetector()
        image = np.zeros((2160, 3840, 3), dtype=np.uint8)
        face, issue = find_single_face(image, detector)

        self.assertIsNone(issue)
        self.assertEqual(detector.size, (1920, 1080))
        self.assertEqual(detector.detected_shape, (1080, 1920))
        np.testing.assert_array_equal(face[:14], np.arange(14) * 2)
        self.assertEqual(face[14], 14)

    def test_bright_document_background_is_not_rejected_as_overexposed(self):
        image = np.full((900, 1400, 3), 255, dtype=np.uint8)
        cv2.putText(
            image,
            "FULL NAME: SAMPLE PERSON",
            (80, 150),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.5,
            (0, 0, 0),
            3,
            cv2.LINE_AA,
        )

        self.assertNotIn(
            "The image is overexposed. Reduce glare and try again.",
            image_quality_issues(image),
        )

    def test_uniform_white_image_is_rejected_as_overexposed(self):
        image = np.full((300, 400, 3), 255, dtype=np.uint8)

        self.assertIn(
            "The image is overexposed. Reduce glare and try again.",
            image_quality_issues(image),
        )

    def test_pcn_is_reread_from_its_labeled_row_with_digit_whitelist(self):
        data = {
            "text": ["PCN:", "1234-�5678�-9012�35456"],
            "page_num": [1, 1],
            "block_num": [1, 1],
            "par_num": [1, 1],
            "line_num": [1, 1],
            "left": [10, 70],
            "top": [20, 20],
            "width": [50, 180],
            "height": [20, 20],
        }
        pytesseract = SimpleNamespace(
            Output=SimpleNamespace(DICT=object()),
            image_to_data=Mock(return_value=data),
            image_to_string=Mock(return_value="1234-5678-9012-3456"),
        )

        result = _read_pcn_from_image(np.zeros((100, 300), dtype=np.uint8), pytesseract)

        self.assertEqual(result, "1234567890123456")
        self.assertIn(
            "tessedit_char_whitelist=0123456789-",
            pytesseract.image_to_string.call_args.kwargs["config"],
        )


if __name__ == "__main__":
    unittest.main()
