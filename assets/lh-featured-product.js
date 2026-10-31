/**
 * Loomhaus — <lh-featured-product>
 * Colour swatches, size pills, quantity, gallery (arrows, thumbnails, swipe on
 * mobile), Add to cart (Cart AJAX API via LH.cart), Buy it now (cart permalink
 * straight to checkout) and offer code copy.
 *
 * All prices, "Save X%" and "Get it for" values are pre-computed in Liquid for
 * every variant (see the JSON in sections/lh-featured-product.liquid); this
 * script only picks the matching variant and swaps the text.
 */
(function () {
  'use strict';
  if (customElements.get('lh-featured-product')) return;

  class LhFeaturedProduct extends HTMLElement {
    connectedCallback() {
      const data = JSON.parse(this.querySelector('[data-variants]').textContent);
      this.variants = data.variants;
      this.colorIndex = data.colorIndex;
      this.sizeIndex = data.sizeIndex;
      this.variant = this.variants.find((v) => v.id === data.current) || this.variants[0];
      this.quantity = 1;
      this.slideIndex = 0;

      this.track = this.querySelector('[data-track]');
      this.thumbs = Array.from(this.querySelectorAll('.lh-feat__thumb'));
      this.dots = Array.from(this.querySelectorAll('.lh-feat__dot'));

      this.addEventListener('click', this.onClick.bind(this));
      if (this.track) {
        this.track.addEventListener('scroll', this.onScroll.bind(this), { passive: true });
        this.track.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowRight') this.goTo(this.slideIndex + 1);
          if (event.key === 'ArrowLeft') this.goTo(this.slideIndex - 1);
        });
      }
    }

    /* ---------- Events ---------- */
    onClick(event) {
      const swatch = event.target.closest('[data-color]');
      const pill = event.target.closest('[data-size]');
      const step = event.target.closest('[data-step]');
      const thumb = event.target.closest('.lh-feat__thumb');
      const qty = event.target.closest('[data-qty]');
      const copy = event.target.closest('[data-copy]');

      if (swatch) this.selectOption(this.colorIndex, swatch.dataset.color);
      else if (pill && !pill.disabled) this.selectOption(this.sizeIndex, pill.dataset.size);
      else if (step) this.goTo(this.slideIndex + parseInt(step.dataset.step, 10));
      else if (thumb) this.goTo(parseInt(thumb.dataset.index, 10));
      else if (qty) this.changeQuantity(parseInt(qty.dataset.qty, 10));
      else if (event.target.closest('[data-add]')) this.addToCart(event.target.closest('[data-add]'));
      else if (event.target.closest('[data-buy-now]')) this.buyNow();
      else if (copy) this.copyCode(copy);
    }

    /* ---------- Variant selection ---------- */
    selectOption(index, value) {
      if (index === null) return;
      const wanted = this.variant.options.slice();
      wanted[index] = value;

      let match = this.findVariant(wanted);
      // Colour changed to a combination that is sold out: keep the colour, pick an available size.
      if ((!match || !match.available) && index === this.colorIndex) {
        match =
          this.variants.find((v) => v.options[this.colorIndex] === value && v.available) || match;
      }
      if (!match) return;
      this.variant = match;
      this.render(index === this.colorIndex);
    }

    findVariant(options) {
      return this.variants.find((v) => v.options.every((opt, i) => opt === options[i]));
    }

    render(colorChanged) {
      const v = this.variant;
      const color = this.colorIndex !== null ? v.options[this.colorIndex] : null;
      const size = this.sizeIndex !== null ? v.options[this.sizeIndex] : null;

      // Swatches + label
      this.querySelectorAll('[data-color]').forEach((el) => {
        el.setAttribute('aria-pressed', String(el.dataset.color === color));
      });
      const colorLabel = this.querySelector('[data-color-label]');
      if (colorLabel && color) colorLabel.textContent = color.toUpperCase();

      // Size pills: selected state, sold-out state and ribbon for the current colour
      this.querySelectorAll('[data-size]').forEach((pill) => {
        const options = v.options.slice();
        options[this.sizeIndex] = pill.dataset.size;
        const pillVariant = this.findVariant(options);
        pill.disabled = !pillVariant || !pillVariant.available;
        pill.setAttribute('aria-pressed', String(pill.dataset.size === size));
        const ribbon = pill.querySelector('[data-ribbon]');
        if (ribbon) {
          const text = pillVariant ? pillVariant.ribbon : '';
          ribbon.textContent = text;
          ribbon.hidden = !text;
        }
      });

      // Price, compare-at, save badge (all formatted/calculated in Liquid)
      this.querySelector('[data-price]').textContent = v.price;
      const compare = this.querySelector('[data-compare]');
      compare.hidden = !v.compare;
      if (v.compare) compare.textContent = v.compare;
      const save = this.querySelector('[data-save]');
      save.hidden = !v.save;
      this.querySelector('[data-save-value]').textContent = v.save;

      // Offer cards
      this.querySelectorAll('[data-offer-price]').forEach((el) => {
        const price = v.offers[parseInt(el.dataset.offerPrice, 10)];
        if (price) el.textContent = price;
      });

      // Buttons
      const add = this.querySelector('[data-add]');
      add.disabled = !v.available;
      this.querySelector('[data-add-label]').textContent = v.available
        ? window.LH_CONFIG.strings.addToCart
        : window.LH_CONFIG.strings.soldOut;
      this.querySelector('[data-buy-now]').disabled = !v.available;

      // Show the variant's image when the colour changes
      if (colorChanged && v.mediaIndex !== null) this.goTo(v.mediaIndex);
    }

    /* ---------- Gallery ---------- */
    goTo(index) {
      if (!this.track) return;
      const count = this.track.children.length;
      this.slideIndex = (index + count) % count;
      this.track.scrollTo({ left: this.slideIndex * this.track.clientWidth });
      this.updateGalleryState();
    }

    onScroll() {
      const index = Math.round(this.track.scrollLeft / this.track.clientWidth);
      if (index !== this.slideIndex) {
        this.slideIndex = index;
        this.updateGalleryState();
      }
    }

    updateGalleryState() {
      this.thumbs.forEach((thumb, i) => {
        const active = i === this.slideIndex;
        thumb.setAttribute('aria-current', String(active));
        // Keep the active thumbnail visible inside its own scroll row (no page scroll)
        const row = thumb.parentElement;
        if (active && row) {
          const left = thumb.offsetLeft - row.offsetLeft;
          if (left < row.scrollLeft) row.scrollLeft = left;
          else if (left + thumb.offsetWidth > row.scrollLeft + row.clientWidth) {
            row.scrollLeft = left + thumb.offsetWidth - row.clientWidth;
          }
        }
      });
      this.dots.forEach((dot, i) => dot.classList.toggle('is-active', i === this.slideIndex));
    }

    /* ---------- Quantity ---------- */
    changeQuantity(step) {
      this.quantity = Math.min(99, Math.max(1, this.quantity + step));
      this.querySelector('[data-qty-value]').textContent = String(this.quantity).padStart(2, '0');
      this.querySelector('[data-qty="-1"]').disabled = this.quantity <= 1;
    }

    /* ---------- Cart ---------- */
    addToCart(button) {
      if (!window.LH || button.disabled) return;
      button.setAttribute('aria-busy', 'true');
      window.LH.cart
        .add([{ id: this.variant.id, quantity: this.quantity }])
        .then(() => window.LH.cart.openDrawer())
        .catch((error) => window.LH.toast(error.message || window.LH_CONFIG.strings.cartError))
        .finally(() => button.removeAttribute('aria-busy'));
    }

    /** Cart permalink: goes straight to checkout with only the selected variant
     *  (plus the auto-added jacket when the special rule applies). */
    buyNow() {
      const v = this.variant;
      if (!v.available) return;
      const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      const items = [v.id + ':' + this.quantity];
      const gift =
        window.LH &&
        window.LH.cart.giftFor(
          this.colorIndex !== null ? v.options[this.colorIndex] : '',
          this.sizeIndex !== null ? v.options[this.sizeIndex] : '',
          parseInt(this.dataset.productId, 10)
        );
      if (gift) items.push(gift + ':1');
      window.location.href = root + 'cart/' + items.join(',');
    }

    /* ---------- Offer code copy ---------- */
    copyCode(button) {
      const code = button.dataset.copy;
      const done = () => {
        button.classList.add('is-copied');
        clearTimeout(button._copyTimer);
        button._copyTimer = setTimeout(() => button.classList.remove('is-copied'), 2000);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(done, () => this.fallbackCopy(code, done));
      } else {
        this.fallbackCopy(code, done);
      }
    }

    fallbackCopy(code, done) {
      const input = document.createElement('textarea');
      input.value = code;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy');
        done();
      } catch (error) {
        window.LH && window.LH.toast(code);
      }
      input.remove();
    }
  }

  customElements.define('lh-featured-product', LhFeaturedProduct);
})();
