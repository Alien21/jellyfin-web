import fs from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');
const realRoot = fs.realpathSync(root);
const buildRoots = new Set(['_output', '_artifacts', '_temp', '_tests']);

function isOutside(parent: string, target: string): boolean {
    const relative = path.relative(parent, target);
    return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

// Reject paths outside this checkout and symlinks/junctions below the checkout.
// The same guard protects direct webpack invocations before its clean plugin runs.
export function buildPath(...parts: string[]): string {
    const target = path.resolve(root, ...parts);
    const relative = path.relative(root, target);
    if (!relative || isOutside(root, target) || !buildRoots.has(relative.split(path.sep)[0])) {
        throw new Error(`Refusing an unexpected build path: ${target}`);
    }
    let current = root;
    for (const component of relative.split(path.sep)) {
        current = path.join(current, component);
        const entry = fs.lstatSync(current, { throwIfNoEntry: false });
        if (!entry) continue;
        if (entry.isSymbolicLink() || isOutside(realRoot, fs.realpathSync(current))) {
            throw new Error(`Refusing a build path through a symlink or junction: ${current}`);
        }
    }
    return target;
}
