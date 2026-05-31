import deepEqual from "fast-deep-equal";
import * as path from "path";
import { DiagnosticSeverity } from "@/shared/proto/index.cline";
import { Logger } from "@/shared/services/Logger";
import { getCwd } from "@/utils/path";
export function getNewDiagnostics(oldDiagnostics, newDiagnostics) {
    const oldMap = new Map();
    for (const diag of oldDiagnostics) {
        oldMap.set(diag.filePath, diag.diagnostics);
    }
    const newProblems = [];
    for (const newDiags of newDiagnostics) {
        const oldDiags = oldMap.get(newDiags.filePath) || [];
        const newProblemsForFile = newDiags.diagnostics.filter((newDiag) => !oldDiags.some((oldDiag) => deepEqual(oldDiag, newDiag)));
        if (newProblemsForFile.length > 0) {
            newProblems.push({ filePath: newDiags.filePath, diagnostics: newProblemsForFile });
        }
    }
    return newProblems;
}
// will return empty string if no problems with the given severity are found
export async function diagnosticsToProblemsString(diagnostics, severities) {
    const results = [];
    for (const fileDiagnostics of diagnostics) {
        const problems = fileDiagnostics.diagnostics.filter((d) => !severities || severities.includes(d.severity));
        const problemString = await singleFileDiagnosticsToProblemsString(fileDiagnostics.filePath, problems);
        if (problemString) {
            results.push(problemString);
        }
    }
    return results.join("\n\n");
}
export async function singleFileDiagnosticsToProblemsString(filePath, diagnostics) {
    if (!diagnostics.length) {
        return "";
    }
    const cwd = await getCwd();
    const relPath = path.relative(cwd, filePath).toPosix();
    let result = `${relPath}`;
    for (const diagnostic of diagnostics) {
        const label = severityToString(diagnostic.severity);
        // Lines are 0-indexed
        const line = diagnostic.range?.start ? `${diagnostic.range.start.line + 1}` : "";
        const source = diagnostic.source ? `${diagnostic.source} ` : "";
        result += `\n- [${source}${label}] Line ${line}: ${diagnostic.message}`;
    }
    return result;
}
function severityToString(severity) {
    switch (severity) {
        case DiagnosticSeverity.DIAGNOSTIC_ERROR:
            return "Error";
        case DiagnosticSeverity.DIAGNOSTIC_WARNING:
            return "Warning";
        case DiagnosticSeverity.DIAGNOSTIC_INFORMATION:
            return "Information";
        case DiagnosticSeverity.DIAGNOSTIC_HINT:
            return "Hint";
        default:
            Logger.warn("Unhandled diagnostic severity level:", severity);
            return "Diagnostic";
    }
}
//# sourceMappingURL=index.js.map