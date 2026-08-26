from fastapi.responses import JSONResponse


def error_response(status_code: int, error_code: str, message: str, retryable: bool, resource_id: str | None = None, corrective_action: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error_code": error_code,
            "message": message,
            "retryable": retryable,
            "resource_id": resource_id,
            "corrective_action": corrective_action,
        },
    )
