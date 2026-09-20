"""Pytest test case for calculator demonstration."""

import pytest
from calculator import calculate_discounted_price, calculate_total


# 1. Failing test case pinpointing intentional defect:
def test_calculate_total():
    """Assertion: calculate_total(100, 10) == 90.
    With bug (price - discount * 2): 100 - 20 = 80 != 90 (FAIL).
    With fix (price - discount): 100 - 10 = 90 == 90 (PASS).
    """
    assert calculate_total(100, 10) == 90


# 8 passing test cases:
def test_calculate_total_zero_discount():
    assert calculate_total(50, 0) == 50

def test_calculate_total_large_price():
    assert calculate_total(1000, 0) == 1000

def test_calculate_discounted_price_zero_discount():
    assert calculate_discounted_price(50.0, 0.0) == 50.0

def test_calculate_discounted_price_negative_price():
    with pytest.raises(ValueError):
        calculate_discounted_price(-10.0, 5.0)

def test_calculate_discounted_price_negative_discount():
    with pytest.raises(ValueError):
        calculate_discounted_price(100.0, -5.0)

def test_calculate_total_identity():
    assert calculate_total(0, 0) == 0

def test_calculate_total_fractional():
    assert calculate_total(20.5, 0.0) == 20.5

def test_calculate_total_float_precision():
    assert calculate_total(100.0, 0.0) == 100.0
