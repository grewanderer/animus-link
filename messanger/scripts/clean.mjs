import { rmSync } from 'node:fs';

const targets = ['.next', 'out', '.turbo'];

for (const target of targets) {
  rmSync(target, { recursive: true, force: true });
}
