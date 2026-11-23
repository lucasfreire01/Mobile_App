#!/usr/bin/env python3
"""Build a reusable first-contact Browan package. Enrollment codes are never embedded."""

from __future__ import annotations

import argparse
import io
import os
import re
import ssl
import tarfile
from pathlib import Path


def build_package(api_url: str, output: Path, ca_bundle: Path) -> None:
    api_url = api_url.rstrip("/")
    if not re.fullmatch(r"https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?", api_url):
        raise ValueError("Use an HTTPS API URL without a path")
    if output.exists() or not output.name.endswith(".tar.gz"):
        raise ValueError("Output must be a new .tar.gz file")
    context = ssl.create_default_context(cafile=str(ca_bundle))
    context.load_verify_locations(cafile=str(ca_bundle))
    root = Path(__file__).resolve().parent
    files = {
        "install.sh": root / "browan_package/install.sh",
        "gateway_enrollment_agent.sh": root / "gateway_enrollment_agent.sh",
        "enroll.cgi": root / "browan_package/enroll.cgi",
        "ca-bundle.pem": ca_bundle,
    }
    for path in files.values():
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"Package input is missing: {path.name}")
    bootstrap = f"API_URL='{api_url}'\nCA_BUNDLE='/etc/saganexus/ca-bundle.pem'\n".encode()
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream, tarfile.open(fileobj=stream, mode="w:gz") as archive:
            directory = tarfile.TarInfo("installPkg/")
            directory.type = tarfile.DIRTYPE
            directory.mode = 0o700
            archive.addfile(directory)
            for name, path in files.items():
                data = path.read_bytes()
                entry = tarfile.TarInfo(f"installPkg/{name}")
                entry.mode = 0o700 if name.endswith(".sh") else 0o600
                entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))
            entry = tarfile.TarInfo("installPkg/bootstrap.conf")
            entry.mode = 0o600
            entry.size = len(bootstrap)
            archive.addfile(entry, io.BytesIO(bootstrap))
    except BaseException:
        output.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--ca-bundle", type=Path, required=True)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        build_package(args.api_url, args.output, args.ca_bundle)
    except (OSError, ValueError, ssl.SSLError) as error:
        parser.exit(1, f"Package creation failed: {error}\n")
    print(f"Package created: {args.output}")


if __name__ == "__main__":
    main()
