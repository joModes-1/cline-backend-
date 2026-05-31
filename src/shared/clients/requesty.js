const REQUESTY_BASE_URL = "https://router.requesty.ai/v1";
const replaceCname = (baseUrl, type) => {
    if (type === "router") {
        return baseUrl;
    }
    else {
        return baseUrl.replace("router", type).replace("v1", "");
    }
};
export const toRequestyServiceUrl = (baseUrl, service = "router") => {
    const url = replaceCname(baseUrl || REQUESTY_BASE_URL, service);
    try {
        return new URL(url);
    }
    catch (e) {
        return undefined;
    }
};
export const toRequestyServiceStringUrl = (baseUrl, service = "router") => {
    return toRequestyServiceUrl(baseUrl, service)?.toString();
};
//# sourceMappingURL=requesty.js.map