import { openImage as openImageIntegration } from "@integrations/misc/open-file";
import { Empty } from "@shared/proto/cline/common";
/**
 * Opens an image in the system viewer
 * @param controller The controller instance
 * @param request The request message containing the image path or data URI in the 'value' field
 * @returns Empty response
 */
export async function openImage(_controller, request) {
    if (request.value) {
        await openImageIntegration(request.value);
    }
    return Empty.create();
}
//# sourceMappingURL=openImage.js.map