export class ApiError extends Error {
  constructor({ error_code, message, retryable, resource_id, corrective_action }) {
    super(message);
    this.errorCode = error_code;
    this.retryable = retryable;
    this.resourceId = resource_id;
    this.correctiveAction = corrective_action;
  }
}

async function handle(response) {
  if (response.ok) {
    return response.json();
  }
  const body = await response.json().catch(() => {
    const backendFailure = response.status >= 500;
    return {
      error_code: backendFailure ? "BACKEND_UNAVAILABLE" : "HTTP_ERROR",
      message: backendFailure
        ? `The MuleShield backend is unavailable (HTTP ${response.status}). No cached scores are shown.`
        : `The request was rejected with HTTP ${response.status}.`,
      retryable: backendFailure,
      resource_id: null,
      corrective_action: backendFailure
        ? "Retry once. If the error remains, check the hosted function logs."
        : null,
    };
  });
  throw new ApiError(body);
}

export async function apiGet(path) {
  const response = await fetch(path);
  return handle(response);
}

export async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle(response);
}
