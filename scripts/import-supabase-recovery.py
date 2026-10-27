#!/usr/bin/env python3
"""Verify paused-project downloads and prepare a local Storage export."""

import argparse
import collections
import datetime
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import zipfile


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def copy_value(value):
    if value == r"\N":
        return None
    escapes = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v", "\\": "\\"}
    return re.sub(
        r"\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)",
        lambda m: chr(int(m[1], 8)) if m[1][0] in "01234567"
        else chr(int(m[1][1:], 16)) if m[1].startswith("x")
        else escapes.get(m[1], m[1]),
        value,
    )


def read_tables(sql):
    tables = {}
    for match in re.finditer(r"^COPY (.+?) \((.+?)\) FROM stdin;\n(.*?)^\\\.$", sql, re.M | re.S):
        table, columns, content = match.groups()
        names = columns.split(", ")
        rows = []
        for line in content.splitlines():
            values = [copy_value(value) for value in line.split("\t")]
            if len(values) != len(names):
                raise ValueError(f"Invalid COPY column count in {table}")
            rows.append(dict(zip(names, values)))
        if table in tables:
            raise ValueError(f"Duplicate table block: {table}")
        tables[table] = rows
    if not tables:
        raise ValueError("No database COPY tables found")
    return tables


def import_recovery(database, storage, output, project_ref):
    if output.exists():
        raise ValueError("Output must be a new directory")
    db_bytes = database.read_bytes()
    sql = gzip.decompress(db_bytes).decode("utf-8")
    tables = read_tables(sql)
    buckets = {row["id"]: row for row in tables["storage.buckets"]}
    expected = {}
    for row in tables["storage.objects"]:
        key = f'{row["bucket_id"]}/{row["name"]}'
        if key in expected or row["bucket_id"] not in buckets:
            raise ValueError("Invalid or duplicate Storage object")
        expected[key] = row
    manifests = {bucket: [] for bucket in buckets}
    with zipfile.ZipFile(storage) as archive:
        entries = [item for item in archive.infolist() if not item.is_dir()]
        actual = {}
        prefix = project_ref + "/"
        for item in entries:
            if not item.filename.startswith(prefix):
                raise ValueError("Storage archive belongs to a different project")
            key = item.filename[len(prefix):]
            parts = PurePosixPath(key).parts
            if key.startswith("/") or ".." in parts or "\\" in key or key in actual:
                raise ValueError("Unsafe or duplicate archive path")
            actual[key] = item
        if actual.keys() != expected.keys():
            raise ValueError(f"Storage mismatch: missing={len(expected.keys()-actual.keys())}, extra={len(actual.keys()-expected.keys())}")
        output.mkdir(parents=True, mode=0o700)
        for key in sorted(actual):
            row = expected[key]
            metadata = json.loads(row.get("metadata") or "{}")
            data = archive.read(actual[key])
            if metadata.get("size") is not None and int(metadata["size"]) != len(data):
                raise ValueError(f"Storage size mismatch: {key}")
            digest = sha256(data)
            local_path = "objects/" + digest
            bucket_root = output / row["bucket_id"]
            destination = bucket_root / local_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            manifests[row["bucket_id"]].append({
                "path": row["name"], "localPath": local_path,
                "size": len(data), "sha256": digest,
                "mimeType": metadata.get("mimetype"),
                "updatedAt": row.get("updated_at"),
            })
    created_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for bucket, files in manifests.items():
        bucket_root = output / bucket
        bucket_root.mkdir(exist_ok=True)
        manifest = {
            "backupType": "supabase-storage", "source": "paused-project-download",
            "projectRef": project_ref, "bucket": bucket,
            "createdAt": created_at, "fileCount": len(files),
            "totalBytes": sum(item["size"] for item in files), "files": files,
        }
        (bucket_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    inventory = {
        "projectRef": project_ref, "retrievedAt": created_at,
        "database": {"sha256": sha256(db_bytes), "bytes": len(db_bytes),
                     "tables": {table: len(rows) for table, rows in tables.items()},
                     "containsRoles": bool(re.search(r"^CREATE ROLE", sql, re.M))},
        "storage": {"sha256": sha256(storage.read_bytes()), "archiveBytes": storage.stat().st_size,
                    "bucketCount": len(buckets), "objectCount": len(expected),
                    "totalBytes": sum(item["size"] for files in manifests.values() for item in files),
                    "databaseObjectSetMatchesArchive": True,
                    "allObjectSizesMatchDatabase": True,
                    "prefixCounts": dict(collections.Counter(row["name"].split("/")[0] for row in expected.values()))},
    }
    (output / "inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
    print(json.dumps({"output": str(output), "buckets": len(buckets), "objects": len(expected), "tableBlocks": len(tables)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("storage", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--project-ref", required=True)
    args = parser.parse_args()
    import_recovery(args.database, args.storage, args.output, args.project_ref)
