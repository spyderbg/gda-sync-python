class AppError(Exception):
    """An error whose message is safe to show in the application."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def error_message(error: BaseException) -> str:
    return error.message if isinstance(error, AppError) else str(error) or type(error).__name__
