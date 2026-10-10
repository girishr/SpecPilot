import { readFileSync } from 'fs';
import { join } from 'path';

// BL-087: every build starts from an empty dist/, so a deleted or renamed source file cannot ship its old output.
describe('build scripts', () => {
  const scripts = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')).scripts;

  it('cleans before every build (build, prepare, prepublishOnly and test:browser all run build)', () => {
    expect(scripts.prebuild).toBe('npm run clean');
  });

  it('cleans with Node, not rm -rf, since prepare now runs it on every install from git (Windows cmd included)', () => {
    expect(scripts.clean).toBe(`node -e "require('fs').rmSync('dist',{recursive:true,force:true})"`);
  });
});
