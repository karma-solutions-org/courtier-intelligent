import { DestroyRef, Directive, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTabGroup } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Keeps the selected tab of a mat-tab-group in the URL (?tab=N),
 * so a page refresh reopens the same tab.
 */
@Directive({ selector: 'mat-tab-group[appTabQueryParam]' })
export class TabQueryParamDirective implements OnInit {
  private readonly tabGroup = inject(MatTabGroup);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const index = Number(this.route.snapshot.queryParamMap.get('tab'));
    if (Number.isInteger(index) && index > 0) {
      this.tabGroup.selectedIndex = index;
    }

    this.tabGroup.selectedIndexChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((tab) => {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: tab || null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }
}
