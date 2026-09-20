"""Pytest test case for calculator demonstration."""

from calculator import calculate_discounted_price


def test_calculate_discounted_price_standard() -> None:
    """Test standard discount deduction ($100 with $15 discount should equal $85)."""
    assert calculate_discounted_price(100.0, 15.0) == 85.0


def test_calculate_discounted_price_zero_discount() -> None:
    """Test zero discount leaves price unchanged."""
    assert calculate_discounted_price(50.0, 0.0) == 50.0
