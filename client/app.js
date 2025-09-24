import { renderListingCollection, formatPrice } from './listingCards.js';

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
  agentMessagesContainer: document.getElementById('agent-messages'),
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
  editingListingId: null,
  conversationsById: {},
  listingConversations: {},
  agentConversations: [],
  openConversations: new Set()
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
  state.conversationsById = {};
  state.listingConversations = {};
  state.agentConversations = [];
  state.openConversations.clear();
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
      if (elements.agentMessagesContainer) {
        elements.agentMessagesContainer.innerHTML = '';
      }
    }
    if (state.user.role === 'agent') {
      fetchMyListings();
      fetchAgentConversations();
    }
  } else {
    elements.listingsContainer.innerHTML = '';
    elements.savedSearchList.innerHTML = '';
    if (elements.agentListingsContainer) {
      elements.agentListingsContainer.innerHTML = '';
    }
    if (elements.agentMessagesContainer) {
      elements.agentMessagesContainer.innerHTML = '';
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

function formatTimestamp(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function extractId(entity) {
  if (!entity) {
    return '';
  }

  if (typeof entity === 'string') {
    return entity;
  }

  if (typeof entity === 'object') {
    return entity._id || entity.id || '';
  }

  return '';
}

function canMessageListing(listing) {
  if (!state.user || state.user.role !== 'user') {
    return false;
  }

  const agentId = extractId(listing?.agent);
  if (!agentId) {
    return false;
  }

  return agentId !== getUserId();
}

function getConversationForListing(listingId) {
  if (!listingId) {
    return null;
  }

  return state.listingConversations[listingId] || null;
}

function storeConversation(conversation) {
  if (!conversation || !conversation._id) {
    return null;
  }

  state.conversationsById[conversation._id] = conversation;

  const listingId = extractId(conversation.listing);
  if (listingId) {
    state.listingConversations[listingId] = conversation;
  }

  const agentIndex = state.agentConversations.findIndex((item) => item._id === conversation._id);
  if (agentIndex !== -1) {
    state.agentConversations[agentIndex] = conversation;
  }

  return conversation;
}

function findListingById(listingId) {
  if (!listingId) {
    return null;
  }

  return state.listings.find((listing) => extractId(listing) === listingId) || null;
}

function createConversationMessageElement(message, currentUserId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'conversation__message';

  const senderId = extractId(message?.sender);
  const isCurrentUser = senderId && senderId === currentUserId;
  if (isCurrentUser) {
    wrapper.classList.add('conversation__message--outgoing');
  }

  const senderName = message?.sender?.fullName || '';
  if (senderName || isCurrentUser) {
    const senderEl = document.createElement('div');
    senderEl.className = 'conversation__sender';
    senderEl.textContent = isCurrentUser ? 'You' : senderName;
    wrapper.append(senderEl);
  }

  const bodyEl = document.createElement('p');
  bodyEl.className = 'conversation__body';
  bodyEl.textContent = message?.body || '';
  wrapper.append(bodyEl);

  if (message?.createdAt) {
    const metaEl = document.createElement('div');
    metaEl.className = 'conversation__meta';
    metaEl.textContent = formatTimestamp(message.createdAt);
    wrapper.append(metaEl);
  }

  return wrapper;
}

function renderConversationThread(threadEl, conversation) {
  if (!threadEl) {
    return;
  }

  threadEl.innerHTML = '';
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  if (!messages.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const currentUserId = getUserId();
  messages.forEach((message) => {
    const element = createConversationMessageElement(message, currentUserId);
    fragment.append(element);
  });

  threadEl.append(fragment);
  threadEl.scrollTop = threadEl.scrollHeight;
}

function renderConversation(container, conversation) {
  if (!container) {
    return;
  }

  const thread = container.querySelector('.conversation__thread');
  renderConversationThread(thread, conversation);

  const form = container.querySelector('.conversation__form');
  if (form) {
    form.dataset.conversationId = conversation?._id || '';
  }
}

function setConversationStatus(container, message, type = 'info') {
  if (!container) {
    return;
  }

  const statusEl = container.querySelector('.conversation__status');
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message || '';
  statusEl.hidden = !message;
  statusEl.classList.remove('conversation__status--error', 'conversation__status--success');

  if (type === 'error') {
    statusEl.classList.add('conversation__status--error');
  } else if (type === 'success') {
    statusEl.classList.add('conversation__status--success');
  }
}

function clearConversationStatus(container) {
  setConversationStatus(container, '');
}

function resetConversationForm(container) {
  if (!container) {
    return;
  }

  const form = container.querySelector('.conversation__form');
  if (form) {
    const textarea = form.querySelector('textarea[name="message"]');
    if (textarea) {
      textarea.value = '';
    }
    form.dataset.conversationId = '';
  }

  clearConversationStatus(container);
}

async function loadConversationForListing(listingId, container) {
  if (!listingId) {
    return null;
  }

  const existing = getConversationForListing(listingId);
  if (existing) {
    renderConversation(container, existing);
    return existing;
  }

  try {
    setConversationStatus(container, 'Loading messages…');
    const response = await apiRequest('/conversations', { params: { listingId } });
    const conversation = Array.isArray(response) && response.length ? storeConversation(response[0]) : null;
    renderConversation(container, conversation);
    clearConversationStatus(container);
    return conversation;
  } catch (error) {
    setConversationStatus(container, error.message || 'Unable to load messages.', 'error');
    throw error;
  }
}

function decorateListingCard(node, listing) {
  if (!node) {
    return;
  }

  const listingId = extractId(listing);
  const contactButton = node.querySelector('.listing__contact-link');
  const conversationContainer = node.querySelector('.listing__conversation');
  const canContact = canMessageListing(listing);

  if (contactButton) {
    contactButton.hidden = !canContact;
    contactButton.dataset.listingId = listingId;
  }

  if (!conversationContainer) {
    return;
  }

  conversationContainer.dataset.listingId = listingId;
  const form = conversationContainer.querySelector('.conversation__form');
  if (form) {
    form.dataset.listingId = listingId;
  }

  if (!canContact) {
    conversationContainer.hidden = true;
    resetConversationForm(conversationContainer);
    return;
  }

  if (state.openConversations.has(listingId)) {
    conversationContainer.hidden = false;
    const conversation = getConversationForListing(listingId);
    renderConversation(conversationContainer, conversation);
  } else {
    conversationContainer.hidden = true;
    resetConversationForm(conversationContainer);
  }
}

async function openListingConversation(listingId, card) {
  if (!listingId || !card) {
    return;
  }

  const listing = findListingById(listingId);
  if (!canMessageListing(listing)) {
    return;
  }

  const conversationContainer = card.querySelector('.listing__conversation');
  if (!conversationContainer) {
    return;
  }

  state.openConversations.add(listingId);
  conversationContainer.hidden = false;
  const form = conversationContainer.querySelector('.conversation__form');
  if (form) {
    form.dataset.listingId = listingId;
  }

  const existing = getConversationForListing(listingId);
  renderConversation(conversationContainer, existing);
  clearConversationStatus(conversationContainer);

  try {
    await loadConversationForListing(listingId, conversationContainer);
  } catch (error) {
    // error handled in loadConversationForListing
  }

  const textarea = conversationContainer.querySelector('textarea[name="message"]');
  if (textarea) {
    textarea.focus();
  }
}

function closeListingConversation(listingId, card) {
  if (!listingId || !card) {
    return;
  }

  const conversationContainer = card.querySelector('.listing__conversation');
  if (!conversationContainer) {
    return;
  }

  conversationContainer.hidden = true;
  resetConversationForm(conversationContainer);
  state.openConversations.delete(listingId);
}

async function sendListingMessage(listingId, form) {
  if (!listingId || !form) {
    return;
  }

  const container = form.closest('.listing__conversation');
  if (!container) {
    return;
  }

  const textarea = form.querySelector('textarea[name="message"]');
  const message = textarea?.value?.trim();
  if (!message) {
    setConversationStatus(container, 'Please enter a message.', 'error');
    return;
  }

  const sendButton = form.querySelector('button[type="submit"]');
  const conversationId = form.dataset.conversationId;

  try {
    if (sendButton) {
      sendButton.disabled = true;
    }
    setConversationStatus(container, 'Sending…');
    const payload = conversationId
      ? await apiRequest(`/conversations/${conversationId}/messages`, { method: 'POST', body: { message } })
      : await apiRequest('/conversations', { method: 'POST', body: { listingId, message } });

    const conversation = storeConversation(payload) || payload;
    renderConversation(container, conversation);
    if (textarea) {
      textarea.value = '';
    }
    setConversationStatus(container, 'Message sent', 'success');
  } catch (error) {
    setConversationStatus(container, error.message || 'Unable to send message.', 'error');
  } finally {
    if (sendButton) {
      sendButton.disabled = false;
    }
  }
}

function handleListingCardClick(event) {
  if (!elements.listingsContainer) {
    return;
  }

  const contactButton = event.target.closest('.listing__contact-link');
  if (contactButton && elements.listingsContainer.contains(contactButton)) {
    event.preventDefault();
    const listingId = contactButton.dataset.listingId;
    const card = contactButton.closest('.listing');
    if (listingId && card) {
      openListingConversation(listingId, card);
    }
    return;
  }

  const closeButton = event.target.closest('[data-conversation-close]');
  if (closeButton && elements.listingsContainer.contains(closeButton)) {
    event.preventDefault();
    const container = closeButton.closest('.listing__conversation');
    const listingId = container?.dataset.listingId;
    const card = closeButton.closest('.listing');
    if (listingId && card) {
      closeListingConversation(listingId, card);
    }
  }
}

function handleListingConversationSubmit(event) {
  if (!elements.listingsContainer) {
    return;
  }

  const form = event.target.closest('.conversation__form');
  if (!form || !elements.listingsContainer.contains(form)) {
    return;
  }

  event.preventDefault();
  const listingId = form.dataset.listingId;
  if (!listingId) {
    return;
  }

  sendListingMessage(listingId, form);
}

function renderAgentConversations() {
  if (!elements.agentMessagesContainer) {
    return;
  }

  const container = elements.agentMessagesContainer;
  container.innerHTML = '';

  if (!state.user || state.user.role !== 'agent') {
    return;
  }

  if (!state.agentConversations.length) {
    container.innerHTML =
      '<div class="empty-state">Messages from interested buyers will appear here once conversations begin.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  state.agentConversations.forEach((conversation) => {
    const card = document.createElement('article');
    card.className = 'conversation-card';
    card.dataset.conversationId = conversation._id;
    const listingId = extractId(conversation.listing);
    if (listingId) {
      card.dataset.listingId = listingId;
    }

    const header = document.createElement('div');
    header.className = 'conversation-card__header';

    const title = document.createElement('h4');
    title.className = 'conversation-card__title';
    title.textContent = conversation.listing?.title || 'Listing Conversation';

    const subtitle = document.createElement('p');
    subtitle.className = 'conversation-card__subtitle';
    const subtitleParts = [];
    if (conversation.buyer?.fullName) {
      subtitleParts.push(`Buyer: ${conversation.buyer.fullName}`);
    }
    const locationParts = [];
    if (conversation.listing?.area) {
      locationParts.push(conversation.listing.area);
    }
    if (conversation.listing?.address?.city) {
      locationParts.push(conversation.listing.address.city);
    }
    if (locationParts.length) {
      subtitleParts.push(locationParts.join(', '));
    }
    subtitle.textContent = subtitleParts.join(' • ');

    header.append(title, subtitle);
    card.append(header);

    const thread = document.createElement('div');
    thread.className = 'conversation__thread';
    card.append(thread);
    renderConversationThread(thread, conversation);

    const form = document.createElement('form');
    form.className = 'conversation__form';
    form.dataset.conversationId = conversation._id;
    form.dataset.listingId = listingId;

    const textarea = document.createElement('textarea');
    textarea.name = 'message';
    textarea.rows = 3;
    textarea.required = true;
    textarea.placeholder = 'Share an update or answer their question.';
    form.append(textarea);

    const actions = document.createElement('div');
    actions.className = 'conversation__actions';
    const sendButton = document.createElement('button');
    sendButton.type = 'submit';
    sendButton.className = 'btn btn--small primary';
    sendButton.textContent = 'Send Reply';
    actions.append(sendButton);
    form.append(actions);
    card.append(form);

    const status = document.createElement('p');
    status.className = 'conversation__status';
    status.hidden = true;
    status.setAttribute('role', 'status');
    card.append(status);

    fragment.append(card);
  });

  container.append(fragment);
}

async function fetchAgentConversations() {
  if (!state.user || state.user.role !== 'agent') {
    state.agentConversations = [];
    if (elements.agentMessagesContainer) {
      elements.agentMessagesContainer.innerHTML = '';
    }
    return;
  }

  try {
    const conversations = await apiRequest('/conversations');
    state.agentConversations = Array.isArray(conversations) ? conversations : [];
    state.agentConversations.forEach((conversation) => {
      storeConversation(conversation);
    });
    renderAgentConversations();
  } catch (error) {
    if (elements.agentMessagesContainer) {
      elements.agentMessagesContainer.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
  }
}

async function sendAgentConversationMessage(form) {
  const container = form.closest('.conversation-card');
  if (!container) {
    return;
  }

  const textarea = form.querySelector('textarea[name="message"]');
  const message = textarea?.value?.trim();
  if (!message) {
    setConversationStatus(container, 'Please enter a message.', 'error');
    return;
  }

  const conversationId = form.dataset.conversationId;
  if (!conversationId) {
    setConversationStatus(container, 'Conversation not found.', 'error');
    return;
  }

  const sendButton = form.querySelector('button[type="submit"]');

  try {
    if (sendButton) {
      sendButton.disabled = true;
    }
    setConversationStatus(container, 'Sending…');
    const payload = await apiRequest(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { message }
    });
    const conversation = storeConversation(payload) || payload;
    const thread = container.querySelector('.conversation__thread');
    renderConversationThread(thread, conversation);
    if (textarea) {
      textarea.value = '';
    }
    setConversationStatus(container, 'Reply sent', 'success');
  } catch (error) {
    setConversationStatus(container, error.message || 'Unable to send message.', 'error');
  } finally {
    if (sendButton) {
      sendButton.disabled = false;
    }
  }
}

function handleAgentConversationSubmit(event) {
  if (!elements.agentMessagesContainer) {
    return;
  }

  const form = event.target.closest('.conversation__form');
  if (!form || !elements.agentMessagesContainer.contains(form)) {
    return;
  }

  event.preventDefault();
  sendAgentConversationMessage(form);
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

function renderListings(listings) {
  if (!elements.listingsContainer || !elements.listingTemplate) {
    return;
  }

  renderListingCollection(listings, elements.listingTemplate, elements.listingsContainer, {
    onRender: decorateListingCard
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

  if (elements.listingsContainer) {
    elements.listingsContainer.addEventListener('click', handleListingCardClick);
    elements.listingsContainer.addEventListener('submit', handleListingConversationSubmit);
  }

  if (elements.agentMessagesContainer) {
    elements.agentMessagesContainer.addEventListener('submit', handleAgentConversationSubmit);
  }
}

bootstrap();
