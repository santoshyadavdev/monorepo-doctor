package example.catalog.internal;

public final class Rounding {
  private Rounding() {}

  public static long toCents(double amount) {
    return Math.round(amount * 100);
  }
}
