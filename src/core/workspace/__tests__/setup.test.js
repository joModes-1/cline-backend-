import { VcsType } from "@shared/multi-root/types";
import { expect } from "chai";
import * as path from "path";
import sinon from "sinon";
import { HostProvider } from "@/hosts/host-provider";
import * as telemetry from "@/services/telemetry";
import * as pathUtils from "@/utils/path";
import { setupWorkspaceManager } from "../setup";
import { WorkspaceRootManager } from "../WorkspaceRootManager";
describe("setupWorkspaceManager", () => {
    const sandbox = sinon.createSandbox();
    let fakeTelemetry;
    const cwd = "/Users/test/project";
    const defaultRoots = [
        { path: "/ws/root1", name: "root1", vcs: VcsType.Git, commitHash: "abc" },
        { path: "/ws/root2", name: "root2", vcs: VcsType.None },
    ];
    // Minimal stateManager stub with behavior we assert
    const makeStateManager = ({ multiRootEnabled = true, savedRoots, savedPrimaryIndex = 0, }) => {
        const state = {};
        return {
            getGlobalStateKey: (key) => {
                switch (key) {
                    case "multiRootEnabled":
                        return multiRootEnabled;
                    case "workspaceRoots":
                        return savedRoots;
                    case "primaryRootIndex":
                        return savedPrimaryIndex;
                    default:
                        return undefined;
                }
            },
            setGlobalState: (key, value) => {
                switch (key) {
                    case "workspaceRoots":
                        state.roots = value;
                        break;
                    case "primaryRootIndex":
                        state.primaryIndex = value;
                        break;
                }
            },
            // for assertions
            _state: state,
        };
    };
    beforeEach(() => {
        // Stub out path utils for stable behavior
        sandbox.stub(pathUtils, "getDesktopDir").returns("/Users/test/Desktop");
        sandbox.stub(pathUtils, "getCwd").resolves(cwd);
        // Stub HostProvider window + workspace methods used by setup() error path
        sandbox.stub(HostProvider, "window").value({
            showMessage: sandbox.stub().resolves({ selectedOption: undefined }),
            openSettings: sandbox.stub().resolves(),
            getVisibleTabs: sandbox.stub().resolves({ paths: [] }),
            getOpenTabs: sandbox.stub().resolves({ paths: [] }),
        });
        sandbox.stub(HostProvider, "workspace").value({
            getWorkspacePaths: sandbox.stub().resolves({ paths: ["/ws/root1", "/ws/root2"] }),
        });
        // Telemetry stubs via getTelemetryService proxy
        fakeTelemetry = {
            captureWorkspaceInitialized: sandbox.stub(),
            captureWorkspaceInitError: sandbox.stub(),
        };
        sandbox.stub(telemetry, "getTelemetryService").resolves(fakeTelemetry);
        // Stub WorkspaceRootManager.fromLegacyCwd to be deterministic
        sandbox.stub(WorkspaceRootManager, "fromLegacyCwd").callsFake(async (legacyCwd) => {
            // emulate single-root manager with cwd as only root
            return new WorkspaceRootManager([{ path: legacyCwd, name: path.basename(legacyCwd), vcs: VcsType.None }], 0);
        });
    });
    afterEach(() => {
        sandbox.restore();
    });
    it("initializes multi-root manager when multi-root is enabled and persists roots + primary index", async () => {
        const stateManager = makeStateManager({ multiRootEnabled: true });
        const detectRoots = sandbox.stub().resolves(defaultRoots);
        // Multi-root workspace is now always enabled, no feature flag stub needed
        const manager = await setupWorkspaceManager({
            stateManager: stateManager,
            historyItem: undefined,
            detectRoots,
        });
        // detectRoots used
        expect(detectRoots.calledOnce).to.equal(true);
        // manager configured with multi roots
        expect(manager.getRoots()).to.have.length(2);
        expect(manager.getPrimaryIndex()).to.equal(0);
        // persisted to state
        expect(stateManager._state.roots).to.have.length(2);
        expect(stateManager._state.primaryIndex).to.equal(0);
        // telemetry captured (skipped assertion in unit tests)
    });
    it("uses single-root cwd when history restore is disabled (historyItem present)", async () => {
        const savedRoots = [{ path: "/saved/root", name: "saved", vcs: VcsType.None }];
        const stateManager = makeStateManager({ multiRootEnabled: false, savedRoots, savedPrimaryIndex: 0 });
        const detectRoots = sandbox.stub().resolves(defaultRoots); // not used
        const manager = await setupWorkspaceManager({
            stateManager: stateManager,
            historyItem: { id: "h1", ulid: "u1" },
            detectRoots,
        });
        // detectRoots not used
        expect(detectRoots.called).to.equal(false);
        // current design: single-root path uses cwd (stubbed earlier to "/Users/test/project")
        expect(manager.getRoots()).to.have.length(1);
        expect(manager.getRoots()[0].path).to.equal(cwd);
        // state persisted
        expect(stateManager._state.roots?.[0].path).to.equal(cwd);
    });
    it("falls back to fromLegacyCwd in single-root mode when no saved state", async () => {
        const stateManager = makeStateManager({
            multiRootEnabled: false,
            savedRoots: undefined,
        });
        const detectRoots = sandbox.stub().resolves(defaultRoots); // not used
        const manager = await setupWorkspaceManager({
            stateManager: stateManager,
            historyItem: { id: "h2", ulid: "u2" },
            detectRoots,
        });
        expect(detectRoots.called).to.equal(false);
        expect(manager.getRoots()).to.have.length(1);
        expect(manager.getRoots()[0].path).to.equal(cwd);
        // persisted
        expect(stateManager._state.roots?.[0].path).to.equal(cwd);
        // telemetry called (skipped assertion in unit tests)
    });
    it("gracefully handles errors and falls back to fromLegacyCwd while warning user", async () => {
        // Multi-root enabled but detectRoots throws
        const stateManager = makeStateManager({ multiRootEnabled: true });
        const detectRoots = sandbox.stub().rejects(new Error("boom"));
        // Multi-root workspace is now always enabled, no feature flag stub needed
        const manager = await setupWorkspaceManager({
            stateManager: stateManager,
            historyItem: undefined,
            detectRoots,
        });
        // fell back to single-root manager from legacy cwd
        expect(manager.getRoots()).to.have.length(1);
        expect(manager.getRoots()[0].path).to.equal(cwd);
        // telemetry error captured (skipped assertion in unit tests)
        // persisted fallback state
        expect(stateManager._state.roots?.[0].path).to.equal(cwd);
        // message shown to user
        const showMessageSpy = HostProvider.window.showMessage;
        expect(showMessageSpy.calledOnce).to.equal(true);
        const msg = showMessageSpy.getCall(0).args[0];
        expect(msg?.message || "").to.match(/Failed to initialize workspace/i);
    });
});
//# sourceMappingURL=setup.test.js.map