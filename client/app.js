const API_BASE = '/api';

const elements = {
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  listingForm: document.getElementById('listing-form'),
  savedSearchForm: document.getElementById('saved-search-form'),
  filtersForm: document.getElementById('filters'),
  listingsContainer: document.getElementById('listings'),
  savedSearchList: document.getElementById('saved-search-list'),
  listingSearchSection: document.getElementById('listing-search'),
  savedSearchesSection: document.getElementById('saved-searches'),
  agentToolsSection: document.getElementById('agent-tools'),
  authSection: document.getElementById('auth-section'),
  userStatus: document.getElementById('user-status'),
  listingTemplate: document.getElementById('listing-template'),
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  optionalFields: document.querySelectorAll('[data-role="agent"]')
};

const state = {
  token: null,
  user: null,
  listings: [],
  savedSearches: []
};

function saveAuthState() {
  if (state.token && state.user) {
    localStorage.setItem('afcpln_auth', JSON.stringify({ token: state.token, user: state.user }));
  } else {
    localStorage.removeItem('afcpln_auth');
  }
}

function updateUserStatus() {
  if (!state.user) {
    elements.userStatus.innerHTML = '<strong>Guests:</strong> Login to view listings and saved searches.';
    return;
  }

  const roleLabel = state.user.role === 'agent' ? 'Listing Agent' : 'Buyer / Investor';
  elements.userStatus.innerHTML = `
    <div>
      <div class="status-name">${state.user.fullName}</div>
      <div class="status-role">${roleLabel}</div>
    </div>
    <button class="btn" id="logout-btn" type="button">Log out</button>
  `;

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      state.token = null;
      state.user = null;
      state.savedSearches = [];
      state.listings = [];
      saveAuthState();
      updateUI();
    });
  }
}

function toggleSections() {
  const isAuthenticated = Boolean(state.user);
  elements.authSection.hidden = isAuthenticated;
  elements.listingSearchSection.hidden = !isAuthenticated;
  elements.agentToolsSection.hidden = !isAuthenticated || state.user.role !== 'agent';
  elements.savedSearchesSection.hidden = !isAuthenticated || state.user.role !== 'user';
}

function updateUI() {
  updateUserStatus();
  toggleSections();
  if (state.user) {
    fetchListings();
    if (state.user.role === 'user') {
      fetchSavedSearches();
    }
  } else {
    elements.listingsContainer.innerHTML = '';
    elements.savedSearchList.innerHTML = '';
  }
}

async function apiRequest(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }

  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

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

function showAlert(form, message, type = 'error') {
  removeAlert(form);
  const alert = document.createElement('div');
  alert.className = `alert ${type}`;
  alert.textContent = message;
  form.append(alert);
}

function removeAlert(form) {
  const existing = form.querySelector('.alert');
  if (existing) {
    existing.remove();
  }
}

function formatPrice(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function renderListings(listings) {
  elements.listingsContainer.innerHTML = '';
  if (!listings.length) {
    elements.listingsContainer.innerHTML = '<div class="empty-state">No listings match the filters yet.</div>';
    return;
  }

  listings.forEach((listing) => {
    const node = elements.listingTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.listing__title').textContent = listing.title;
    node.querySelector('.listing__price').textContent = formatPrice(listing.price);
    const meta = `${listing.bedrooms} bd • ${listing.bathrooms} ba • ${listing.area}`;
    node.querySelector('.listing__meta').textContent = meta;
    node.querySelector('.listing__description').textContent = listing.description;
    const agentInfo = listing.agent
      ? `Listed by ${listing.agent.fullName}${listing.agent.company ? ` • ${listing.agent.company}` : ''}`
      : 'Agent information pending';
    node.querySelector('.listing__agent').textContent = agentInfo;
    elements.listingsContainer.append(node);
  });
}

function renderSavedSearches(searches) {
  elements.savedSearchList.innerHTML = '';
  if (!searches.length) {
    elements.savedSearchList.innerHTML = '<div class="empty-state">Create a saved search to receive instant matches.</div>';
    return;
  }

  searches.forEach((search) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'saved-search';
    wrapper.innerHTML = `
      <div class="saved-search__info">
        <p class="saved-search__name">${search.name}</p>
        <p class="saved-search__meta">Areas: ${search.areas.join(', ')}${search.minPrice ? ` • Min ${formatPrice(search.minPrice)}` : ''}${search.maxPrice ? ` • Max ${formatPrice(search.maxPrice)}` : ''}</p>
      </div>
      <button class="btn" data-delete="${search._id}">Remove</button>
    `;
    elements.savedSearchList.append(wrapper);
  });
}

async function fetchListings(filters = {}) {
  if (!state.user) {
    return;
  }
  try {
    const data = await apiRequest('/listings', { params: filters });
    state.listings = data;
    renderListings(data);
  } catch (error) {
    console.error(error);
    elements.listingsContainer.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

async function fetchSavedSearches() {
  try {
    const searches = await apiRequest('/users/me/saved-searches');
    state.savedSearches = searches;
    renderSavedSearches(searches);
  } catch (error) {
    console.error(error);
    elements.savedSearchList.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function extractFormData(form) {
  const formData = new FormData(form);
  const result = {};
  formData.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function handleLogin(event) {
  event.preventDefault();
  removeAlert(elements.loginForm);
  const payload = extractFormData(elements.loginForm);
  try {
    const data = await apiRequest('/auth/login', { method: 'POST', body: payload });
    state.token = data.token;
    state.user = data.user;
    saveAuthState();
    updateUI();
    elements.loginForm.reset();
  } catch (error) {
    showAlert(elements.loginForm, error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  removeAlert(elements.registerForm);
  const payload = extractFormData(elements.registerForm);
  try {
    const data = await apiRequest('/auth/register', { method: 'POST', body: payload });
    state.token = data.token;
    state.user = data.user;
    saveAuthState();
    updateUI();
    elements.registerForm.reset();
    showAlert(elements.registerForm, 'Account created successfully! You are now signed in.', 'success');
  } catch (error) {
    showAlert(elements.registerForm, error.message);
  }
}

function parseNumber(value) {
  return value ? Number(value) : undefined;
}

async function handleListingSubmit(event) {
  event.preventDefault();
  removeAlert(elements.listingForm);
  const data = extractFormData(elements.listingForm);
  const payload = {
    title: data.title,
    description: data.description,
    price: Number(data.price),
    bedrooms: Number(data.bedrooms),
    bathrooms: Number(data.bathrooms),
    squareFeet: parseNumber(data.squareFeet),
    area: data.area,
    features: data.features ? data.features.split(',').map((item) => item.trim()).filter(Boolean) : [],
    address: {
      street: data.street,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode
    }
  };

  try {
    await apiRequest('/listings', { method: 'POST', body: payload });
    elements.listingForm.reset();
    showAlert(elements.listingForm, 'Listing published! Buyers with matching searches will be notified.', 'success');
    fetchListings(Object.fromEntries(new FormData(elements.filtersForm)));
  } catch (error) {
    showAlert(elements.listingForm, error.message);
  }
}

async function handleSavedSearchSubmit(event) {
  event.preventDefault();
  removeAlert(elements.savedSearchForm);
  const data = extractFormData(elements.savedSearchForm);
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
    elements.savedSearchForm.reset();
    showAlert(elements.savedSearchForm, 'Saved search created! We will email new matches.', 'success');
    fetchSavedSearches();
  } catch (error) {
    showAlert(elements.savedSearchForm, error.message);
  }
}

function handleSavedSearchClick(event) {
  const button = event.target.closest('[data-delete]');
  if (!button) return;

  const searchId = button.dataset.delete;
  apiRequest(`/users/me/saved-searches/${searchId}`, { method: 'DELETE' })
    .then(() => {
      fetchSavedSearches();
    })
    .catch((error) => {
      showAlert(elements.savedSearchForm, error.message);
    });
}

function handleFilterSubmit(event) {
  event.preventDefault();
  const filters = Object.fromEntries(new FormData(elements.filtersForm));
  fetchListings(filters);
}

function initTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      elements.tabs.forEach((btn) => btn.classList.remove('active'));
      elements.tabContents.forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.tab);
      if (panel) {
        panel.classList.add('active');
      }
    });
  });
}

function initRoleFields() {
  const roleSelect = elements.registerForm.querySelector('select[name="role"]');
  const toggleOptional = () => {
    const showAgentFields = roleSelect.value === 'agent';
    elements.optionalFields.forEach((field) => {
      field.style.display = showAgentFields ? 'grid' : 'none';
    });
  };
  roleSelect.addEventListener('change', toggleOptional);
  toggleOptional();
}

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

function bootstrap() {
  initTabs();
  initRoleFields();
  restoreAuth();
  updateUI();

  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);

  if (elements.listingForm) {
    elements.listingForm.addEventListener('submit', handleListingSubmit);
  }

  if (elements.savedSearchForm) {
    elements.savedSearchForm.addEventListener('submit', handleSavedSearchSubmit);
  }

  if (elements.savedSearchList) {
    elements.savedSearchList.addEventListener('click', handleSavedSearchClick);
  }

  if (elements.filtersForm) {
    elements.filtersForm.addEventListener('submit', handleFilterSubmit);
  }
}

bootstrap();
