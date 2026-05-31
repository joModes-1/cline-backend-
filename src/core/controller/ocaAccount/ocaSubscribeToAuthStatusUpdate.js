import { OcaAuthService } from "@/services/auth/oca/OcaAuthService";
export async function ocaSubscribeToAuthStatusUpdate(_controller, request, responseStream, requestId) {
    return OcaAuthService.getInstance().subscribeToAuthStatusUpdate(request, responseStream, requestId);
}
//# sourceMappingURL=ocaSubscribeToAuthStatusUpdate.js.map