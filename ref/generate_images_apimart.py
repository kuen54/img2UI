"""
Usage Examples:
---------------
1. Generate a single image:
   python reusable-scripts/generate_images_apimart.py --prompt "A corgi astronaut on the moon"

2. Generate multiple prompts concurrently:
   python reusable-scripts/generate_images_apimart.py --prompt "Cyberpunk city" --prompt "Medieval castle" --workers 2

3. Generate from a prompts file:
   python reusable-scripts/generate_images_apimart.py --prompts-file prompts.txt --workers 3

4. Treat an entire file as one prompt:
   python reusable-scripts/generate_images_apimart.py --prompts-file long_prompt.txt --full-file

5. Set aspect ratio and resolution:
   python reusable-scripts/generate_images_apimart.py --prompt "Studio product ad" --size 16:9 --resolution 2k

6. Use local reference images, encoded as Base64 data URIs:
   python reusable-scripts/generate_images_apimart.py --prompt "Restyle this product photo" --reference-image ./product.png

7. Use per-job settings from JSONL or a JSON array:
   python reusable-scripts/generate_images_apimart.py --jobs-file jobs.jsonl --workers 3

Notes:
- Requires APIMART_TOKEN.
- Uses APIMart GPT-Image-2 and polls async task_id results.
- Saves images and mapping.jsonl under generated_images_apimart/ by default.
- Reference inputs are Base64-only; http:// and https:// references are rejected.
- official_fallback is always false.
- --resolution 4k is only valid with 16:9, 9:16, 2:1, 1:2, 21:9, or 9:21.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import json
import mimetypes
import os
from pathlib import Path
import re
import sys
import threading
import time
from typing import Any

import requests


API_URL_GENERATIONS = "https://api.apimart.ai/v1/images/generations"
API_URL_TASK = "https://api.apimart.ai/v1/tasks/{task_id}"
DEFAULT_MODEL = "gpt-image-2"
DEFAULT_OUTPUT_DIR = "generated_images_apimart"
API_REQUEST_TIMEOUT = (30, 300)
IMAGE_DOWNLOAD_TIMEOUT = 120
IMAGE_DOWNLOAD_RETRIES = 3
MAX_REFERENCE_IMAGES = 16

SUPPORTED_SIZES = {
    "auto",
    "1:1",
    "3:2",
    "2:3",
    "4:3",
    "3:4",
    "5:4",
    "4:5",
    "16:9",
    "9:16",
    "2:1",
    "1:2",
    "21:9",
    "9:21",
}
SUPPORTED_RESOLUTIONS = {"1k", "2k", "4k"}
SUPPORTED_4K_SIZES = {"16:9", "9:16", "2:1", "1:2", "21:9", "9:21"}
DATA_URI_RE = re.compile(r"^data:image/[a-zA-Z0-9.+-]+;base64,", re.IGNORECASE)

manifest_lock = threading.Lock()


class ApimartError(RuntimeError):
    """Raised for expected user-facing APIMart workflow errors."""


def build_headers() -> dict[str, str]:
    token = os.environ.get("APIMART_TOKEN")
    if not token:
        raise ApimartError("APIMART_TOKEN environment variable is not set.")

    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def validate_size_resolution(size: str, resolution: str) -> None:
    if size not in SUPPORTED_SIZES:
        raise ApimartError(
            f"Invalid size '{size}'. Supported values: {', '.join(sorted(SUPPORTED_SIZES))}"
        )

    if resolution not in SUPPORTED_RESOLUTIONS:
        raise ApimartError(
            "Invalid resolution "
            f"'{resolution}'. Supported values: {', '.join(sorted(SUPPORTED_RESOLUTIONS))}"
        )

    if resolution == "4k" and size not in SUPPORTED_4K_SIZES:
        raise ApimartError(
            "APIMart only supports 4k for these sizes: "
            f"{', '.join(sorted(SUPPORTED_4K_SIZES))}. Got size '{size}'."
        )


def is_url(value: str) -> bool:
    lowered = value.strip().lower()
    return lowered.startswith("http://") or lowered.startswith("https://")


def encode_image_path_to_data_uri(image_path: str) -> str:
    if is_url(image_path):
        raise ApimartError(
            "Reference image URLs are not allowed. Use a local file or Base64 data URI."
        )

    path = Path(image_path).expanduser()
    if not path.exists():
        raise ApimartError(f"Reference image file not found: {image_path}")
    if not path.is_file():
        raise ApimartError(f"Reference image path is not a file: {image_path}")

    mime_type, _ = mimetypes.guess_type(str(path))
    if not mime_type or not mime_type.startswith("image/"):
        mime_type = "image/png"

    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def normalize_base64_reference(value: str, fallback_mime: str) -> str:
    stripped = value.strip()
    if is_url(stripped):
        raise ApimartError("Reference image URLs are not allowed. Use Base64 only.")

    if DATA_URI_RE.match(stripped):
        return stripped

    if stripped.startswith("data:"):
        raise ApimartError(
            "Reference data URI must use an image MIME type and base64 encoding, "
            "for example data:image/png;base64,..."
        )

    try:
        base64.b64decode(stripped, validate=True)
    except Exception as exc:
        raise ApimartError(
            "Reference value is not valid Base64. Provide a data URI or raw Base64."
        ) from exc

    if not fallback_mime.startswith("image/"):
        raise ApimartError("--reference-mime must be an image MIME type.")

    return f"data:{fallback_mime};base64,{stripped}"


def build_reference_data_uris(
    reference_images: list[str] | None,
    reference_base64: list[str] | None,
    reference_mime: str,
) -> list[str]:
    refs: list[str] = []

    for image_path in reference_images or []:
        refs.append(encode_image_path_to_data_uri(image_path))

    for item in reference_base64 or []:
        refs.append(normalize_base64_reference(item, reference_mime))

    if len(refs) > MAX_REFERENCE_IMAGES:
        raise ApimartError(
            f"APIMart supports at most {MAX_REFERENCE_IMAGES} reference images. "
            f"Got {len(refs)}."
        )

    return refs


def submit_generation(
    headers: dict[str, str],
    prompt: str,
    size: str,
    resolution: str,
    reference_data_uris: list[str],
    model: str,
) -> str:
    validate_size_resolution(size, resolution)

    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "resolution": resolution,
        "official_fallback": False,
    }

    if reference_data_uris:
        payload["image_urls"] = reference_data_uris

    response = requests.post(
        API_URL_GENERATIONS,
        headers=headers,
        json=payload,
        timeout=API_REQUEST_TIMEOUT,
    )

    if response.status_code >= 400:
        raise ApimartError(f"APIMart submit error {response.status_code}: {response.text}")

    data = response.json()
    task_id = extract_task_id(data)
    if not task_id:
        raise ApimartError(f"Could not find task_id in submit response: {data}")

    return task_id


def extract_task_id(data: dict[str, Any]) -> str | None:
    response_data = data.get("data")
    if isinstance(response_data, list) and response_data:
        task_id = response_data[0].get("task_id")
        if isinstance(task_id, str) and task_id:
            return task_id

    if isinstance(response_data, dict):
        task_id = response_data.get("task_id") or response_data.get("id")
        if isinstance(task_id, str) and task_id:
            return task_id

    task_id = data.get("task_id")
    if isinstance(task_id, str) and task_id:
        return task_id

    return None


def poll_task(
    headers: dict[str, str],
    task_id: str,
    initial_delay: float,
    poll_interval: float,
    task_timeout: float,
) -> dict[str, Any]:
    if initial_delay > 0:
        time.sleep(initial_delay)

    deadline = time.monotonic() + task_timeout
    last_payload: dict[str, Any] | None = None

    while time.monotonic() < deadline:
        response = requests.get(
            API_URL_TASK.format(task_id=task_id),
            headers=headers,
            timeout=API_REQUEST_TIMEOUT,
        )

        if response.status_code >= 400:
            raise ApimartError(f"APIMart task query error {response.status_code}: {response.text}")

        payload = response.json()
        last_payload = payload
        task_data = payload.get("data", {})
        status = task_data.get("status")
        progress = task_data.get("progress")
        print(f"[{task_id}] status={status} progress={progress}")

        if status == "completed":
            return payload

        if status == "failed":
            error = task_data.get("error") or payload.get("error") or task_data
            raise ApimartError(f"APIMart task failed for {task_id}: {error}")

        time.sleep(poll_interval)

    raise ApimartError(
        f"Timed out waiting for task {task_id} after {task_timeout:.0f}s. "
        f"Last response: {last_payload}"
    )


def extract_result_urls(task_payload: dict[str, Any]) -> list[str]:
    task_data = task_payload.get("data", {})
    result = task_data.get("result", {})
    images = result.get("images", [])
    urls: list[str] = []

    if not isinstance(images, list):
        return urls

    for image in images:
        if not isinstance(image, dict):
            continue

        url_value = image.get("url")
        if isinstance(url_value, str):
            urls.append(url_value)
        elif isinstance(url_value, list):
            urls.extend([item for item in url_value if isinstance(item, str)])

    return urls


def safe_filename_part(value: str, max_length: int = 48) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip())
    normalized = normalized.strip("._-")
    return (normalized or "image")[:max_length]


def download_image(
    image_url: str,
    filepath: Path,
    retries: int = IMAGE_DOWNLOAD_RETRIES,
    timeout: int = IMAGE_DOWNLOAD_TIMEOUT,
) -> None:
    for attempt in range(1, retries + 1):
        try:
            with requests.get(image_url, stream=True, timeout=timeout) as response:
                response.raise_for_status()
                with filepath.open("wb") as image_file:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            image_file.write(chunk)
            return
        except (requests.exceptions.RequestException, OSError) as exc:
            if attempt == retries:
                raise ApimartError(
                    f"Error downloading image after {retries} attempts: {exc}"
                ) from exc
            print(f"Download attempt {attempt} failed: {exc}. Retrying...")
            time.sleep(min(attempt * 2, 5))


def append_manifest(output_dir: Path, entry: dict[str, Any]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "mapping.jsonl"
    with manifest_lock:
        with manifest_path.open("a", encoding="utf-8") as manifest:
            manifest.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_prompts_file(path: str, full_file: bool) -> list[str]:
    text = Path(path).expanduser().read_text(encoding="utf-8")
    if full_file:
        prompt = text.strip()
        return [prompt] if prompt else []
    return [line.strip() for line in text.splitlines() if line.strip()]


def load_jobs_file(path: str) -> list[dict[str, Any]]:
    raw = Path(path).expanduser().read_text(encoding="utf-8").strip()
    if not raw:
        return []

    if raw.startswith("["):
        loaded = json.loads(raw)
        if not isinstance(loaded, list):
            raise ApimartError("--jobs-file JSON must be an array or JSONL objects.")
        jobs = loaded
    else:
        jobs = []
        for line_number, line in enumerate(raw.splitlines(), start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                jobs.append(json.loads(stripped))
            except json.JSONDecodeError as exc:
                raise ApimartError(
                    f"Invalid JSON on line {line_number} of --jobs-file: {exc}"
                ) from exc

    for index, job in enumerate(jobs, start=1):
        if not isinstance(job, dict):
            raise ApimartError(f"Job {index} must be a JSON object.")
        if not isinstance(job.get("prompt"), str) or not job["prompt"].strip():
            raise ApimartError(f"Job {index} must include a non-empty prompt string.")

    return jobs


def normalize_optional_list(value: Any, field_name: str) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return value
    raise ApimartError(f"{field_name} must be a string or list of strings.")


def create_jobs(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.jobs_file:
        raw_jobs = load_jobs_file(args.jobs_file)
        jobs: list[dict[str, Any]] = []
        for raw_job in raw_jobs:
            reference_mime = raw_job.get("reference_mime", args.reference_mime)
            if not isinstance(reference_mime, str):
                raise ApimartError("reference_mime must be a string.")

            jobs.append(
                {
                    "prompt": raw_job["prompt"].strip(),
                    "size": raw_job.get("size", args.size),
                    "resolution": raw_job.get("resolution", args.resolution),
                    "reference_images": normalize_optional_list(
                        raw_job.get("reference_images"), "reference_images"
                    ),
                    "reference_base64": normalize_optional_list(
                        raw_job.get("reference_base64"), "reference_base64"
                    ),
                    "reference_mime": reference_mime,
                    "output_prefix": raw_job.get("output_prefix"),
                }
            )
        return jobs

    prompts: list[str] = []
    if args.prompt:
        prompts.extend(prompt.strip() for prompt in args.prompt if prompt.strip())

    if args.prompts_file:
        prompts.extend(load_prompts_file(args.prompts_file, args.full_file))

    if not prompts:
        raise ApimartError("No prompts provided. Use --prompt, --prompts-file, or --jobs-file.")

    return [
        {
            "prompt": prompt,
            "size": args.size,
            "resolution": args.resolution,
            "reference_images": args.reference_image or [],
            "reference_base64": args.reference_base64 or [],
            "reference_mime": args.reference_mime,
            "output_prefix": None,
        }
        for prompt in prompts
    ]


def process_job(
    job_index: int,
    job: dict[str, Any],
    args: argparse.Namespace,
    headers: dict[str, str],
    output_dir: Path,
) -> bool:
    prompt = job["prompt"]
    size = job["size"]
    resolution = job["resolution"]

    if not isinstance(size, str) or not isinstance(resolution, str):
        raise ApimartError(f"Job {job_index}: size and resolution must be strings.")

    validate_size_resolution(size, resolution)
    reference_data_uris = build_reference_data_uris(
        job["reference_images"],
        job["reference_base64"],
        job["reference_mime"],
    )

    mode = "image-to-image" if reference_data_uris else "text-to-image"
    print(
        f"[job {job_index}] Submitting {mode}: "
        f"size={size} resolution={resolution} refs={len(reference_data_uris)}"
    )

    task_id = submit_generation(
        headers=headers,
        prompt=prompt,
        size=size,
        resolution=resolution,
        reference_data_uris=reference_data_uris,
        model=args.model,
    )
    print(f"[job {job_index}] Submitted task_id={task_id}")

    task_payload = poll_task(
        headers=headers,
        task_id=task_id,
        initial_delay=args.initial_delay,
        poll_interval=args.poll_interval,
        task_timeout=args.task_timeout,
    )

    result_urls = extract_result_urls(task_payload)
    if not result_urls:
        raise ApimartError(f"Task {task_id} completed but no image URL was found.")

    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = int(time.time())
    prefix_source = job.get("output_prefix") or prompt
    prefix = safe_filename_part(str(prefix_source))

    for image_index, image_url in enumerate(result_urls):
        filename = f"{timestamp}_apimart_{job_index}_{image_index}_{prefix}.png"
        filepath = output_dir / filename
        download_image(image_url, filepath)

        append_manifest(
            output_dir,
            {
                "filename": filename,
                "prompt": prompt,
                "type": mode,
                "provider": "apimart",
                "model": args.model,
                "size": size,
                "resolution": resolution,
                "reference_count": len(reference_data_uris),
                "task_id": task_id,
                "result_url": image_url,
                "timestamp": timestamp,
            },
        )
        print(f"[job {job_index}] Saved {filepath}")

    return True


def preflight_jobs(jobs: list[dict[str, Any]]) -> None:
    for index, job in enumerate(jobs, start=1):
        size = job["size"]
        resolution = job["resolution"]
        if not isinstance(size, str) or not isinstance(resolution, str):
            raise ApimartError(f"Job {index}: size and resolution must be strings.")

        validate_size_resolution(size, resolution)
        build_reference_data_uris(
            job["reference_images"],
            job["reference_base64"],
            job["reference_mime"],
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate images with APIMart GPT-Image-2. References are Base64-only."
    )
    parser.add_argument("--prompt", type=str, action="append", help="Prompt to generate. Repeat for batches.")
    parser.add_argument("--prompts-file", type=str, help="File containing prompts, one per non-empty line.")
    parser.add_argument(
        "--full-file",
        action="store_true",
        help="Treat the entire prompts-file as a single prompt.",
    )
    parser.add_argument(
        "--jobs-file",
        type=str,
        help="JSONL file or JSON array with per-job prompt, size, resolution, and references.",
    )
    parser.add_argument(
        "--reference-image",
        type=str,
        action="append",
        help="Local reference image path. Repeat up to 16 times. URLs are rejected.",
    )
    parser.add_argument(
        "--reference-base64",
        type=str,
        action="append",
        help="Base64 data URI or raw Base64 reference. Repeat up to 16 times. URLs are rejected.",
    )
    parser.add_argument(
        "--reference-mime",
        type=str,
        default="image/png",
        help="MIME type for raw --reference-base64 values. Default: image/png.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Model name. APIMart documents this as fixed to {DEFAULT_MODEL}.",
    )
    parser.add_argument("--output-dir", type=str, default=DEFAULT_OUTPUT_DIR, help="Directory for downloaded images.")
    parser.add_argument("--size", type=str, default="1:1", help="Image ratio, for example 1:1, 16:9, or auto.")
    parser.add_argument(
        "--resolution",
        type=str,
        default="1k",
        choices=sorted(SUPPORTED_RESOLUTIONS),
        help="Output resolution tier.",
    )
    parser.add_argument("--workers", type=int, default=3, help="Parallel worker count for batch jobs.")
    parser.add_argument("--initial-delay", type=float, default=12, help="Seconds to wait before first task poll.")
    parser.add_argument("--poll-interval", type=float, default=4, help="Seconds between task polls.")
    parser.add_argument("--task-timeout", type=float, default=300, help="Maximum seconds to wait per task.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        headers = build_headers()
        jobs = create_jobs(args)
        if args.workers < 1:
            raise ApimartError("--workers must be at least 1.")
        if args.initial_delay < 0 or args.poll_interval <= 0 or args.task_timeout <= 0:
            raise ApimartError("Polling values must be positive, except --initial-delay may be 0.")
        preflight_jobs(jobs)

        output_dir = Path(args.output_dir).expanduser()
        print(f"Starting {len(jobs)} APIMart job(s) with {args.workers} worker(s).")
        print("official_fallback is always false. Reference URLs are not accepted.")

        failures = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
            future_to_index = {
                executor.submit(process_job, index, job, args, headers, output_dir): index
                for index, job in enumerate(jobs, start=1)
            }

            for future in concurrent.futures.as_completed(future_to_index):
                index = future_to_index[future]
                try:
                    future.result()
                except Exception as exc:
                    failures += 1
                    print(f"[job {index}] Failed: {exc}", file=sys.stderr)

        completed = len(jobs) - failures
        print(f"Done. completed={completed} failed={failures}")
        return 1 if failures else 0

    except ApimartError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
