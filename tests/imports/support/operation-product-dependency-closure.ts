import { build } from 'esbuild'

export const legacyModuleImport = /modules\/(?:answer(?:-thread)?|external-run|harness)(?:\/|['"])/u

export async function bundledCliInputs(
  entryPoint: string,
  absWorkingDir: string = process.cwd(),
): Promise<readonly string[]> {
  const result = await build({
    absWorkingDir,
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    legalComments: 'none',
    ...(absWorkingDir === process.cwd() ? { tsconfig: 'tsconfig.json' } : {}),
    write: false,
    metafile: true,
  })
  return Object.freeze(Object.keys(result.metafile!.inputs).sort())
}

export function legacyInputs(inputs: readonly string[]): readonly string[] {
  return inputs.filter((path) => legacyModuleImport.test(path.replaceAll('\\', '/')))
}
