import {
  type SecretPlane,
  secretGeneration,
  secretRef,
  type SecretGenerationValidator,
  type SecretMaterialLease,
  type SecretTarget,
} from './secret-plane'
import { degradeBackend } from '@/lib/observability/degrade-backend'

export interface SecretGenerationProbe {
  /**
   * Performs the real provider-specific credential check. A successful probe
   * must consume the supplied lease exactly once and must not return material.
   */
  validate(target: SecretTarget, lease: SecretMaterialLease): Promise<void>
}

export interface ScopedSecretConsequenceInput {
  readonly secretRef: string
}

export interface SecretConsequenceExecutor {
  execute(
    input: ScopedSecretConsequenceInput,
    consequence: (lease: SecretMaterialLease) => Promise<void>,
  ): Promise<void>
}

export interface ScopedSecretConsequenceRuntime {
  readonly platform: SecretConsequenceExecutor
  readonly customer: SecretConsequenceExecutor
}

class SingleUseSecretMaterialLease implements SecretMaterialLease {
  readonly #source: SecretMaterialLease
  #used = false

  constructor(source: SecretMaterialLease) {
    this.#source = source
  }

  get byteLength(): number {
    return this.#source.byteLength
  }

  get used(): boolean {
    return this.#used
  }

  async useBytes(operation: (material: Uint8Array) => Promise<void>): Promise<void> {
    if (this.#used) throw new TypeError('Secret generation probe may consume material only once.')
    this.#used = true
    await this.#source.useBytes(async (material) => {
      await operation(material)
    })
  }
}

export class ProductionSecretGenerationValidator implements SecretGenerationValidator {
  readonly #probe: SecretGenerationProbe

  constructor(probe: SecretGenerationProbe) {
    this.#probe = probe
  }

  async validate(targetInput: SecretTarget, lease: SecretMaterialLease): Promise<boolean> {
    let target: SecretTarget
    try {
      target = Object.freeze({
        secretRef: secretRef(targetInput.secretRef),
        generation: secretGeneration(targetInput.generation),
      })
    } catch (cause) {
      return degradeBackend(cause, false, { site: 'validate', reason: 'invalid_response' })
    }

    const singleUseLease = new SingleUseSecretMaterialLease(lease)
    try {
      await this.#probe.validate(target, singleUseLease)
      return singleUseLease.used
    } catch (cause) {
      return degradeBackend(cause, false, { site: 'validate', reason: 'source_unavailable' })
    }
  }
}

export function createScopedSecretConsequenceRuntime(
  runtime: Readonly<{ platform: SecretPlane; customer: SecretPlane }>,
): ScopedSecretConsequenceRuntime {
  const executor = (plane: SecretPlane): SecretConsequenceExecutor => Object.freeze({
    execute: async (
      input: ScopedSecretConsequenceInput,
      consequence: (lease: SecretMaterialLease) => Promise<void>,
    ): Promise<void> => {
      const canonicalSecretRef = secretRef(input.secretRef)
      await plane.withActiveSecret({ secretRef: canonicalSecretRef }, async (lease) => {
        await consequence(lease)
      })
    },
  })
  return Object.freeze({
    platform: executor(runtime.platform),
    customer: executor(runtime.customer),
  })
}
