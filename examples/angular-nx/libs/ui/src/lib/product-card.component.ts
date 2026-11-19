import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CatalogItem } from '@sample/data';
import { toCardView } from './product-card.model';

@Component({
  selector: 'sample-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card">
      <h2>{{ view().title }}</h2>
      <p>{{ view().price }}</p>
      @if (view().badge; as badge) {
        <span class="badge">{{ badge }}</span>
      }
      <ng-content />
    </article>
  `,
  styles: `
    .card { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; }
    .badge { color: #b00020; font-weight: 600; }
  `,
})
export class ProductCardComponent {
  readonly item = input.required<CatalogItem>();
  protected readonly view = computed(() => toCardView(this.item()));
}
