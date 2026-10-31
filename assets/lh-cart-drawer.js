/**
 * Loomhaus — <lh-cart-drawer>
 * Open/close (through LH.panels) and the line item actions. Every change goes
 * through LH.cart.change (Cart AJAX API), which also applies the auto-add rule
 * and re-renders the drawer body via the Section Rendering API.
 */
(function () {
  'use strict';
  if (customElements.get('lh-cart-drawer')) return;

  class LhCartDrawer extends HTMLElement {
    connectedCallback() {
      this.panel = this.querySelector('.lh-drawer__panel');
      this.overlay = this.querySelector('.lh-overlay');
      this.addEventListener('click', this.onClick.bind(this));
    }

    show() {
      this.overlay.classList.add('is-open');
      this.classList.add('is-open');
      requestAnimationFrame(() => this.panel.focus({ preventScroll: true }));
    }

    hide() {
      this.overlay.classList.remove('is-open');
      this.classList.remove('is-open');
    }

    onClick(event) {
      if (event.target.closest('[data-close]')) {
        window.LH.panels.close(this);
        return;
      }
      const line = event.target.closest('[data-key]');
      if (!line) return;

      const qtyButton = event.target.closest('[data-qty-change]');
      const removeButton = event.target.closest('[data-remove]');
      if (qtyButton && !qtyButton.disabled) {
        const current = parseInt(line.querySelector('[data-qty-value]').textContent, 10) || 0;
        this.update(line.dataset.key, current + parseInt(qtyButton.dataset.qtyChange, 10), false);
      } else if (removeButton) {
        // Removing the auto-added item itself must not re-trigger the rule
        this.update(line.dataset.key, 0, removeButton.hasAttribute('data-auto'));
      }
    }

    update(key, quantity, isAutoLine) {
      const body = this.querySelector('[data-lh-drawer-body]');
      body.setAttribute('aria-busy', 'true');
      window.LH.cart
        .change(key, Math.max(0, quantity), isAutoLine)
        .catch((error) => {
          window.LH.toast(error.message || window.LH_CONFIG.strings.cartError);
          const current = this.querySelector('[data-lh-drawer-body]');
          if (current) current.removeAttribute('aria-busy');
        });
      // On success the body is replaced with a fresh render (no busy flag).
    }
  }

  customElements.define('lh-cart-drawer', LhCartDrawer);
})();
