# Identity verification demo

This feature supports the Philippine National ID only. OCR and face matching do not prove that an ID is genuine. Use synthetic or explicitly consenting test records; do not use real identity documents in the classroom demonstration.

## Setup

1. Install Tesseract OCR with English language data. On Windows, use the [UB Mannheim Tesseract builds](https://github.com/UB-Mannheim/tesseract/wiki). The processor discovers Tesseract from `PATH` and the standard Windows install location. Set `TESSERACT_CMD` to the executable if it is installed elsewhere.
2. From the repository root, prepare the Python processor:

   ```powershell
   Set-Location verification_service
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe download_models.py
   ```

   The YuNet model directory is MIT licensed; SFace and Tesseract are Apache-2.0 licensed. The downloader verifies the SHA-256 checksums before using either model. Keep the downloaded model files out of source control.
3. Apply `supabase/migrations/015_identity_verification.sql` to your Supabase project (`supabase db push` after linking the project, or use the Supabase SQL Editor).
4. Copy `server/.env.example` to `server/.env`. Configure the Supabase URL, public key, service-role key, and processor URL. Set `IDENTITY_VERIFICATION_TOKEN` to a new random value.
5. In the `verification_service` terminal, set the same token and start the processor:

   ```powershell
   $env:VERIFICATION_SERVICE_TOKEN = 'the-same-random-value-as-server-env'
   .\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001
   ```

   Set `$env:TESSERACT_CMD` before starting the service only if Tesseract is installed outside `PATH` and the standard Windows location.
6. In a separate terminal, start the API and Expo app:

   ```powershell
   Set-Location server
   npm.cmd start
   ```

   ```powershell
   Set-Location client
   Copy-Item .env.example .env
   # Set EXPO_PUBLIC_API_URL and the Supabase public settings in client/.env.
   npx.cmd expo start
   ```

Never put the Supabase service-role key or processor token in the Expo app. For a physical phone, `EXPO_PUBLIC_API_URL` must use the computer’s LAN IP; the Python processor remains on the Node server’s loopback interface.

## Component choices

- Tesseract is used for printed ID text; the Python wrapper does not replace the required native Tesseract executable.
- OpenCV Zoo YuNet and SFace provide one-face detection and one-to-one face comparison. Their model licenses are MIT and Apache-2.0, respectively.
- Ultralytics YOLO is not included because this flow has no ID-specific trained detector weights; adding the AGPL-3.0 framework would not solve that by itself.
- EasyOCR remains an alternative if testing shows Tesseract is inadequate for supported ID images, but it adds PyTorch and model downloads.
- DeepFace is not needed for this one-to-one comparison. InsightFace's library code is MIT, but its model zoo is restricted to non-commercial research.
- AI-KYC is a workflow reference only. Its demo credentials and heuristic liveness/matching fallbacks are not reused.

## Implemented flow

The customer UI enforces consent → National ID upload/OCR → guided camera instructions → face comparison → editable information review → submission. The API authenticates every request, owns status transitions, hides extracted fields until both checks pass, and expires incomplete sessions after 24 hours. Images use a private Supabase bucket and are deleted after a successful face comparison; failed scans retain only the ID image needed for retry. Submitted personal information has no automatic deletion period in this demo, so define and implement a retention policy before using real identity data.

## Scope and limitations

- Identity face capture requires the native Android or iOS app; the web build displays a notice instead of loading the native-only camera module.
- The OCR parser expects labeled National ID fields and requires name, date of birth, address, and a 12–16 digit PCN. Expiration is not applicable for this supported type.
- The face score threshold is a demonstration default, not a production decision threshold. Validate it on suitable test data before any real use.
- Capture prompts are user guidance, not liveness detection. No face embeddings are retained by the service.
- Tesseract and model files are local prerequisites. The processor health endpoint reports missing components and processing errors are returned explicitly.
- Run backend helper tests from `server` with `npm test`; run processor tests from the repository root with `py -m unittest discover -s verification_service -v`.
