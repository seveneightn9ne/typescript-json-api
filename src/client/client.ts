import { API, emptySchema } from "../shared/api";

let onReauth: () => void;

export function registerReauthHandler(handler: () => void) {
    onReauth = handler;
}

export async function apiFetch<Request extends object, Response extends object>(options: {
    api: API<Request, Response>,
    body?: Request,
}): Promise<Response> {
    const result = await fetch(options.api.path, {
        method: 'POST',
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (options.api.responseSchema == emptySchema && result.status == 204) {
        return null as Response;
    }
    if (result.status == 204) {
        throw new Error("Received a 204 but required a response for " + options.api.path);
    }
    if (result.status == 401) {
        if (onReauth) {
            onReauth();
            throw new Error(`Reauth required`);
        }
    }
    if (result.status != 200) {
        let r: { error?: string };
        try {
            r = await result.json();
        } catch {
            throw new Error(`API error ${result.status}`);
        }
        if (r.error) {
            throw new Error(`API error ${result.status}: ${r.error}`);
        } else {
            throw new Error(`API error ${result.status}`);
        }
    }
    if (options.api.responseSchema == emptySchema) {
        throw new Error(`Unexpected response for ${options.api.path}`);
    }
    const t = await result.text();
    return options.api.reviveResponse(t);
}
