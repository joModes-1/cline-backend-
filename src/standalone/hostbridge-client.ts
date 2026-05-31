// Stub for standalone hostbridge client - backend only version
export const HOSTBRIDGE_PORT = 0

export const createHostbridgeClient = () => ({
  workspaceClient: {
    getWorkspacePaths: async () => ({ paths: [process.cwd()] }),
  },
  envClient: {
    debugLog: ({ value }: { value: string }) => console.log(value),
  },
  windowClient: {
    showMessage: ({ type, message }: { type: number; message: string }) => {
      console.log(`[${type}] ${message}`)
    },
  },
  diffClient: {
    showDiff: async () => {},
  },
})
