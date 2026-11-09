#!/usr/bin/env python3
"""Build a lab-only package to probe Browan's installPkg/install.sh entry point.

This does not install the SagaNexus agent or register an application in Browan's
app database. Do not use the firmware's app uninstaller for this probe.
"""

import argparse
import io
from pathlib import Path
import tarfile


INSTALL_SCRIPT = b"""#!/bin/sh
set -eu
umask 077
printf '%s\\n' 'SagaNexus package entry point executed.' > /tmp/saganexus-package-probe.ok
printf '%s\\n' 'SagaNexus probe complete; no agent, VPN or app registration changed.'
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New .tar.gz output file")
    args = parser.parse_args()
    if not str(args.output).endswith(".tar.gz"):
        parser.error("output must end in .tar.gz")
    # Refuse to overwrite an existing artifact.
    with args.output.open("xb") as output:
        with tarfile.open(fileobj=output, mode="w:gz") as archive:
            directory = tarfile.TarInfo("installPkg")
            directory.type = tarfile.DIRTYPE
            directory.mode = 0o700
            archive.addfile(directory)
            script = tarfile.TarInfo("installPkg/install.sh")
            script.mode = 0o700
            script.size = len(INSTALL_SCRIPT)
            archive.addfile(script, io.BytesIO(INSTALL_SCRIPT))
    print(f"Lab probe built: {args.output}")
    print("Not uploaded; hardware compatibility and UI completion are unverified.")


if __name__ == "__main__":
    main()
