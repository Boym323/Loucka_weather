"""Isolated staging deployment contract tests; never use real LXC resources.
Execute a disposable copy of the helper under mock systemctl/curl/git.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = (ROOT / "loucka-preview-api-activate.sh").read_text()
SYNC = (ROOT / "auto-deploy-preview.sh").read_text()
NGINX = (ROOT / "nginx-preview.conf").read_text()
UNIT = (ROOT / "loucka-preview-sync.service").read_text()
TIMER = (ROOT / "loucka-preview-sync.timer").read_text()
OLD = "a" * 40
NEW = "b" * 40


def executable(path, source):
    path.write_text(source)
    path.chmod(0o755)


class DeploymentGateTest(unittest.TestCase):
    def test_sources_allow_publication_only_after_root_helper_readiness(self):
        self.assertIn("pending_tmp=", SYNC)
        self.assertNotIn('ln -sfn "$release" "$WEB/.current.next"', SYNC)
        self.assertNotIn('mv -Tf "$WEB/.current.next" "$WEB/current"', SYNC)
        self.assertIn("publish_pending() {", HELPER)
        self.assertIn("&& api_ready;", HELPER)
        self.assertIn("publish_pending\n", HELPER)
        self.assertIn("ExecStartPost=+/usr/local/libexec/loucka-preview-api-activate.sh", UNIT)
        self.assertIn("runuser -u loucka -- mv -Tf", HELPER)
        self.assertIn("real_ip_header X-Forwarded-For;", NGINX)
        self.assertIn("/etc/nginx/loucka-trusted-proxy/*.conf", NGINX)
        self.assertNotIn("set_real_ip_from 0.0.0.0/0", NGINX)

    def test_timer_rearms_when_enabled_late_after_boot(self):
        # OnBootSec expires only once; a late restart must still schedule a run.
        self.assertIn("OnActiveSec=45s", TIMER)
        self.assertIn("OnUnitInactiveSec=2min", TIMER)
        self.assertIn("AccuracySec=10s", TIMER)
        self.assertNotIn("OnBootSec=", TIMER)
        self.assertNotIn("Persistent=true", TIMER)

    def run_fixture(self, ready):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            web = base / "web"
            releases = web / "releases"
            previous = releases / OLD
            candidate = releases / NEW
            state_dir = base / "state"
            bin_dir = base / "mockbin"
            for directory in (previous, candidate, state_dir, bin_dir):
                directory.mkdir(parents=True)
            (previous / ".source-commit").write_text(OLD + "\n")
            (candidate / ".source-commit").write_text(NEW + "\n")
            (previous / "deployment.json").write_text('{"commit":"' + OLD + '"}\n')
            (web / ".pending-commit").write_text(NEW + "\n")
            (web / "current").symlink_to(previous)
            (state_dir / "active-commit").write_text(OLD + "\n")

            executable(bin_dir / "git", r'''#!/usr/bin/env bash
case "$*" in
 *"rev-parse HEAD"*) printf '%s\n' "$NEW_SHA";;
 *"rev-parse --verify"*)
     if [[ "$*" == *"$OLD_SHA:api"* ]]; then printf '%040d\n' 1;
     else printf '%040d\n' 2; fi;;
 *) exit 29;;
esac
''')
            executable(bin_dir / "systemctl", r'''#!/usr/bin/env bash
case "$1" in
 is-active) exit 0;;
 restart) exit 0;;
 *) exit 35;;
esac
''')
            executable(bin_dir / "curl", r'''#!/usr/bin/env bash
case "$*" in
 *"/healthz") printf '{}\n';;
 *"/readyz")
     if [[ "$READY" == true ]]; then printf '{"ready":true}\n';
     else printf '{"ready":false}\n'; fi;;
 *) exit 48;;
esac
''')
            executable(bin_dir / "journalctl", "#!/usr/bin/env bash\nexit 0\n")
            fixture = HELPER
            # Only disposable path and privilege substitutions. Never touch /srv.
            fixture = fixture.replace("/srv/loucka-preview", str(web))
            fixture = fixture.replace("/var/lib/loucka-weather-api", str(state_dir))
            fixture = fixture.replace("/home/loucka/Loucka_weather", str(base / "repo"))
            fixture = fixture.replace("runuser -u loucka -- ", "")
            fixture = fixture.replace("install -d -o root -g root -m 0750",
                                      "install -d -m 0750")
            fixture = fixture.replace("for attempt in {1..15}; do",
                                      "for attempt in {1..1}; do")
            fixture = fixture.replace("  sleep 1\n", "  :\n")
            path = base / "fixture-helper.sh"
            executable(path, fixture)

            env = dict(os.environ)
            env.update(PATH=str(bin_dir) + ":" + env.get("PATH", ""),
                       READY="true" if ready else "false",
                       OLD_SHA=OLD, NEW_SHA=NEW)
            result = subprocess.run(["bash", str(path)], env=env,
                                    capture_output=True, text=True, timeout=15)
            return {
                "returncode": result.returncode,
                "output": result.stdout + result.stderr,
                "current_is_candidate": (web / "current").resolve() == candidate,
                "pending_exists": (web / ".pending-commit").exists(),
                "active": (state_dir / "active-commit").read_text().strip(),
                "deployed": json.loads((candidate / "deployment.json").read_text())
                    if (candidate / "deployment.json").exists() else None,
            }

    def test_api_not_ready_never_publishes_and_keeps_retry_candidate(self):
        result = self.run_fixture(ready=False)
        self.assertNotEqual(result["returncode"], 0, result["output"])
        self.assertFalse(result["current_is_candidate"])
        self.assertTrue(result["pending_exists"])
        self.assertEqual(result["active"], OLD)
        self.assertIsNone(result["deployed"])

    def test_ready_api_publishes_and_stamps_actual_publication(self):
        result = self.run_fixture(ready=True)
        self.assertEqual(result["returncode"], 0, result["output"])
        self.assertTrue(result["current_is_candidate"])
        self.assertFalse(result["pending_exists"])
        self.assertEqual(result["active"], NEW)
        self.assertEqual(result["deployed"]["commit"], NEW)
        self.assertRegex(result["deployed"]["deployedAt"],
                         r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


if __name__ == "__main__":
    unittest.main()
