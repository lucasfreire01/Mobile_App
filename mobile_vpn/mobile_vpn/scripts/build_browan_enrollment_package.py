#!/usr/bin/env python3
"""Build a per-enrollment Browan package. Requires the updated backend first."""

import argparse
import getpass
import io
from pathlib import Path
import re
import ssl
import sys
import tarfile


def build_package(output: Path, api_url: str, code: str, ca_bundle: Path):
    api_url = api_url.rstrip("/")
    if not re.fullmatch(r"https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?", api_url):
        raise ValueError("Use an HTTPS backend origin, without credentials or API path")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", code):
        raise ValueError("Invalid enrollment code")
    if not str(output).endswith(".tar.gz"):
        raise ValueError("Output must end in .tar.gz")
    ssl.create_default_context(cafile=str(ca_bundle))
    root = Path(__file__).resolve().parent
    files = {
        "install.sh": (root / "browan_package/install.sh").read_bytes(),
        "gateway_enrollment_agent.sh": (root / "gateway_enrollment_agent.sh").read_bytes(),
        "ca-bundle.pem": ca_bundle.read_bytes(),
        "enrollment.conf": (
            f"API_URL='{api_url}'\nENROLLMENT_CODE='{code}'\n"
            "CA_BUNDLE='/etc/saganexus/ca-bundle.pem'\n"
        ).encode(),
    }
    # Exclusive creation and 0600 protect the temporary enrollment credential.
    import os
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            with tarfile.open(fileobj=stream, mode="w:gz") as archive:
                directory = tarfile.TarInfo("installPkg")
                directory.type = tarfile.DIRTYPE
                directory.mode = 0o700
                archive.addfile(directory)
                for name, data in files.items():
                    entry = tarfile.TarInfo(f"installPkg/{name}")
                    entry.mode = 0o700 if name.endswith(".sh") else 0o600
                    entry.size = len(data)
                    archive.addfile(entry, io.BytesIO(data))
    except BaseException:
        output.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--ca-bundle", type=Path, default=ssl.get_default_verify_paths().cafile)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if not sys.stdin.isatty():
        parser.error("Run in an interactive terminal so the code is entered without echo")
    if not args.ca_bundle:
        parser.error("Provide a verified CA bundle with --ca-bundle")
    code = getpass.getpass("Temporary enrollment code: ")
    try:
        build_package(args.output, args.api_url, code, args.ca_bundle)
    except (ValueError, OSError, ssl.SSLError) as error:
        parser.exit(1, f"Package creation failed: {error}\n")
    print(f"Package created: {args.output}")
    print("Contains a temporary credential: keep private and delete after enrollment.")


if __name__ == "__main__":
    main()
