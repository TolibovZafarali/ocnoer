"""Exercise recovery imports with empty buckets and hostile bucket paths."""

import contextlib
import gzip
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


spec = importlib.util.spec_from_file_location(
    "recovery_import", Path(__file__).with_name("import-supabase-recovery.py")
)
recovery_import = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery_import)


class RecoveryBucketTests(unittest.TestCase):
    def import_empty_buckets(self, root, buckets):
        sql = (
            "COPY storage.buckets (id) FROM stdin;\n"
            + "\n".join(buckets)
            + "\n\\.\nCOPY storage.objects (bucket_id, name) FROM stdin;\n\\.\n"
        )
        database = root / "database.gz"
        database.write_bytes(gzip.compress(sql.encode()))
        storage = root / "storage.zip"
        with zipfile.ZipFile(storage, "w"):
            pass
        with contextlib.redirect_stdout(io.StringIO()):
            recovery_import.import_recovery(database, storage, root / "export", "project")

    def test_rejects_unsafe_empty_bucket_before_creating_output(self):
        for bucket in ("../outside", "/outside", "nested/bucket", ".", "..", "", r"bad\\bucket", r"\N"):
            with self.subTest(bucket=bucket), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                with self.assertRaisesRegex(ValueError, "Unsafe Storage bucket ID"):
                    self.import_empty_buckets(root, [bucket])
                self.assertFalse((root / "export").exists())
                self.assertFalse((root / "outside").exists())

    def test_rejects_duplicate_bucket_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, "Duplicate Storage bucket ID"):
                self.import_empty_buckets(root, ["runtime", "runtime"])
            self.assertFalse((root / "export").exists())

    def test_preserves_valid_empty_bucket(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.import_empty_buckets(root, ["runtime"])
            manifest = json.loads((root / "export/runtime/manifest.json").read_text())
            self.assertEqual(manifest["bucket"], "runtime")
            self.assertEqual(manifest["files"], [])


if __name__ == "__main__":
    unittest.main()
