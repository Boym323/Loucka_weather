/** Metadata of the actual atomic LXC preview release, not the GitHub HEAD. */
export interface DeploymentMetadata {
  schemaVersion: '1';
  branch: 'main';
  commit: string;
  deployedAt: string;
}

export function parseDeploymentMetadata(input: unknown): DeploymentMetadata | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (record.schemaVersion !== '1' || record.branch !== 'main') return null;
  if (typeof record.commit !== 'string' || !/^[0-9a-f]{40}$/.test(record.commit)) return null;
  if (typeof record.deployedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.deployedAt) ||
      !Number.isFinite(Date.parse(record.deployedAt))) return null;
  return { schemaVersion: '1', branch: 'main', commit: record.commit, deployedAt: record.deployedAt };
}

export function formatDeploymentTime(value: string): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague'
  }).format(new Date(value));
}
