"""Static contract of read-only DEV operations evidence script; no LXC connections."""
from pathlib import Path
import subprocess
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "preview-operations-check.sh"
SOURCE = SCRIPT.read_text(encoding="utf-8")

class OperationsEvidenceContract(unittest.TestCase):
    def test_shell_syntax(self):
        run = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)

    def test_checks_timer_firewall_and_release_without_mutations(self):
        self.assertIn("NextElapseUSecMonotonic", SOURCE)
        self.assertIn("OnActiveSec=45s", SOURCE)
        self.assertIn("OnUnitInactiveSec=2min", SOURCE)
        self.assertIn("nft -c -f /etc/nftables.conf", SOURCE)
        self.assertIn("nft list table inet loucka_preview_guard", SOURCE)
        self.assertIn("http://127.0.0.1:3100/api/v1/readyz", SOURCE)
        self.assertIn("https://dev.pocasi-loucka.eu/deployment.json", SOURCE)
        self.assertIn("NOT VERIFIED:", SOURCE)
        self.assertNotIn("nft -f /etc/nftables.conf", SOURCE)
        self.assertNotIn("systemctl restart", SOURCE)
        self.assertNotIn("systemctl enable", SOURCE)
        self.assertNotIn("git pull", SOURCE)
        self.assertNotIn("mysql -e", SOURCE)

if __name__ == "__main__":
    unittest.main()
