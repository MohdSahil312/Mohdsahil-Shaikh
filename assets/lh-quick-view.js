/**
 * Loomhaus — <lh-quick-view>
 * Opens from any [data-lh-quick-view="<json id>"] hotspot, fills the popup
 * from the product JSON, handles colour + size selection and adds the chosen
 * variant with the Cart AJAX API (LH.cart), then opens the cart drawer.
 * Closes on the close icon, a click outside (overlay) or Escape (LH.panels).
 */
(function () {
  'use strict';
  if (customElements.get('lh-quick-view')) return;

  class LhQuickView extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector('.lh-qv__dialog');
      this.overlay = this.querySelector('.lh-overlay');
      this.sizeSelect = this.querySelector('[data-qv-size]');
      this.error = this.querySelector('[data-qv-error]');
      this.addButton = this.querySelector('[data-qv-add]');

      this.addEventListener('click', (event) => {
        if (event.target.closest('[data-close]')) window.LH.panels.close(this);
        const color = event.target.closest('[data-qv-color]');
        if (color) this.selectColor(color.dataset.qvColor);
      });
      this.sizeSelect.addEventListener('change', () => {
        this.sizeSelect.classList.add('is-chosen');
        this.clearError();
        this.updatePrice();
      });
      this.addButton.addEventListener('click', () => this.addToCart());
      this.dialog.addEventListener('keydown', (event) => this.trapFocus(event));

      // One listener for every hotspot on the page (event delegation)
      document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-lh-quick-view]');
        if (!trigger) return;
        event.preventDefault();
        this.openFor(trigger.dataset.lhQuickView);
      });
    }

    /* ---------- Open / close (called by LH.panels) ---------- */
    openFor(dataId) {
      const source = document.getElementById(dataId);
      if (!source) return;
      this.product = JSON.parse(source.textContent);
      this.colorIndex = this.findOption('color');
      this.sizeIndex = this.findOption('size');
      this.fill();
      window.LH.panels.open(this);
    }

    show() {
      this.dialog.hidden = false;
      this.overlay.classList.add('is-open');
      requestAnimationFrame(() => {
        this.classList.add('is-open');
        this.dialog.focus({ preventScroll: true });
      });
    }

    hide() {
      this.classList.remove('is-open');
      this.overlay.classList.remove('is-open');
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        if (!this.classList.contains('is-open')) this.dialog.hidden = true;
      }, 260);
    }

    /* ---------- Rendering ---------- */
    findOption(name) {
      const index = this.product.options.findIndex((o) => o.name.toLowerCase() === name);
      return index === -1 ? null : index;
    }

    fill() {
      const p = this.product;
      this.querySelector('[data-qv-title]').textContent = p.title;
      this.querySelector('[data-qv-desc]').textContent = p.description;
      this.querySelector('[data-qv-desc]').hidden = !p.description;

      // Colour buttons
      const colorGroup = this.querySelector('[data-qv-color-group]');
      colorGroup.hidden = this.colorIndex === null;
      const colors = this.querySelector('[data-qv-colors]');
      colors.innerHTML = '';
      if (this.colorIndex !== null) {
        p.options[this.colorIndex].values.forEach((value) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'lh-qv__color';
          button.dataset.qvColor = value.name;
          button.setAttribute('aria-pressed', 'false');
          const dot = document.createElement('span');
          dot.className = 'lh-qv__dot';
          if (value.swatch) dot.style.setProperty('--swatch', value.swatch);
          button.append(dot, document.createTextNode(value.name));
          colors.appendChild(button);
        });
      }

      // Size select (placeholder first, like the design)
      const sizeGroup = this.querySelector('[data-qv-size-group]');
      sizeGroup.hidden = this.sizeIndex === null;
      this.sizeSelect.innerHTML = ''; // forget the size chosen for the previous product
      this.sizeSelect.classList.remove('is-chosen');
      this.clearError();

      // Default colour: the first variant that is available
      const first = p.variants.find((v) => v.available) || p.variants[0];
      this.selectColor(this.colorIndex !== null ? first.options[this.colorIndex] : null);
    }

    selectColor(color) {
      this.color = color;
      this.querySelectorAll('[data-qv-color]').forEach((el) => {
        el.setAttribute('aria-pressed', String(el.dataset.qvColor === color));
      });
      this.renderSizes();
      this.updatePrice();
    }

    /** Rebuilds the size list for the selected colour; sold-out sizes are disabled. */
    renderSizes() {
      if (this.sizeIndex === null) return;
      const keep = this.sizeSelect.value;
      const select = this.sizeSelect;
      select.innerHTML = '';
      const placeholder = new Option('Choose your size', '', true, !keep);
      placeholder.disabled = true;
      select.add(placeholder);

      this.product.options[this.sizeIndex].values.forEach((value) => {
        const variant = this.variantFor(this.color, value.name);
        const available = Boolean(variant && variant.available);
        const option = new Option(available ? value.name : value.name + ' — Sold out', value.name);
        option.disabled = !available;
        option.selected = available && value.name === keep;
        select.add(option);
      });
      if (!select.value) {
        select.selectedIndex = 0;
        select.classList.remove('is-chosen');
      }
    }

    variantFor(color, size) {
      return this.product.variants.find(
        (v) =>
          (this.colorIndex === null || v.options[this.colorIndex] === color) &&
          (this.sizeIndex === null || size == null || v.options[this.sizeIndex] === size)
      );
    }

    currentVariant() {
      const size = this.sizeIndex === null ? null : this.sizeSelect.value || null;
      if (this.sizeIndex !== null && !size) return null;
      return this.variantFor(this.color, size);
    }

    /** Price and image follow the chosen variant (variant prices can differ). */
    updatePrice() {
      const exact = this.currentVariant();
      const shown =
        exact ||
        this.product.variants.find(
          (v) => (this.colorIndex === null || v.options[this.colorIndex] === this.color) && v.available
        ) ||
        this.variantFor(this.color, null) ||
        this.product.variants[0];

      this.querySelector('[data-qv-price]').textContent = window.LH.formatMoney(shown.price);
      const image = this.querySelector('[data-qv-image]');
      image.src = shown.image || this.product.image;
      image.alt = this.product.title + (this.color ? ' in ' + this.color.toLowerCase() : '');

      const available = exact ? exact.available : true;
      this.addButton.disabled = !available;
      this.querySelector('[data-qv-add-label]').textContent = available
        ? window.LH_CONFIG.strings.addToCart
        : window.LH_CONFIG.strings.soldOut;
    }

    /* ---------- Add to cart ---------- */
    addToCart() {
      const variant = this.currentVariant();
      if (!variant) {
        this.error.hidden = false;
        this.sizeSelect.classList.add('is-error');
        this.sizeSelect.focus();
        return;
      }
      this.addButton.setAttribute('aria-busy', 'true');
      window.LH.cart
        .add([{ id: variant.id, quantity: 1 }])
        .then(() => window.LH.cart.openDrawer()) // opening the drawer also closes this popup
        .catch((error) => window.LH.toast(error.message || window.LH_CONFIG.strings.cartError))
        .finally(() => this.addButton.removeAttribute('aria-busy'));
    }

    clearError() {
      this.error.hidden = true;
      this.sizeSelect.classList.remove('is-error');
    }

    /* ---------- Keep keyboard focus inside the popup ---------- */
    trapFocus(event) {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        this.dialog.querySelectorAll('button:not([disabled]), select, a[href], [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  customElements.define('lh-quick-view', LhQuickView);
})();
