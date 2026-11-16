import pytest

from rag_api.auth.authorise import authorise

ROLES = ["eventar_staff", "body_admin", "organiser_admin", "organiser_member", "auditor"]
USE_CASES = ["rule_lookup", "source_location", "version_comparison", "pack_authoring_support"]


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("use_case", USE_CASES)
def test_role_by_use_case(role, use_case):
    assert authorise(role, use_case) is (role in {"eventar_staff", "body_admin"})


def test_unknown_use_case_false():
    assert authorise("eventar_staff", "something_else") is False
