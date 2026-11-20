package example.app;

import example.catalog.Catalog;

public final class Main {
  public static void main(String[] args) {
    System.out.println("Total cents: " + Catalog.totalCents(12.345));
  }
}
