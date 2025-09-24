import { formatPrice } from './listingCards.js';

const API_BASE = '/api';

const elements = {
  form: document.getElementById('saved-search-form'),
  list: document.getElementById('saved-search-list'),
  userLabel: document.getElementById('saved-search-user'),
  logoutButton: document.getElementById('saved-search-logout')
};

const state = {
  token: null,
  user: null,
  savedSearches: []
};

function restoreAuth() {
  try {
    const stored = localStorage.getItem('afcpln_auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      state.token = parsed.token;
      state.user = parsed.user;
    }
  } catch (error) {
    console.warn('Unable to restore auth state', error);
  }
}

function redirectToDashboard() {
  window.location.href = 'index.html';
}

function ensureAuthenticated() {
  if (!state.token || !state.user) {
    redirectToDashboard();
    return false;
  }

  return true;
}

function updateUserLabel() {
  if (!elements.userLabel) {
    return;
  }

  if (!state.user) {
    elements.userLabel.textContent = '—';
    return;
  }

  const name = state.user.fullName || state.user.email || 'Member';
  elements.userLabel.textContent = name;
}

function removeAlert(form) {
  const existing = form?.querySelector?.('.alert');
  if (existing) {
    existing.remove();
  }
}

function showAlert(form, message, type = 'error') {
  if (!form) {
    return;
  }

  removeAlert(form);
  const alert = document.createElement('div');
  alert.className = `alert ${type}`;
  alert.textContent = message;
  form.append(alert);
}

function extractFormData(form) {
  const formData = new FormData(form);
  const result = {};
  formData.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function parseNumber(value) {
  return value ? Number(value) : undefined;
}

function buildRequestHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  return headers;
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: buildRequestHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });

  if (response.status === 401) {
    localStorage.removeItem('afcpln_auth');
    redirectToDashboard();
    return Promise.reject(new Error('Authentication required.'));
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || 'Request failed.';
    throw new Error(message);
  }

  return data;
}

function renderSavedSearches(searches) {
  if (!elements.list) {
    return;
  }

  elements.list.innerHTML = '';

  if (!Array.isArray(searches) || !searches.length) {
    elements.list.innerHTML = '<div class="empty-state">Create a saved search to receive instant matches.</div>';
    return;
  }

  searches.forEach((search) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'saved-search';

    const metaParts = [];
    if (Array.isArray(search.areas) && search.areas.length) {
      metaParts.push(`Areas: ${search.areas.join(', ')}`);
    }
    if (typeof search.minPrice === 'number') {
      metaParts.push(`Min ${formatPrice(search.minPrice)}`);
    }
    if (typeof search.maxPrice === 'number') {
      metaParts.push(`Max ${formatPrice(search.maxPrice)}`);
    }
    if (typeof search.minBedrooms === 'number') {
      metaParts.push(`${search.minBedrooms}+ bd`);
    }
    if (typeof search.minBathrooms === 'number') {
      metaParts.push(`${search.minBathrooms}+ ba`);
    }
    if (Array.isArray(search.keywords) && search.keywords.length) {
      metaParts.push(`Keywords: ${search.keywords.join(', ')}`);
    }

    wrapper.innerHTML = `
      <div class="saved-search__info">
        <p class="saved-search__name">${search.name}</p>
        <p class="saved-search__meta">${metaParts.join(' • ') || 'All opportunities'}</p>
      </div>
      <button type="button" class="btn btn--small" data-delete="${search._id}">Remove</button>
    `;

    elements.list.append(wrapper);
  });
}

async function fetchSavedSearches() {
  try {
    const searches = await apiRequest('/users/me/saved-searches');
    state.savedSearches = Array.isArray(searches) ? searches : [];
    renderSavedSearches(state.savedSearches);
  } catch (error) {
    console.error(error);
    if (elements.list) {
      elements.list.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  removeAlert(elements.form);
  const data = extractFormData(elements.form);
  const payload = {
    name: data.name,
    areas: data.areas.split(',').map((item) => item.trim()).filter(Boolean),
    keywords: data.keywords ? data.keywords.split(',').map((item) => item.trim()).filter(Boolean) : [],
    minPrice: parseNumber(data.minPrice),
    maxPrice: parseNumber(data.maxPrice),
    minBedrooms: parseNumber(data.minBedrooms),
    minBathrooms: parseNumber(data.minBathrooms)
  };

  try {
    await apiRequest('/users/me/saved-searches', { method: 'POST', body: payload });
    elements.form.reset();
    showAlert(elements.form, 'Saved search created! We will email new matches.', 'success');
    fetchSavedSearches();
  } catch (error) {
    showAlert(elements.form, error.message);
  }
}

function handleListClick(event) {
  const button = event.target.closest('[data-delete]');
  if (!button) {
    return;
  }

  const searchId = button.dataset.delete;
  if (!searchId) {
    return;
  }

  apiRequest(`/users/me/saved-searches/${searchId}`, { method: 'DELETE' })
    .then(() => {
      fetchSavedSearches();
    })
    .catch((error) => {
      showAlert(elements.form, error.message);
    });
}

function handleLogout() {
  localStorage.removeItem('afcpln_auth');
  state.token = null;
  state.user = null;
  redirectToDashboard();
}

function bootstrap() {
  restoreAuth();
  if (!ensureAuthenticated()) {
    return;
  }
  updateUserLabel();
  fetchSavedSearches();

  if (elements.form) {
    elements.form.addEventListener('submit', handleSubmit);
  }

  if (elements.list) {
    elements.list.addEventListener('click', handleListClick);
  }

  if (elements.logoutButton) {
    elements.logoutButton.addEventListener('click', handleLogout);
  }
}

bootstrap();
