import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildKimiDefaultHeaders,
  createKimiCodeUserAgent,
  getHostPackageJsonPath,
  getHostPackageRoot,
  getVersion,
  installSwarmRuntimeMetadata,
  SWARM_CAPABILITIES_ENV,
  SWARM_CAPABILITY,
  SWARM_VERSION_ENV,
} from '#/cli/version';

describe('cli version helpers', () => {
  it('resolves the host package manifest near apps/kimi-code and reads its version', () => {
    const pkgPath = getHostPackageJsonPath();
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

    expect(pkgPath.endsWith(join('apps', 'kimi-code', 'package.json'))).toBe(true);
    expect(getHostPackageRoot()).toBe(dirname(pkgPath));
    expect(getVersion()).toBe(pkg.version);
  });

  it('builds default headers with the kimi-code-cli user-agent', () => {
    const headers = buildKimiDefaultHeaders('1.2.3');

    expect(headers['User-Agent']).toBe('kimi-code-cli/1.2.3');
  });

  it('builds the product user-agent for ad-hoc fetches', () => {
    expect(createKimiCodeUserAgent('1.2.3')).toBe('kimi-code-cli/1.2.3');
  });

  it('publishes idempotent swarm capability and version metadata', () => {
    const env: Record<string, string | undefined> = {
      [SWARM_CAPABILITIES_ENV]: 'existing-capability, agent-swarm-item-models-v1',
    };

    installSwarmRuntimeMetadata('1.2.3+swarm.1', env);
    installSwarmRuntimeMetadata('1.2.3+swarm.1', env);

    expect(env[SWARM_CAPABILITIES_ENV]).toBe(`existing-capability,${SWARM_CAPABILITY}`);
    expect(env[SWARM_VERSION_ENV]).toBe('1.2.3+swarm.1');
  });
});
