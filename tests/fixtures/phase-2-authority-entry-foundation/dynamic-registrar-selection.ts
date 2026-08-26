import {
  narrowSystemMutation,
  protectedInteractiveMutation,
} from "../../../convex/lib/authorityRegistrars";

const useProtected = true;
export const dynamicallySelectedRegistrar = (
  useProtected ? protectedInteractiveMutation : narrowSystemMutation
) as typeof protectedInteractiveMutation;
