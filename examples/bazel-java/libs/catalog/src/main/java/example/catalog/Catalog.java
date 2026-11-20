package example.catalog;

import example.catalog.internal.Rounding;

public final class Catalog {
  private Catalog() {}

  public static long totalCents(double amount) {
    return Rounding.toCents(amount);
  }
}
