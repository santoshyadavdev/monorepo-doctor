package example.app;

import example.catalog.Catalog;

public final class CatalogTest {
  public static void main(String[] args) {
    if (Catalog.totalCents(12.345) != 1235) {
      throw new AssertionError("total should be rounded to cents");
    }
  }
}
