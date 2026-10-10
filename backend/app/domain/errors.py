class DomainError(Exception):
    """Base for errors the API turns into a 4xx response."""


class NotFound(DomainError):
    pass


class Invalid(DomainError):
    pass
