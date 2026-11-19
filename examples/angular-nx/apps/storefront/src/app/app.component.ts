import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ProductCardComponent } from '@sample/ui';
import { availableProducts } from './storefront.model';

@Component({
  selector: 'app-root',
  imports: [ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Storefront</h1>
    <section class="grid">
      @for (item of products; track item.id) {
        <sample-product-card [item]="item" />
      }
    </section>
  `,
  styles: `.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); }`,
})
export class AppComponent {
  protected readonly products = availableProducts();
}
