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
  agentListingTemplate: document.getElementById('agent-listing-template'),
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  optionalFields: document.querySelectorAll('[data-role="agent"]'),
  listingPhotoInput: document.querySelector('#listing-form input[name="photos"]'),
  listingPhotoPreviews: document.getElementById('listing-photo-previews'),
  agentListingsContainer: document.getElementById('agent-listings'),
  listingSubmitButton: document.getElementById('listing-submit'),
  listingCancelButton: document.getElementById('listing-cancel')
};

const state = {
  token: null,
  user: null,
  listings: [],
  savedSearches: [],
  myListings: [],
  activeFilters: {},
  editingListingId: null
};

const LISTING_PHOTO_LIMITS = {
  maxFiles: 6,
  maxFileSize: 5 * 1024 * 1024,
  maxFileSizeLabel: '5MB'
};

const LISTING_STATUS_LABELS = {
  active: 'Active',
  pending: 'Under Contract',
  sold: 'Sold',
  draft: 'Draft'
};

let listingPhotoPreviewUrls = [];

function getUserId() {
  if (!state.user) {
    return null;
  }

  return state.user._id || state.user.id || null;
}

function setActiveTab(tabId = 'login') {
  const tabs = Array.from(elements.tabs || []);
  if (!tabs.length) {
    return;
  }

  const validIds = tabs.map((tab) => tab.dataset.tab);
  const activeId = validIds.includes(tabId) ? tabId : validIds[0];

  tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === activeId;
    tab.classList.toggle('active', isActive);
    const panel = document.getElementById(tab.dataset.tab);
    if (panel) {
      panel.classList.toggle('active', isActive);
    }
  });
}

function toggleAgentOptionalFields(showAgentFields) {
  elements.optionalFields.forEach((field) => {
    field.style.display = showAgentFields ? 'grid' : 'none';
  });
}

function clearAuthForms() {
  if (elements.loginForm) {
    removeAlert(elements.loginForm);
    elements.loginForm.reset();
  }

  if (elements.registerForm) {
    removeAlert(elements.registerForm);
    elements.registerForm.reset();
    const roleSelect = elements.registerForm.querySelector('select[name="role"]');
    if (roleSelect) {
      roleSelect.value = 'user';
    }
  }

  toggleAgentOptionalFields(false);
}

function handleLogout() {
  state.token = null;
  state.user = null;
  state.savedSearches = [];
  state.listings = [];
  state.myListings = [];
  state.activeFilters = {};
  state.editingListingId = null;
  if (elements.listingForm) {
    resetListingForm();
  }
  saveAuthState();
  clearAuthForms();
  setActiveTab('login');
  updateUI();
}

function saveAuthState() {
  if (state.token && state.user) {
    localStorage.setItem('afcpln_auth', JSON.stringify({ token: state.token, user: state.user }));
  } else {
    localStorage.removeItem('afcpln_auth');
  }
}

function updateUserStatus() {
  if (!elements.userStatus) {
    return;
  }

  const statusEl = elements.userStatus;
  const isGuest = !state.user;
  statusEl.classList.toggle('hero__status--guest', isGuest);

  if (isGuest) {
    statusEl.innerHTML = `
      <div class="status-details">
        <div class="status-name">Private Network</div>
        <div class="status-role">Sign in or create an account to explore exclusive listings.</div>
      </div>
    `;
    return;
  }

  const roleLabel = state.user.role === 'agent' ? 'Listing Agent' : 'Buyer / Investor';
  statusEl.innerHTML = `
    <div class="status-details">
      <div class="status-name">${state.user.fullName}</div>
      <div class="status-role">${roleLabel}</div>
    </div>
    <button class="btn btn--ghost" id="logout-btn" type="button">Log out</button>
  `;

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
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
    if (state.user.role === 'agent') {
      fetchMyListings();
    }
  } else {
    elements.listingsContainer.innerHTML = '';
    elements.savedSearchList.innerHTML = '';
    if (elements.agentListingsContainer) {
      elements.agentListingsContainer.innerHTML = '';
    }
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

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }

  const megabyte = 1024 * 1024;
  if (bytes >= megabyte) {
    return `${(bytes / megabyte).toFixed(1)} MB`;
  }

  const kilobyte = 1024;
  return `${Math.max(1, Math.round(bytes / kilobyte))} KB`;
}

function validateListingPhotos(photoFiles) {
  if (!photoFiles.length) {
    return null;
  }

  if (photoFiles.length > LISTING_PHOTO_LIMITS.maxFiles) {
    return `Please select up to ${LISTING_PHOTO_LIMITS.maxFiles} photos.`;
  }

  const oversizedFile = photoFiles.find((file) => file.size > LISTING_PHOTO_LIMITS.maxFileSize);
  if (oversizedFile) {
    return `Each photo must be ${LISTING_PHOTO_LIMITS.maxFileSizeLabel} or smaller.`;
  }

  return null;
}

function clearListingPhotoPreviews() {
  if (!elements.listingPhotoPreviews) {
    return;
  }

  if (listingPhotoPreviewUrls.length && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    listingPhotoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  }
  listingPhotoPreviewUrls = [];
  elements.listingPhotoPreviews.innerHTML = '';
  elements.listingPhotoPreviews.hidden = true;
}

function updateListingPhotoPreviews(files) {
  if (!elements.listingPhotoPreviews) {
    return;
  }

  clearListingPhotoPreviews();

  if (!files.length) {
    return;
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }

  const fragment = document.createDocumentFragment();

  files.forEach((file) => {
    if (!(file instanceof File) || file.size <= 0) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    listingPhotoPreviewUrls.push(objectUrl);

    const figure = document.createElement('figure');
    figure.className = 'photo-preview';

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = file.name ? `${file.name} preview` : 'Listing photo preview';

    const caption = document.createElement('figcaption');
    const sizeLabel = formatFileSize(file.size);
    caption.textContent = sizeLabel ? `${file.name} • ${sizeLabel}` : file.name;

    figure.append(img, caption);
    fragment.append(figure);
  });

  if (!fragment.childNodes.length) {
    return;
  }

  elements.listingPhotoPreviews.append(fragment);
  elements.listingPhotoPreviews.hidden = false;
}

function handleListingPhotoChange(event) {
  if (!elements.listingForm || typeof File === 'undefined') {
    return;
  }

  const files = Array.from(event.target.files || []).filter((file) => file instanceof File && file.size > 0);

  if (!files.length) {
    clearListingPhotoPreviews();
    return;
  }

  const validationError = validateListingPhotos(files);
  if (validationError) {
    showAlert(elements.listingForm, validationError);
    event.target.value = '';
    clearListingPhotoPreviews();
    return;
  }

  removeAlert(elements.listingForm);
  updateListingPhotoPreviews(files);
}

function populateListingForm(listing) {
  if (!elements.listingForm || !listing) {
    return;
  }

  const address = listing.address || {};
  const fields = {
    title: listing.title || '',
    area: listing.area || '',
    price: listing.price ?? '',
    bedrooms: listing.bedrooms ?? '',
    bathrooms: listing.bathrooms ?? '',
    squareFeet: listing.squareFeet ?? '',
    description: listing.description || '',
    features: Array.isArray(listing.features) ? listing.features.join(', ') : '',
    street: address.street || '',
    city: address.city || '',
    state: address.state || '',
    postalCode: address.postalCode || ''
  };

  Object.entries(fields).forEach(([name, value]) => {
    const input = elements.listingForm.querySelector(`[name="${name}"]`);
    if (input) {
      input.value = value === undefined || value === null ? '' : value;
    }
  });
}

function setListingFormMode(mode, listing = null) {
  const isEdit = mode === 'edit' && listing;
  state.editingListingId = isEdit ? listing._id : null;

  if (elements.listingSubmitButton) {
    elements.listingSubmitButton.textContent = isEdit ? 'Save Changes' : 'Publish Listing';
  }

  if (elements.listingCancelButton) {
    elements.listingCancelButton.hidden = !isEdit;
  }

  if (elements.listingForm) {
    elements.listingForm.dataset.mode = isEdit ? 'edit' : 'create';
  }

  if (isEdit) {
    populateListingForm(listing);
    clearListingPhotoPreviews();
    if (elements.listingPhotoInput) {
      elements.listingPhotoInput.value = '';
    }
    removeAlert(elements.listingForm);
    if (elements.agentToolsSection && typeof elements.agentToolsSection.scrollIntoView === 'function') {
      elements.agentToolsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function clearListingFormState() {
  clearListingPhotoPreviews();
  if (elements.listingPhotoInput) {
    elements.listingPhotoInput.value = '';
  }
  if (elements.listingForm) {
    removeAlert(elements.listingForm);
  }
  setListingFormMode('create');
}

function resetListingForm() {
  if (elements.listingForm) {
    elements.listingForm.reset();
  } else {
    clearListingFormState();
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
    const imageWrapper = node.querySelector('.listing__image');
    const imageEl = imageWrapper ? imageWrapper.querySelector('img') : null;
    const firstImage = Array.isArray(listing.images) ? listing.images.find((img) => Boolean(img)) : null;

    if (imageWrapper && imageEl) {
      if (firstImage) {
        imageEl.src = firstImage;
        imageEl.alt = `${listing.title} photo`;
        imageWrapper.hidden = false;
      } else {
        imageEl.removeAttribute('src');
        imageWrapper.hidden = true;
      }
    }

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

function renderAgentListings(listings) {
  if (!elements.agentListingsContainer || !elements.agentListingTemplate) {
    return;
  }

  const container = elements.agentListingsContainer;
  container.innerHTML = '';

  if (!listings.length) {
    container.innerHTML =
      '<div class="empty-state">Publish your first property to manage it here.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  listings.forEach((listing) => {
    const node = elements.agentListingTemplate.content.firstElementChild.cloneNode(true);
    const imageWrapper = node.querySelector('.listing__image');
    const imageEl = imageWrapper ? imageWrapper.querySelector('img') : null;
    const firstImage = Array.isArray(listing.images) ? listing.images.find((img) => Boolean(img)) : null;

    if (imageWrapper && imageEl) {
      if (firstImage) {
        imageEl.src = firstImage;
        imageEl.alt = `${listing.title} photo`;
        imageWrapper.hidden = false;
      } else {
        imageEl.removeAttribute('src');
        imageWrapper.hidden = true;
      }
    }

    node.querySelector('.listing__title').textContent = listing.title;
    node.querySelector('.listing__price').textContent = formatPrice(listing.price);
    const metaParts = [
      typeof listing.bedrooms === 'number' ? `${listing.bedrooms} bd` : null,
      typeof listing.bathrooms === 'number' ? `${listing.bathrooms} ba` : null,
      listing.area || null
    ].filter(Boolean);

    const cityState = listing.address
      ? [listing.address.city, listing.address.state].filter(Boolean).join(', ')
      : '';

    if (cityState) {
      metaParts.push(cityState);
    }

    node.querySelector('.listing__meta').textContent = metaParts.join(' • ');
    node.querySelector('.listing__description').textContent = listing.description || '';

    const currentStatus = listing.status || 'active';
    const statusBadge = node.querySelector('[data-status]');
    if (statusBadge) {
      statusBadge.textContent = LISTING_STATUS_LABELS[currentStatus] || LISTING_STATUS_LABELS.active;
      statusBadge.dataset.status = currentStatus;
    }

    const editButton = node.querySelector('[data-action="edit"]');
    const deleteButton = node.querySelector('[data-action="delete"]');
    const statusButtons = node.querySelectorAll('[data-status-action]');

    if (editButton) {
      editButton.dataset.id = listing._id;
    }

    if (deleteButton) {
      deleteButton.dataset.id = listing._id;
    }

    statusButtons.forEach((button) => {
      button.dataset.id = listing._id;
      button.disabled = button.dataset.statusAction === currentStatus;
    });

    fragment.append(node);
  });

  container.append(fragment);
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

async function fetchListings(filters) {
  if (!state.user) {
    return;
  }
  const appliedFilters = filters ? { ...filters } : { ...state.activeFilters };
  try {
    const data = await apiRequest('/listings', { params: appliedFilters });
    state.listings = data;
    state.activeFilters = appliedFilters;
    renderListings(data);
  } catch (error) {
    console.error(error);
    elements.listingsContainer.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

async function fetchMyListings() {
  if (!state.user || state.user.role !== 'agent') {
    return;
  }

  const userId = getUserId();
  if (!userId) {
    return;
  }

  try {
    const listings = await apiRequest('/listings', { params: { agentId: userId } });
    state.myListings = listings;
    renderAgentListings(listings);
  } catch (error) {
    console.error(error);
    state.myListings = [];
    if (elements.agentListingsContainer) {
      elements.agentListingsContainer.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
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
    const roleSelect = elements.registerForm.querySelector('select[name="role"]');
    if (roleSelect) {
      roleSelect.value = 'user';
    }
    toggleAgentOptionalFields(false);
    showAlert(
      elements.registerForm,
      'Account created successfully! Check your email for a confirmation message.',
      'success'
    );
  } catch (error) {
    showAlert(elements.registerForm, error.message);
  }
}

function parseNumber(value) {
  return value ? Number(value) : undefined;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (typeof File === 'undefined' || !(file instanceof File)) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

async function handleListingSubmit(event) {
  event.preventDefault();
  removeAlert(elements.listingForm);
  const formData = new FormData(elements.listingForm);
  const supportsFileUpload = typeof File !== 'undefined';
  const data = {};
  formData.forEach((value, key) => {
    if (key !== 'photos') {
      data[key] = value;
    }
  });

  const rawPhotos = supportsFileUpload ? formData.getAll('photos') : [];
  const photoFiles = supportsFileUpload
    ? rawPhotos.filter((file) => file instanceof File && file.size > 0)
    : [];

  const validationError = validateListingPhotos(photoFiles);
  if (validationError) {
    showAlert(elements.listingForm, validationError);
    return;
  }

  let encodedImages = [];

  if (photoFiles.length) {
    try {
      const conversions = await Promise.all(photoFiles.map((file) => fileToDataUrl(file)));
      encodedImages = conversions.filter(Boolean);
    } catch (fileError) {
      console.error('Failed to process listing photos', fileError);
      showAlert(
        elements.listingForm,
        'We could not process one of the selected photos. Please try again with different images.'
      );
      return;
    }
  }

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

  if (encodedImages.length) {
    payload.images = encodedImages;
  }

  const isEdit = Boolean(state.editingListingId);
  const endpoint = isEdit ? `/listings/${state.editingListingId}` : '/listings';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    await apiRequest(endpoint, { method, body: payload });
    resetListingForm();
    const successMessage = isEdit
      ? 'Listing details updated successfully.'
      : 'Listing published! Buyers with matching searches will be notified.';
    showAlert(elements.listingForm, successMessage, 'success');
    fetchListings();
    if (state.user?.role === 'agent') {
      fetchMyListings();
    }
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

function handleAgentListingsClick(event) {
  const statusButton = event.target.closest('[data-status-action]');
  if (statusButton) {
    const listingId = statusButton.dataset.id;
    const status = statusButton.dataset.statusAction;
    if (!listingId || !status) {
      return;
    }

    const current = state.myListings.find((listing) => listing._id === listingId);
    if (current && current.status === status) {
      return;
    }

    updateListingStatus(listingId, status);
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) {
    return;
  }

  const listingId = actionButton.dataset.id;
  if (!listingId) {
    return;
  }

  if (actionButton.dataset.action === 'edit') {
    const listing = state.myListings.find((item) => item._id === listingId);
    if (listing) {
      setListingFormMode('edit', listing);
    }
  } else if (actionButton.dataset.action === 'delete') {
    deleteListing(listingId);
  }
}

async function updateListingStatus(listingId, status) {
  try {
    await apiRequest(`/listings/${listingId}`, { method: 'PUT', body: { status } });
    const label = LISTING_STATUS_LABELS[status] || status;
    showAlert(elements.listingForm, `Listing marked as ${label}.`, 'success');
    fetchMyListings();
    fetchListings();
  } catch (error) {
    showAlert(elements.listingForm, error.message);
  }
}

async function deleteListing(listingId) {
  const listing = state.myListings.find((item) => item._id === listingId);
  const listingName = listing?.title ? `"${listing.title}"` : 'this listing';

  if (typeof window !== 'undefined' && !window.confirm(`Remove ${listingName} from the network?`)) {
    return;
  }

  try {
    await apiRequest(`/listings/${listingId}`, { method: 'DELETE' });
    if (state.editingListingId === listingId) {
      resetListingForm();
    }
    showAlert(elements.listingForm, 'Listing removed from the network.', 'success');
    fetchMyListings();
    fetchListings();
  } catch (error) {
    showAlert(elements.listingForm, error.message);
  }
}

function handleFilterSubmit(event) {
  event.preventDefault();
  const filters = Object.fromEntries(new FormData(elements.filtersForm));
  fetchListings(filters);
}

function initTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveTab(tab.dataset.tab);
    });
  });

  const preselected = Array.from(elements.tabs).find((tab) => tab.classList.contains('active'));
  if (preselected) {
    setActiveTab(preselected.dataset.tab);
  } else {
    setActiveTab('login');
  }
}

function initRoleFields() {
  if (!elements.registerForm) {
    return;
  }

  const roleSelect = elements.registerForm.querySelector('select[name="role"]');
  if (!roleSelect) {
    return;
  }

  const applyRoleVisibility = () => {
    const showAgentFields = roleSelect.value === 'agent';
    toggleAgentOptionalFields(showAgentFields);
  };

  roleSelect.addEventListener('change', applyRoleVisibility);
  applyRoleVisibility();
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
    elements.listingForm.addEventListener('reset', clearListingFormState);
    setListingFormMode('create');
  }

  if (elements.listingCancelButton) {
    elements.listingCancelButton.addEventListener('click', () => {
      resetListingForm();
    });
  }

  if (elements.listingPhotoInput) {
    elements.listingPhotoInput.addEventListener('change', handleListingPhotoChange);
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

  if (elements.agentListingsContainer) {
    elements.agentListingsContainer.addEventListener('click', handleAgentListingsClick);
  }
}

bootstrap();
