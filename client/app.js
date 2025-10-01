import { renderListingCollection, formatPrice } from './listingCards.js';

const API_BASE = '/api';

const elements = {
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  listingForm: document.getElementById('listing-form'),
  filtersForm: document.getElementById('filters'),
  listingsContainer: document.getElementById('listings'),
  listingResultsSection: document.getElementById('listing-results'),
  listingFiltersSection: document.getElementById('listing-filters-card'),
  agentToolsSection: document.getElementById('agent-tools'),
  authSection: document.getElementById('auth-section'),
  authModal: document.getElementById('auth-modal'),
  appShell: document.getElementById('app-shell'),
  dashboardPrimary: document.querySelector('.dashboard__primary'),
  userStatus: document.getElementById('user-status'),
  heroActionButtons: document.getElementById('hero-action-buttons'),
  savedSearchToggle: document.getElementById('saved-search-toggle'),
  listingTemplate: document.getElementById('listing-template'),
  agentListingTemplate: document.getElementById('agent-listing-template'),
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  optionalFields: document.querySelectorAll('[data-role="agent"]'),
  listingPhotoInput: document.querySelector('#listing-form input[name="photos"]'),
  listingPhotoPreviews: document.getElementById('listing-photo-previews'),
  agentListingsContainer: document.getElementById('agent-listings'),
  buyerMessagesSection: document.getElementById('buyer-messages'),
  buyerMessagesContainer: document.getElementById('buyer-messages-list'),
  conversationModal: document.getElementById('conversation-modal'),
  conversationModalDialog: document.querySelector('#conversation-modal .conversation-modal__dialog'),
  conversationModalContent: document.querySelector('#conversation-modal .conversation-modal__content'),
  conversationModalList: document.getElementById('conversation-modal-list'),
  conversationModalEmpty: document.getElementById('conversation-modal-empty'),
  conversationModalPlaceholder: document.querySelector('#conversation-modal [data-modal-placeholder]'),
  messageCenterToggle: document.getElementById('message-center-toggle'),
  logoutToggle: document.getElementById('logout-toggle'),
  listingSubmitButton: document.getElementById('listing-submit'),
  listingCancelButton: document.getElementById('listing-cancel')
};

const state = {
  token: null,
  user: null,
  listings: [],
  myListings: [],
  activeFilters: {},
  editingListingId: null,
  conversationsById: {},
  listingConversations: {},
  agentConversations: [],
  buyerConversations: [],
  activeConversationId: null,
  pendingListingId: null,
  pendingListingContext: null
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

const layoutAnchors = {
  agentToolsParent: elements.agentToolsSection?.parentElement || null,
  agentToolsNextSibling: elements.agentToolsSection?.nextElementSibling || null
};

const conversationStatusTimers = new WeakMap();

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
  state.listings = [];
  state.myListings = [];
  state.activeFilters = {};
  state.editingListingId = null;
  state.conversationsById = {};
  state.listingConversations = {};
  state.agentConversations = [];
  state.buyerConversations = [];
  state.activeConversationId = null;
  state.pendingListingId = null;
  state.pendingListingContext = null;
  if (elements.listingForm) {
    resetListingForm();
  }
  closeConversationModal();
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

  if (elements.heroActionButtons) {
    elements.heroActionButtons.hidden = isGuest;
  }

  if (elements.messageCenterToggle) {
    elements.messageCenterToggle.hidden = isGuest;
    elements.messageCenterToggle.disabled = isGuest;
    elements.messageCenterToggle.setAttribute('aria-expanded', isConversationModalOpen() ? 'true' : 'false');
    if (isGuest) {
      elements.messageCenterToggle.classList.remove('hero__icon-button--active');
    }
  }

  if (elements.savedSearchToggle) {
    const shouldShowSavedSearch = !isGuest && state.user.role === 'user';
    elements.savedSearchToggle.hidden = !shouldShowSavedSearch;
    elements.savedSearchToggle.disabled = !shouldShowSavedSearch;
  }

  if (elements.logoutToggle) {
    elements.logoutToggle.hidden = isGuest;
    elements.logoutToggle.disabled = isGuest;
  }

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
  `;
}

function syncDashboardLayout() {
  if (!elements.appShell) {
    return;
  }

  const isAgent = Boolean(state.user && state.user.role === 'agent');
  const isBuyer = Boolean(state.user && state.user.role !== 'agent');
  const listingSections = [elements.listingResultsSection, elements.listingFiltersSection].filter(Boolean);
  const primaryColumn = elements.dashboardPrimary;
  const buyerAnchor =
    elements.buyerMessagesSection &&
    primaryColumn &&
    elements.buyerMessagesSection.parentElement === primaryColumn
      ? elements.buyerMessagesSection
      : null;

  elements.appShell.classList.toggle('dashboard--agent', isAgent);
  elements.appShell.classList.toggle('dashboard--buyer', isBuyer);

  if (isAgent) {
    if (primaryColumn && elements.agentToolsSection) {
      primaryColumn.prepend(elements.agentToolsSection);
    }
    if (primaryColumn && listingSections.length) {
      listingSections.forEach((section) => {
        if (!section) {
          return;
        }
        if (buyerAnchor && buyerAnchor.parentElement === primaryColumn) {
          primaryColumn.insertBefore(section, buyerAnchor);
        } else {
          primaryColumn.append(section);
        }
      });
    }
    return;
  }

  if (
    layoutAnchors.agentToolsParent &&
    elements.agentToolsSection &&
    elements.agentToolsSection.parentElement !== layoutAnchors.agentToolsParent
  ) {
    layoutAnchors.agentToolsParent.insertBefore(
      elements.agentToolsSection,
      layoutAnchors.agentToolsNextSibling || null
    );
  }

  if (primaryColumn && listingSections.length) {
    listingSections.forEach((section) => {
      if (!section) {
        return;
      }
      if (buyerAnchor && buyerAnchor.parentElement === primaryColumn) {
        primaryColumn.insertBefore(section, buyerAnchor);
      } else {
        primaryColumn.append(section);
      }
    });
  }
}

function toggleSections() {
  const isAuthenticated = Boolean(state.user);
  const isAgent = Boolean(state.user && state.user.role === 'agent');
  if (elements.authModal) {
    elements.authModal.hidden = isAuthenticated;
  }
  if (elements.appShell) {
    elements.appShell.hidden = !isAuthenticated;
  }
  document.body.classList.toggle('has-auth-modal', !isAuthenticated);
  elements.authSection.hidden = isAuthenticated;
  if (elements.listingResultsSection) {
    elements.listingResultsSection.hidden = !isAuthenticated;
  }
  if (elements.listingFiltersSection) {
    elements.listingFiltersSection.hidden = !isAuthenticated;
  }
  if (elements.agentToolsSection) {
    elements.agentToolsSection.hidden = !isAuthenticated || !isAgent;
  }
  if (elements.buyerMessagesSection) {
    elements.buyerMessagesSection.hidden = true;
  }

  syncDashboardLayout();
}

function updateUI() {
  updateUserStatus();
  toggleSections();
  if (state.user) {
    fetchListings();
    if (state.user.role === 'user') {
      fetchBuyerConversations();
    }
    if (state.user.role === 'agent') {
      fetchMyListings();
      fetchAgentConversations();
      if (elements.buyerMessagesContainer) {
        elements.buyerMessagesContainer.innerHTML = '';
      }
    }
  } else {
    elements.listingsContainer.innerHTML = '';
    if (elements.agentListingsContainer) {
      elements.agentListingsContainer.innerHTML = '';
    }
    if (elements.buyerMessagesContainer) {
      elements.buyerMessagesContainer.innerHTML = '';
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

  return conversation;
}

function getConversationSortValue(conversation) {
  if (!conversation) {
    return 0;
  }

  const timestamp = conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt;
  return timestamp ? new Date(timestamp).getTime() : 0;
}

function sortConversations(list) {
  return list.sort((a, b) => getConversationSortValue(b) - getConversationSortValue(a));
}

function upsertConversation(list, conversation) {
  if (!Array.isArray(list) || !conversation || !conversation._id) {
    return list;
  }

  const existingIndex = list.findIndex((item) => item._id === conversation._id);
  if (existingIndex === -1) {
    list.push(conversation);
  } else {
    list[existingIndex] = conversation;
  }

  return sortConversations(list);
}

function handleConversationUpdate(conversation) {
  if (!conversation) {
    return;
  }

  const stored = storeConversation(conversation) || conversation;

  if (state.user?.role === 'agent') {
    upsertConversation(state.agentConversations, stored);
  } else if (state.user?.role === 'user') {
    upsertConversation(state.buyerConversations, stored);
    renderBuyerConversations();
  }

  const listingId = extractId(stored.listing);
  if (state.pendingListingId && listingId && listingId === state.pendingListingId) {
    state.activeConversationId = stored._id || null;
    state.pendingListingId = null;
    state.pendingListingContext = null;
  }

  if (isConversationModalOpen()) {
    syncConversationModal();
  }
}

function getCurrentUserConversations() {
  if (!state.user) {
    return [];
  }

  if (state.user.role === 'agent') {
    return state.agentConversations || [];
  }

  return state.buyerConversations || [];
}

function buildConversationListItem(conversation) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'conversation-modal__list-item';
  button.dataset.conversationId = conversation?._id || '';
  const listingId = extractId(conversation?.listing);
  if (listingId) {
    button.dataset.listingId = listingId;
  }
  button.setAttribute('role', 'option');

  const isActive = state.activeConversationId && conversation?._id === state.activeConversationId;
  button.classList.toggle('is-active', Boolean(isActive));
  button.setAttribute('aria-selected', isActive ? 'true' : 'false');

  const title = document.createElement('div');
  title.className = 'conversation-modal__list-item-title';
  title.textContent = conversation?.listing?.title || 'Listing Conversation';
  button.append(title);

  const meta = document.createElement('div');
  meta.className = 'conversation-modal__list-item-meta';
  const counterpart = document.createElement('span');
  const counterpartName =
    state.user?.role === 'agent'
      ? conversation?.buyer?.fullName || 'Buyer'
      : conversation?.agent?.fullName || 'Listing Agent';
  counterpart.textContent = counterpartName;
  meta.append(counterpart);

  const timeValue = conversation?.lastMessageAt || conversation?.updatedAt || conversation?.createdAt;
  const timeText = formatTimestamp(timeValue);
  if (timeText) {
    const time = document.createElement('span');
    time.textContent = timeText;
    meta.append(time);
  }

  button.append(meta);

  const snippet = document.createElement('p');
  snippet.className = 'conversation-modal__list-item-snippet';
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  if (lastMessage?.body) {
    const senderId = extractId(lastMessage.sender);
    const isCurrentUser = senderId && senderId === getUserId();
    const senderLabel = isCurrentUser ? 'You' : lastMessage.sender?.fullName || counterpartName;
    const body = lastMessage.body.trim();
    const truncated = body.length > 100 ? `${body.slice(0, 97)}…` : body;
    snippet.textContent = `${senderLabel}: ${truncated}`;
  } else {
    snippet.textContent = 'No messages yet.';
  }
  button.append(snippet);

  return button;
}

function renderConversationSidebar() {
  if (!elements.conversationModalList) {
    return;
  }

  const listEl = elements.conversationModalList;
  listEl.innerHTML = '';

  const conversations = getCurrentUserConversations();
  const hasConversations = Array.isArray(conversations) && conversations.length > 0;
  const hasPending = Boolean(state.pendingListingId && state.pendingListingContext);

  if (elements.conversationModalEmpty) {
    elements.conversationModalEmpty.hidden = hasConversations || hasPending;
  }

  if (hasPending) {
    const composeItem = document.createElement('button');
    composeItem.type = 'button';
    composeItem.className = 'conversation-modal__list-item conversation-modal__list-item--compose';
    composeItem.dataset.listingId = state.pendingListingId;
    composeItem.setAttribute('role', 'option');
    const isActive = !state.activeConversationId;
    composeItem.classList.toggle('is-active', isActive);
    composeItem.setAttribute('aria-selected', isActive ? 'true' : 'false');

    const title = document.createElement('div');
    title.className = 'conversation-modal__list-item-title';
    title.textContent = state.pendingListingContext?.title || 'New Message';
    composeItem.append(title);

    const meta = document.createElement('div');
    meta.className = 'conversation-modal__list-item-meta';
    const counterpart = document.createElement('span');
    counterpart.textContent = state.pendingListingContext?.agent?.fullName || 'Listing Agent';
    meta.append(counterpart);
    composeItem.append(meta);

    const snippet = document.createElement('p');
    snippet.className = 'conversation-modal__list-item-snippet';
    snippet.textContent = 'Start a message for this property.';
    composeItem.append(snippet);

    listEl.append(composeItem);
  }

  if (hasConversations) {
    const sorted = conversations.slice();
    sortConversations(sorted);
    sorted.forEach((conversationItem) => {
      const item = buildConversationListItem(conversationItem);
      listEl.append(item);
    });
  }
}

function updateConversationModalContent({ conversation = null, listingId = null, listing = null } = {}) {
  if (!elements.conversationModalContent) {
    return;
  }

  const container = elements.conversationModalContent;
  const placeholder = elements.conversationModalPlaceholder;
  const form = container.querySelector('.conversation__form');
  const textarea = form?.querySelector('textarea[name="message"]');
  const sendButton = form?.querySelector('button[type="submit"]');
  const helper = container.querySelector('[data-compose-helper]');
  const recipientEl = container.querySelector('[data-recipient]');
  const listingTitleEl = container.querySelector('[data-listing-title]');
  const thread = container.querySelector('.conversation__thread');

  const resolvedConversation = conversation || null;
  const resolvedListingId = listingId || extractId(resolvedConversation?.listing);
  const resolvedListing = listing || resolvedConversation?.listing || null;

  const agentName = resolvedConversation?.agent?.fullName || resolvedListing?.agent?.fullName || 'the listing agent';
  const buyerName = resolvedConversation?.buyer?.fullName || '';
  const recipientName =
    state.user?.role === 'agent'
      ? buyerName || 'the buyer'
      : agentName || 'the listing agent';
  if (recipientEl) {
    recipientEl.textContent = recipientName;
  }

  const listingTitle = resolvedListing?.title || '';
  if (listingTitleEl) {
    listingTitleEl.textContent = listingTitle ? `Regarding ${listingTitle}` : '';
    listingTitleEl.hidden = !listingTitle;
  }

  if (form) {
    if (resolvedListingId) {
      form.dataset.listingId = resolvedListingId;
    } else {
      delete form.dataset.listingId;
    }
    form.dataset.conversationId = resolvedConversation?._id || '';
  }

  renderConversation(container, resolvedConversation);

  const hasConversation = Boolean(resolvedConversation);
  const hasContext = Boolean(resolvedListingId);
  const hasMessages = Boolean(
    resolvedConversation && Array.isArray(resolvedConversation.messages) && resolvedConversation.messages.length
  );

  if (placeholder) {
    if (!hasConversation && !hasContext) {
      placeholder.textContent = 'Select a conversation to view messages.';
      placeholder.hidden = false;
    } else if (!hasConversation && hasContext) {
      placeholder.textContent = 'Introduce yourself or request a tour to start this conversation.';
      placeholder.hidden = false;
    } else if (hasConversation && !hasMessages) {
      placeholder.textContent = 'No messages yet. Send a note to get the conversation going.';
      placeholder.hidden = false;
    } else {
      placeholder.hidden = true;
    }
  }

  if (thread && placeholder) {
    thread.hidden = !placeholder.hidden && !hasMessages;
  }

  if (helper) {
    helper.hidden = hasConversation || hasContext;
  }

  const canCompose = hasConversation || hasContext;
  if (textarea) {
    textarea.disabled = !canCompose;
    if (!canCompose) {
      textarea.value = '';
    }
  }
  if (sendButton) {
    sendButton.disabled = !canCompose;
  }
}

function syncConversationModal() {
  if (!isConversationModalOpen()) {
    return;
  }

  renderConversationSidebar();

  const activeConversation = state.activeConversationId
    ? state.conversationsById[state.activeConversationId]
    : null;

  const listingId = activeConversation
    ? extractId(activeConversation.listing)
    : state.pendingListingId;

  const listing =
    activeConversation?.listing ||
    state.pendingListingContext ||
    (listingId ? findListingById(listingId) : null);

  updateConversationModalContent({ conversation: activeConversation, listingId, listing });
}

async function ensureConversationsLoaded(force = false) {
  if (!state.user) {
    return;
  }

  const existing = getCurrentUserConversations();
  if (!force && existing.length) {
    return;
  }

  if (state.user.role === 'agent') {
    await fetchAgentConversations();
  } else if (state.user.role === 'user') {
    await fetchBuyerConversations();
  }
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

  const existingTimeout = conversationStatusTimers.get(container);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    conversationStatusTimers.delete(container);
  }

  statusEl.textContent = message || '';
  statusEl.hidden = !message;
  statusEl.classList.remove('conversation__status--error', 'conversation__status--success');

  if (type === 'error') {
    statusEl.classList.add('conversation__status--error');
  } else if (type === 'success') {
    statusEl.classList.add('conversation__status--success');
  }

  if (message) {
    statusEl.scrollIntoView({ block: 'nearest' });
  }
}

function clearConversationStatus(container) {
  setConversationStatus(container, '');
}

function flashConversationStatus(container, message, type = 'info', duration = 4000) {
  if (!container) {
    return;
  }

  setConversationStatus(container, message, type);

  if (!message) {
    return;
  }

  const timeoutId = window.setTimeout(() => {
    if (conversationStatusTimers.get(container) === timeoutId) {
      conversationStatusTimers.delete(container);
      setConversationStatus(container, '');
    }
  }, duration);

  conversationStatusTimers.set(container, timeoutId);
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
    delete form.dataset.listingId;
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
    handleConversationUpdate(conversation);
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
  const canContact = canMessageListing(listing);

  if (contactButton) {
    contactButton.hidden = !canContact;
    contactButton.dataset.listingId = listingId || '';
    if (listing?.title) {
      contactButton.dataset.listingTitle = listing.title;
    } else {
      delete contactButton.dataset.listingTitle;
    }
    if (listing?.agent?.fullName) {
      contactButton.dataset.agentName = listing.agent.fullName;
    } else {
      delete contactButton.dataset.agentName;
    }
  }
}

async function openConversationModal({ listingId = null, listing = null, conversation = null, conversationId = null } = {}) {
  if (!elements.conversationModal || !elements.conversationModalDialog || !elements.conversationModalContent) {
    return;
  }

  await ensureConversationsLoaded(!listingId && !conversation && !conversationId);

  let resolvedConversation = null;
  if (conversation) {
    resolvedConversation = storeConversation(conversation);
  } else if (conversationId) {
    resolvedConversation = state.conversationsById[conversationId] || null;
  }

  let targetListingId = listingId || (resolvedConversation ? extractId(resolvedConversation.listing) : '');
  if (!resolvedConversation && targetListingId) {
    resolvedConversation = getConversationForListing(targetListingId);
  }

  if (!resolvedConversation && !targetListingId) {
    const existing = getCurrentUserConversations();
    if (existing.length) {
      resolvedConversation = existing[0];
      targetListingId = extractId(resolvedConversation?.listing);
    }
  }

  let resolvedListing =
    listing ||
    resolvedConversation?.listing ||
    (targetListingId ? findListingById(targetListingId) : null);

  if (resolvedConversation) {
    storeConversation(resolvedConversation);
  }

  state.activeConversationId = resolvedConversation?._id || null;
  state.pendingListingId = resolvedConversation ? null : targetListingId || null;
  state.pendingListingContext = resolvedConversation ? null : resolvedListing || null;

  const modal = elements.conversationModal;
  modal.hidden = false;
  modal.classList.add('conversation-modal--open');
  document.body.classList.add('conversation-modal-open');

  if (elements.messageCenterToggle) {
    elements.messageCenterToggle.classList.add('hero__icon-button--active');
    elements.messageCenterToggle.setAttribute('aria-expanded', 'true');
  }

  clearConversationStatus(elements.conversationModalContent);
  syncConversationModal();

  const activeListingId = state.activeConversationId
    ? extractId((state.conversationsById[state.activeConversationId] || {}).listing)
    : state.pendingListingId || '';
  if (activeListingId) {
    modal.dataset.listingId = activeListingId;
  } else {
    delete modal.dataset.listingId;
  }
  modal.dataset.conversationId = state.activeConversationId || '';

  const textarea = elements.conversationModalContent.querySelector('textarea[name="message"]');
  if (textarea && !textarea.disabled) {
    textarea.focus();
  }

  if (state.pendingListingId && !resolvedConversation) {
    try {
      const loaded = await loadConversationForListing(state.pendingListingId, elements.conversationModalContent);
      if (loaded) {
        state.activeConversationId = loaded._id || null;
        state.pendingListingId = null;
        state.pendingListingContext = null;
        modal.dataset.conversationId = state.activeConversationId || '';
        syncConversationModal();
      }
    } catch (error) {
      // handled within loadConversationForListing
    }
  }
}

function closeConversationModal() {
  if (!elements.conversationModal || !elements.conversationModalDialog) {
    return;
  }

  const modal = elements.conversationModal;
  modal.classList.remove('conversation-modal--open');
  modal.hidden = true;
  document.body.classList.remove('conversation-modal-open');
  delete modal.dataset.listingId;
  delete modal.dataset.conversationId;

  if (elements.messageCenterToggle) {
    elements.messageCenterToggle.classList.remove('hero__icon-button--active');
    elements.messageCenterToggle.setAttribute('aria-expanded', 'false');
  }

  if (elements.conversationModalContent) {
    resetConversationForm(elements.conversationModalContent);
    clearConversationStatus(elements.conversationModalContent);
  }

  state.activeConversationId = null;
  state.pendingListingId = null;
  state.pendingListingContext = null;
}

function isConversationModalOpen() {
  return Boolean(elements.conversationModal && !elements.conversationModal.hidden);
}

function handleConversationModalClick(event) {
  if (!elements.conversationModal) {
    return;
  }

  const dismissTrigger = event.target.closest('[data-conversation-close],[data-conversation-dismiss]');
  if (!dismissTrigger || !elements.conversationModal.contains(dismissTrigger)) {
    return;
  }

  event.preventDefault();
  closeConversationModal();
}

function handleConversationModalSubmit(event) {
  if (!elements.conversationModal) {
    return;
  }

  const form = event.target.closest('.conversation__form');
  if (!form || !elements.conversationModal.contains(form)) {
    return;
  }

  event.preventDefault();
  const listingId = form.dataset.listingId;
  if (!listingId) {
    return;
  }

  sendListingMessage(listingId, form, elements.conversationModalContent);
}

function handleGlobalKeydown(event) {
  if (event.key !== 'Escape') {
    return;
  }

  if (!isConversationModalOpen()) {
    return;
  }

  event.preventDefault();
  closeConversationModal();
}

function handleConversationListClick(event) {
  if (!elements.conversationModalList) {
    return;
  }

  const option = event.target.closest('.conversation-modal__list-item');
  if (!option || !elements.conversationModalList.contains(option)) {
    return;
  }

  event.preventDefault();
  const conversationId = option.dataset.conversationId || '';
  const listingId = option.dataset.listingId || '';

  if (conversationId && conversationId === state.activeConversationId) {
    return;
  }

  if (conversationId) {
    state.activeConversationId = conversationId;
    state.pendingListingId = null;
    state.pendingListingContext = null;
    syncConversationModal();
    return;
  }

  if (listingId) {
    const listing = findListingById(listingId) || state.pendingListingContext || null;
    state.activeConversationId = null;
    state.pendingListingId = listingId;
    state.pendingListingContext = listing;
    syncConversationModal();
  }
}

async function handleMessageCenterToggle(event) {
  event.preventDefault();

  if (!state.user) {
    return;
  }

  if (isConversationModalOpen()) {
    closeConversationModal();
    return;
  }

  await openConversationModal();
}

async function sendListingMessage(listingId, form, containerOverride = null) {
  if (!listingId || !form) {
    return;
  }

  const container =
    containerOverride || form.closest('.conversation-modal__content, .conversation-modal__dialog, .listing__conversation');
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
    handleConversationUpdate(conversation);
    if (
      elements.conversationModal &&
      (container === elements.conversationModalContent || container === elements.conversationModalDialog)
    ) {
      elements.conversationModal.dataset.conversationId = conversation._id || '';
    }
    if (textarea) {
      textarea.value = '';
    }
    flashConversationStatus(container, 'Message sent', 'success');
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
  if (!contactButton || !elements.listingsContainer.contains(contactButton)) {
    return;
  }

  event.preventDefault();
  const listingId = contactButton.dataset.listingId;
  if (!listingId) {
    return;
  }

  const listing = findListingById(listingId);
  const conversation = getConversationForListing(listingId);
  const fallbackListing = listing || {
    _id: listingId,
    title: contactButton.dataset.listingTitle || 'Listing Conversation',
    agent: {
      _id: contactButton.dataset.agentId || '',
      fullName: contactButton.dataset.agentName || 'Listing Agent'
    }
  };

  if (!canMessageListing(fallbackListing) && !conversation) {
    return;
  }

  openConversationModal({ listingId, listing: fallbackListing, conversation });
}

function handleSavedSearchToggleClick() {
  if (!state.user || state.user.role !== 'user') {
    return;
  }

  window.location.href = 'saved-searches.html';
}

function renderBuyerConversations() {
  if (!elements.buyerMessagesContainer) {
    return;
  }

  const container = elements.buyerMessagesContainer;
  container.innerHTML = '';

  if (!state.user || state.user.role !== 'user') {
    return;
  }

  if (elements.buyerMessagesSection) {
    elements.buyerMessagesSection.hidden = false;
  }

  sortConversations(state.buyerConversations);

  if (!state.buyerConversations.length) {
    container.innerHTML =
      '<div class="empty-state">Reach out to a listing agent to start a conversation.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  state.buyerConversations.forEach((conversation) => {
    const card = document.createElement('article');
    card.className = 'conversation-summary';
    card.dataset.conversationId = conversation._id;
    const listingId = extractId(conversation.listing);
    if (listingId) {
      card.dataset.listingId = listingId;
    }

    const header = document.createElement('div');
    header.className = 'conversation-summary__header';

    const title = document.createElement('h4');
    title.className = 'conversation-summary__title';
    title.textContent = conversation.listing?.title || 'Listing Conversation';
    header.append(title);

    const timeValue = conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt;
    if (timeValue) {
      const timeEl = document.createElement('span');
      timeEl.className = 'conversation-summary__time';
      timeEl.textContent = formatTimestamp(timeValue);
      header.append(timeEl);
    }

    const meta = document.createElement('p');
    meta.className = 'conversation-summary__meta';
    const metaParts = [];

    if (conversation.agent?.fullName) {
      metaParts.push(`Agent: ${conversation.agent.fullName}`);
    }

    const locationParts = [];
    if (conversation.listing?.area) {
      locationParts.push(conversation.listing.area);
    }

    const cityState = [conversation.listing?.address?.city, conversation.listing?.address?.state]
      .filter(Boolean)
      .join(', ');
    if (cityState) {
      locationParts.push(cityState);
    }

    if (locationParts.length) {
      metaParts.push(locationParts.join(' • '));
    }

    if (metaParts.length) {
      meta.textContent = metaParts.join(' • ');
      card.append(header, meta);
    } else {
      card.append(header);
    }

    const lastMessage =
      Array.isArray(conversation.messages) && conversation.messages.length
        ? conversation.messages[conversation.messages.length - 1]
        : null;

    const preview = document.createElement('p');
    preview.className = 'conversation-summary__preview';
    if (lastMessage) {
      const senderId = extractId(lastMessage.sender);
      const senderLabel = senderId && senderId === getUserId()
        ? 'You'
        : lastMessage.sender?.fullName || 'Agent';
      const body = lastMessage.body || '';
      const snippet = body.length > 160 ? `${body.slice(0, 157)}…` : body;
      preview.textContent = `${senderLabel}: ${snippet}`;
    } else {
      preview.textContent = 'No messages yet. Send a note to get the conversation started.';
    }
    card.append(preview);

    const actions = document.createElement('div');
    actions.className = 'conversation-summary__actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'btn btn--small';
    openButton.dataset.action = 'open-conversation';
    openButton.textContent = 'Open Messages';
    actions.append(openButton);
    card.append(actions);

    fragment.append(card);
  });

  container.append(fragment);
}

function handleBuyerConversationClick(event) {
  if (!elements.buyerMessagesContainer) {
    return;
  }

  const openButton = event.target.closest('[data-action="open-conversation"]');
  if (!openButton || !elements.buyerMessagesContainer.contains(openButton)) {
    return;
  }

  event.preventDefault();
  const card = openButton.closest('[data-conversation-id]');
  if (!card) {
    return;
  }

  const listingId = card.dataset.listingId;
  if (!listingId) {
    return;
  }

  const conversationId = card.dataset.conversationId;
  const conversation =
    state.buyerConversations.find((item) => item._id === conversationId) || getConversationForListing(listingId);

  openConversationModal({ listingId, conversation });
}

async function fetchAgentConversations() {
  if (!state.user || state.user.role !== 'agent') {
    state.agentConversations = [];
    return;
  }

  try {
    const conversations = await apiRequest('/conversations');
    state.agentConversations = Array.isArray(conversations) ? conversations.slice() : [];
    sortConversations(state.agentConversations);
    state.agentConversations.forEach((conversation) => {
      storeConversation(conversation);
    });
    if (isConversationModalOpen()) {
      syncConversationModal();
    }
  } catch (error) {
    console.error(error);
  }
}

async function fetchBuyerConversations() {
  if (!state.user || state.user.role !== 'user') {
    state.buyerConversations = [];
    if (elements.buyerMessagesContainer) {
      elements.buyerMessagesContainer.innerHTML = '';
    }
    return;
  }

  try {
    const conversations = await apiRequest('/conversations');
    const list = Array.isArray(conversations) ? conversations.slice() : [];
    state.buyerConversations = sortConversations(list);
    state.buyerConversations.forEach((conversation) => {
      storeConversation(conversation);
    });
    renderBuyerConversations();
    if (isConversationModalOpen()) {
      syncConversationModal();
    }
  } catch (error) {
    state.buyerConversations = [];
    if (elements.buyerMessagesContainer) {
      elements.buyerMessagesContainer.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
  }
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

  if (elements.filtersForm) {
    elements.filtersForm.addEventListener('submit', handleFilterSubmit);
  }

  if (elements.agentListingsContainer) {
    elements.agentListingsContainer.addEventListener('click', handleAgentListingsClick);
  }

  if (elements.listingsContainer) {
    elements.listingsContainer.addEventListener('click', handleListingCardClick);
  }

  if (elements.buyerMessagesContainer) {
    elements.buyerMessagesContainer.addEventListener('click', handleBuyerConversationClick);
  }

  if (elements.conversationModal) {
    elements.conversationModal.addEventListener('click', handleConversationModalClick);
    elements.conversationModal.addEventListener('submit', handleConversationModalSubmit);
  }

  if (elements.conversationModalList) {
    elements.conversationModalList.addEventListener('click', handleConversationListClick);
  }

  if (elements.messageCenterToggle) {
    elements.messageCenterToggle.addEventListener('click', handleMessageCenterToggle);
  }

  if (elements.savedSearchToggle) {
    elements.savedSearchToggle.addEventListener('click', handleSavedSearchToggleClick);
  }

  if (elements.logoutToggle) {
    elements.logoutToggle.addEventListener('click', handleLogout);
  }

  document.addEventListener('keydown', handleGlobalKeydown);
}

bootstrap();
