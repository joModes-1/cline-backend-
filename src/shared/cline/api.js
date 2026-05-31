var CLINE_API_AUTH_ENDPOINTS;
(function (CLINE_API_AUTH_ENDPOINTS) {
    CLINE_API_AUTH_ENDPOINTS["AUTH"] = "/api/v1/auth/authorize";
    CLINE_API_AUTH_ENDPOINTS["REFRESH_TOKEN"] = "/api/v1/auth/refresh";
})(CLINE_API_AUTH_ENDPOINTS || (CLINE_API_AUTH_ENDPOINTS = {}));
var CLINE_API_ENDPOINT_V1;
(function (CLINE_API_ENDPOINT_V1) {
    CLINE_API_ENDPOINT_V1["TOKEN_EXCHANGE"] = "/api/v1/auth/token";
    CLINE_API_ENDPOINT_V1["USER_INFO"] = "/api/v1/users/me";
    CLINE_API_ENDPOINT_V1["ACTIVE_ACCOUNT"] = "/api/v1/users/active-account";
    CLINE_API_ENDPOINT_V1["REMOTE_CONFIG"] = "/api/v1/organizations/{id}/remote-config";
    CLINE_API_ENDPOINT_V1["API_KEYS"] = "/api/v1/organizations/{id}/api-keys";
})(CLINE_API_ENDPOINT_V1 || (CLINE_API_ENDPOINT_V1 = {}));
export const CLINE_API_ENDPOINT = {
    ...CLINE_API_AUTH_ENDPOINTS,
    ...CLINE_API_ENDPOINT_V1,
};
//# sourceMappingURL=api.js.map