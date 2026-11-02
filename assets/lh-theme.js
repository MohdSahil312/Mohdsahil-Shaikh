/**
 * Loomhaus — shared JavaScript (vanilla, no dependencies)
 * ------------------------------------------------------------------
 * window.LH exposes:
 *   LH.formatMoney(cents)   format cents with the store's money format
 *   LH.toast(message)       short feedback message
 *   LH.panels               open/close helper for the quick view and cart drawer
 *                           (one panel at a time, body scroll lock, Escape, focus return)
 *   LH.cart                 Cart AJAX API wrapper: add / change, the "auto-add" rule,
 *                           and re-rendering of the cart drawer through the
 *                           Section Rendering API.
 */
(function () {
  'use strict';

  const config = window.LH_CONFIG || {};
  const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  /* ------------------------------------------------------------------ */
  /* Money                                                              */
  /* ------------------------------------------------------------------ */
  function formatWithDelimiters(cents, precision, thousands, decimal) {
    if (isNaN(cents) || cents == null) return '0';
    const fixed = (cents / 100).toFixed(precision);
    const parts = fixed.split('.');
    const whole = parts[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1' + thousands);
    return parts[1] ? whole + decimal + parts[1] : whole;
  }

  function formatMoney(cents) {
    const format = config.moneyFormat || '{{amount}}';
    const value = typeof cents === 'string' ? parseInt(cents.replace('.', ''), 10) : cents;
    return format.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, key) {
      switch (key) {
        case 'amount_no_decimals':
          return formatWithDelimiters(value, 0, ',', '.');
        case 'amount_with_comma_separator':
          return formatWithDelimiters(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return formatWithDelimiters(value, 0, '.', ',');
        case 'amount_with_apostrophe_separator':
          return formatWithDelimiters(value, 2, "'", '.');
        default:
          return formatWithDelimiters(value, 2, ',', '.');
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                              */
  /* ------------------------------------------------------------------ */
  let toastEl;
  let toastTimer;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'lh-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, 2500);
  }

  /* ------------------------------------------------------------------ */
  /* Panels (quick view + cart drawer)                                  */
  /* ------------------------------------------------------------------ */
  const panels = {
    current: null,
    returnFocus: null,

    /** @param {HTMLElement} panel element exposing show()/hide() */
    open(panel) {
      if (this.current && this.current !== panel) this.current.hide();
      if (!this.current) this.returnFocus = document.activeElement;
      this.current = panel;
      panel.show();
      document.body.classList.add('lh-locked');
    },

    close(panel) {
      const target = panel || this.current;
      if (!target) return;
      target.hide();
      if (this.current === target) {
        this.current = null;
        document.body.classList.remove('lh-locked');
        if (this.returnFocus && typeof this.returnFocus.focus === 'function') {
          this.returnFocus.focus({ preventScroll: true });
        }
        this.returnFocus = null;
      }
    },
  };

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && panels.current) panels.close();
  });

  /* ------------------------------------------------------------------ */
  /* Cart (Cart AJAX API + Section Rendering API)                       */
  /* ------------------------------------------------------------------ */
  const DRAWER_SECTION = 'lh-cart-drawer';

  function postJSON(url, body) {
    return fetch(root + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          const error = new Error(data.description || data.message || 'Cart error');
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  /** Reads the auto-add rule settings rendered by the cart drawer section. */
  function ruleSettings() {
    const drawer = document.querySelector('lh-cart-drawer');
    if (!drawer) return null;
    const giftVariantId = parseInt(drawer.dataset.giftVariantId, 10);
    if (!giftVariantId) return null;
    return {
      giftVariantId: giftVariantId,
      giftProductId: parseInt(drawer.dataset.giftProductId, 10),
      colorName: (drawer.dataset.colorOption || 'Color').toLowerCase(),
      sizeName: (drawer.dataset.sizeOption || 'Size').toLowerCase(),
      triggerColor: (drawer.dataset.triggerColor || 'Black').toLowerCase(),
      triggerSize: (drawer.dataset.triggerSize || 'M').toLowerCase(),
    };
  }

  function isAutoAdded(item) {
    return Boolean(item.properties && item.properties._auto_added);
  }

  function optionValue(item, name) {
    const match = (item.options_with_values || []).find(function (option) {
      return option.name.toLowerCase() === name;
    });
    return match ? match.value.toLowerCase() : null;
  }

  /** A line "triggers" the rule when it is Black + M and is not the gift itself. */
  function isTrigger(item, rule) {
    return (
      !isAutoAdded(item) &&
      item.product_id !== rule.giftProductId &&
      optionValue(item, rule.colorName) === rule.triggerColor &&
      optionValue(item, rule.sizeName) === rule.triggerSize
    );
  }

  /**
   * Special rule: when a Black + M product is in the cart, Soft Winter Jacket is
   * added automatically (flagged with the hidden `_auto_added` line property).
   * When no Black + M product is left, the auto-added jacket is removed.
   * Returns the cart after any change.
   */
  function applyAutoAddRule(cart) {
    const rule = ruleSettings();
    if (!rule) return Promise.resolve(cart);

    const hasTrigger = cart.items.some(function (item) {
      return isTrigger(item, rule);
    });
    const giftLine = cart.items.find(isAutoAdded);

    if (hasTrigger && !giftLine) {
      return postJSON('cart/add.js', {
        items: [{ id: rule.giftVariantId, quantity: 1, properties: { _auto_added: 'true' } }],
      }).then(fetchCart);
    }
    if (!hasTrigger && giftLine) {
      return postJSON('cart/change.js', { id: giftLine.key, quantity: 0 });
    }
    return Promise.resolve(cart);
  }

  function fetchCart() {
    return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json();
    });
  }

  /** Re-renders the drawer (and every cart count) from the server. */
  function renderDrawer() {
    return fetch(root + '?sections=' + DRAWER_SECTION)
      .then(function (r) {
        return r.json();
      })
      .then(function (sections) {
        const html = sections[DRAWER_SECTION];
        if (!html) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const fresh = doc.querySelector('[data-lh-drawer-body]');
        const current = document.querySelector('[data-lh-drawer-body]');
        if (fresh && current) current.replaceWith(fresh);
        if (fresh) updateCount(parseInt(fresh.dataset.itemCount, 10) || 0);
      });
  }

  function updateCount(count) {
    document.querySelectorAll('[data-lh-cart-count]').forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });
  }

  // Cart operations run one after another so quick clicks cannot race each other.
  let queue = Promise.resolve();
  function enqueue(task) {
    const run = queue.then(task);
    queue = run.catch(function () {});
    return run;
  }

  const cart = {
    /** @param {Array<{id:number, quantity:number}>} items */
    add(items) {
      return enqueue(function () {
        return postJSON('cart/add.js', { items: items })
          .then(fetchCart)
          .then(applyAutoAddRule)
          .then(renderDrawer)
          .then(function () {
            document.dispatchEvent(new CustomEvent('lh:cart:updated'));
          });
      });
    },

    /**
     * @param {string} key line item key
     * @param {number} quantity new quantity (0 removes the line)
     * @param {boolean} skipRule true when the auto-added line itself is removed
     */
    change(key, quantity, skipRule) {
      return enqueue(function () {
        return postJSON('cart/change.js', { id: key, quantity: quantity })
          .then(function (updated) {
            return skipRule ? updated : applyAutoAddRule(updated);
          })
          .then(renderDrawer)
          .then(function () {
            document.dispatchEvent(new CustomEvent('lh:cart:updated'));
          });
      });
    },

    /** Variant id of the auto-add gift, used by "Buy it now". */
    giftFor(colorValue, sizeValue, productId) {
      const rule = ruleSettings();
      if (!rule || productId === rule.giftProductId) return null;
      if (String(colorValue).toLowerCase() !== rule.triggerColor) return null;
      if (String(sizeValue).toLowerCase() !== rule.triggerSize) return null;
      return rule.giftVariantId;
    },

    openDrawer() {
      const drawer = document.querySelector('lh-cart-drawer');
      if (drawer) panels.open(drawer);
    },
  };

  window.LH = Object.assign(window.LH || {}, {
    formatMoney: formatMoney,
    toast: toast,
    panels: panels,
    cart: cart,
  });

  /* ------------------------------------------------------------------ */
  /* Small shared behaviours                                            */
  /* ------------------------------------------------------------------ */

  // Any element with data-lh-open-cart opens the drawer (header cart icon).
  document.addEventListener('click', function (event) {
    const opener = event.target.closest('[data-lh-open-cart]');
    if (!opener) return;
    event.preventDefault();
    cart.openDrawer();
  });
})();
