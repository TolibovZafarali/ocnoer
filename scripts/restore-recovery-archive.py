#!/usr/bin/env python3
"""Verify and decrypt a split recovery archive into a new local directory."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


def hash_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_name(value):
    if not isinstance(value, str) or Path(value).name != value or value in (".", "..") or "\\" in value:
        raise ValueError("Archive manifest contains an unsafe filename")
    return value


def restore(archive_directory, identity, output):
    if output.exists():
        raise ValueError("Output must be a new directory")
    manifest = json.loads((archive_directory / "manifest.json").read_text())
    if manifest["formatVersion"] != 1:
        raise ValueError("Unsupported archive version")
    with tempfile.TemporaryDirectory(prefix="ocnoer-recovery-") as directory:
        encrypted = Path(directory) / "recovery.tar.age"
        with encrypted.open("wb") as destination:
            seen = set()
            for part in manifest["parts"]:
                name = safe_name(part["file"])
                if name in seen:
                    raise ValueError("Duplicate archive part")
                seen.add(name)
                source = archive_directory / name
                if source.stat().st_size != part["bytes"] or hash_file(source) != part["sha256"]:
                    raise ValueError(f"Archive part failed verification: {name}")
                with source.open("rb") as incoming:
                    shutil.copyfileobj(incoming, destination)
        if encrypted.stat().st_size != manifest["archiveBytes"] or hash_file(encrypted) != manifest["archiveSha256"]:
            raise ValueError("Combined archive failed verification")
        decrypted = Path(directory) / "recovery.tar"
        subprocess.run(["age", "--decrypt", "--identity", str(identity), "--output", str(decrypted), str(encrypted)], check=True)
        expected = {safe_name(item["file"]): item for item in manifest["contents"]}
        with tarfile.open(decrypted) as archive:
            members = archive.getmembers()
            if len(members) != len(expected) or {item.name for item in members} != set(expected):
                raise ValueError("Unexpected recovery archive contents")
            for member in members:
                record = expected[member.name]
                if not member.isfile() or member.size != record["bytes"]:
                    raise ValueError("Invalid recovery archive member")
                digest = hashlib.sha256()
                with archive.extractfile(member) as source:
                    for block in iter(lambda: source.read(1024 * 1024), b""):
                        digest.update(block)
                if digest.hexdigest() != record["sha256"]:
                    raise ValueError(f"Recovery file failed verification: {member.name}")
            output.mkdir(parents=True, mode=0o700)
            for member in members:
                with archive.extractfile(member) as source, (output / member.name).open("xb") as destination:
                    shutil.copyfileobj(source, destination)
                (output / member.name).chmod(0o600)
    print(f"Verified and recovered {len(expected)} files to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive_directory", type=Path)
    parser.add_argument("identity", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    restore(args.archive_directory, args.identity, args.output)
