"""Contract for fail-closed operator-only RH preview installation.

Never execute the installer or contact systemd/MariaDB in this test.
"""
from pathlib import Path
import subprocess
import unittest

INSTALLER = Path(__file__).resolve().parents[1] / "install-loucka-rh-preview.sh"
SOURCE = INSTALLER.read_text(encoding="utf-8")


class RhPreviewInstallerContractTest(unittest.TestCase):
    def test_bash_syntax(self):
        result = subprocess.run(["bash", "-n", str(INSTALLER)],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_failure_disables_only_private_service(self):
        self.assertIn('systemctl disable --now "$UNIT"', SOURCE)
        self.assertIn("cleanup_failed_install() {", SOURCE)
        trap_at = SOURCE.index("trap cleanup_failed_install EXIT")
        install_at = SOURCE.index("install -o root -g root -m 0644")
        enable_at = SOURCE.index('systemctl enable --now "$UNIT"')
        smoke_at = SOURCE.index('if [[ "$status" != 200')
        success_at = SOURCE.index('trap - EXIT\necho "READY:')
        self.assertLess(trap_at, install_at)
        self.assertLess(install_at, enable_at)
        self.assertLess(enable_at, smoke_at)
        self.assertLess(smoke_at, success_at)
        self.assertIn('if (( result != 0 )); then', SOURCE)
        self.assertIn('exit 1\nfi\ntrap - EXIT', SOURCE)
        self.assertNotIn("systemctl restart loucka-weather-api", SOURCE)
        self.assertNotIn("systemctl stop loucka-weather-api", SOURCE)
        self.assertNotIn("systemctl disable loucka-weather-api", SOURCE)


if __name__ == "__main__":
    unittest.main()
