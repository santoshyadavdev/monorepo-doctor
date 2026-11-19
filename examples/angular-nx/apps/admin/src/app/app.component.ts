import { ChangeDetectionStrategy, Component } from '@angular/core';
import { getCatalog } from '@sample/data';
import { ProductCardComponent } from '@sample/ui';
import { summarizeCatalog } from './admin.model';

@Component({
  selector: 'app-root',
  imports: [ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Catalog admin</h1>
    <p>{{ summary.items }} products · {{ summary.unitsInStock }} units · {{ summary.stockValue }} in stock</p>
    <section class="grid">
      @for (item of catalog; track item.id) {
        <sample-product-card [item]="item">
          <small>{{ item.stock }} in warehouse</small>
        </sample-product-card>
      }
    </section>
  `,
  styles: `.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); }`,
})
export class AppComponent {
  protected readonly catalog = getCatalog();
  protected readonly summary = summarizeCatalog();
}
