#!/usr/bin/env python3
"""Install the versioned Wayfinder skill; refuse to overwrite local changes."""
import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path


def hashes(folder):
    result = {}
    for path in folder.rglob('*'):
        if path.is_symlink():
            raise ValueError(f'Unexpected symlink: {path}')
        if path.is_file() and path.relative_to(folder).as_posix() != '.wayfinder-install.json':
            result[path.relative_to(folder).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def install(source, target, check=False):
    if target == source or source in target.parents or target in source.parents:
        raise ValueError('Source and installation must be separate directories')
    expected = hashes(source)
    if not expected or 'SKILL.md' not in expected:
        raise ValueError('Source skill is incomplete')
    if target.is_symlink():
        raise ValueError('Target is a symlink; resolve its ownership before replacing it')
    receipt_path = target / '.wayfinder-install.json'
    existed = target.exists()
    if existed:
        if not receipt_path.is_file():
            raise ValueError('Existing target has no installation receipt; left unchanged')
        receipt = json.loads(receipt_path.read_text())
        if receipt.get('source') != str(source) or hashes(target) != receipt.get('files'):
            raise ValueError('Installed files or ownership changed; left unchanged')
    if check:
        if not target.is_dir() or hashes(target) != expected:
            raise ValueError('Installed skill differs from versioned source')
        return 'Installed skill matches versioned source'
    if target.exists() and hashes(target) == expected:
        return 'Installed skill already current'
    target.parent.mkdir(parents=True, exist_ok=True)
    staged = Path(tempfile.mkdtemp(prefix='wayfinder-install-', dir=target.parent))
    previous = staged / 'previous'
    prepared = staged / 'prepared'
    installed = False
    try:
        shutil.copytree(source, prepared)
        if hashes(prepared) != expected:
            raise ValueError('Source changed while preparing installation')
        (prepared / '.wayfinder-install.json').write_text(json.dumps({
            'source': str(source), 'files': expected,
        }, indent=2) + '\n')
        # Recheck ownership immediately before replacing the derived copy.
        if target.is_symlink() or target.exists() != existed:
            raise ValueError('Installation target changed during preparation')
        if existed:
            if hashes(target) != receipt.get('files'):
                raise ValueError('Installed files changed during preparation')
            target.rename(previous)
        try:
            prepared.rename(target)
            installed = True
        except Exception:
            if previous.exists() and not target.exists():
                previous.rename(target)
            raise
        return 'Installed Wayfinder from versioned source'
    finally:
        # Preserve the last installation if an exceptional rollback could not finish.
        if previous.exists() and not installed:
            print(f'Previous installation retained for recovery: {previous}')
        else:
            shutil.rmtree(staged)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify without writing')
    parser.add_argument('--target', type=Path, default=Path.home()/'.codex/skills/wayfinder-delivery')
    args = parser.parse_args()
    try:
        print(install(Path(__file__).resolve().parent/'wayfinder-delivery', args.target.absolute(), args.check))
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.exit(1, f'{error}\n')
