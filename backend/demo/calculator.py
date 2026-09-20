"""Demo module with an intentional logic bug for BugBuster verification."""


def calculate_discounted_price(price: float, discount: float) -> float:
    """Calculates final price after subtracting the discount amount.
    
    INTENTIONAL DEFECT:
    Multiplies discount by 2, causing excessive deduction.
    Correct formula: price - discount.
    """
    if price < 0 or discount < 0:
        raise ValueError("Price and discount must be non-negative")
    return price - discount * 2
