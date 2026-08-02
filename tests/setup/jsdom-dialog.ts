import { afterEach, beforeEach, expect } from 'vitest'

type DialogMethod = 'showModal' | 'close'
type DialogDescriptors = Record<DialogMethod, PropertyDescriptor | undefined>

const dialogConstructor = globalThis.HTMLDialogElement

if (dialogConstructor !== undefined) {
  let originalDescriptors: DialogDescriptors

  beforeEach(() => {
    const prototype = dialogConstructor.prototype
    originalDescriptors = {
      showModal: Object.getOwnPropertyDescriptor(prototype, 'showModal'),
      close: Object.getOwnPropertyDescriptor(prototype, 'close'),
    }

    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
    })
    Object.defineProperty(prototype, 'close', {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open')
      },
    })
  })

  afterEach(() => {
    const prototype = dialogConstructor.prototype
    restoreDialogMethod(prototype, 'showModal', originalDescriptors.showModal)
    restoreDialogMethod(prototype, 'close', originalDescriptors.close)

    expect(Object.getOwnPropertyDescriptor(prototype, 'showModal')).toEqual(originalDescriptors.showModal)
    expect(Object.getOwnPropertyDescriptor(prototype, 'close')).toEqual(originalDescriptors.close)
  })
}

function restoreDialogMethod(
  prototype: object,
  name: DialogMethod,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(prototype, name)
    return
  }
  Object.defineProperty(prototype, name, descriptor)
}
