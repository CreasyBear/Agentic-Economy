import { query } from "./_generated/server";

const sharedRegistration = query({
  args: {},
  handler: async () => null,
});

export {
  sharedRegistration as duplicateExportOne,
  sharedRegistration as duplicateExportTwo,
};
