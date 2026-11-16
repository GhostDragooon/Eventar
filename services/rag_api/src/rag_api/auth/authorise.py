_ROLES = {"eventar_staff", "body_admin"}
_USE_CASES = {"rule_lookup", "source_location", "version_comparison", "pack_authoring_support"}


def authorise(role: str, use_case: str) -> bool:
    return role in _ROLES and use_case in _USE_CASES
