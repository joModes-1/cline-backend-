import { getFileMentionFromPath } from "@/core/mentions";
import { singleFileDiagnosticsToProblemsString } from "@/integrations/diagnostics";
import { telemetryService } from "@/services/telemetry";
import { Logger } from "@/shared/services/Logger";
export async function fixWithCline(controller, request) {
    const filePath = request.filePath || "";
    const fileMention = await getFileMentionFromPath(filePath);
    const problemsString = await singleFileDiagnosticsToProblemsString(filePath, request.diagnostics);
    await controller.initTask(`Fix the following code in ${fileMention}
\`\`\`\n${request.selectedText}\n\`\`\`\n\nProblems:\n${problemsString}`);
    Logger.log("fixWithCline", request.selectedText, request.filePath, request.language, problemsString);
    telemetryService.captureButtonClick("codeAction_fixWithCline", controller.task?.ulid);
    return {};
}
//# sourceMappingURL=fixWithCline.js.map