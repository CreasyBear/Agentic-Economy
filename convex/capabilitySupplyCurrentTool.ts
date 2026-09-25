import { internalQuery, internalMutation } from './_generated/server'
import {
  readExactSellerCanaryOperationSnapshotArgs,
  readExactSellerCanaryOperationSnapshotResult,
  readExactSellerCanaryOperationSnapshotHandler,
} from './lib/capabilitySupply/currentTool/sellerCanary'
import {
  readManagedX402InspectionSnapshotArgs,
  readManagedX402InspectionSnapshotResult,
  readManagedX402InspectionSnapshotHandler,
  recordManagedX402InspectionArgs,
  recordManagedX402InspectionResult,
  recordManagedX402InspectionHandler,
} from './lib/capabilitySupply/currentTool/inspection'

export const readExactSellerCanaryOperationSnapshot = internalQuery({
  args: readExactSellerCanaryOperationSnapshotArgs,
  returns: readExactSellerCanaryOperationSnapshotResult,
  handler: readExactSellerCanaryOperationSnapshotHandler,
})

export const readManagedX402InspectionSnapshot = internalQuery({
  args: readManagedX402InspectionSnapshotArgs,
  returns: readManagedX402InspectionSnapshotResult,
  handler: readManagedX402InspectionSnapshotHandler,
})

export const recordManagedX402Inspection = internalMutation({
  args: recordManagedX402InspectionArgs,
  returns: recordManagedX402InspectionResult,
  handler: recordManagedX402InspectionHandler,
})
