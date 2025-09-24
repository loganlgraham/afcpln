import { renderListingCollection } from './listingCards.js';

const API_BASE = '/api';

const elements = {
  listings: document.getElementById('public-listings'),
  template: document.getElementById('listing-template')
};

const state = {
  token: null,
  user: null,
  listings: [],
  listingConversations: {},
  openConversations: new Set()
};

function restoreAuth() {
  try {
    const stored = localStorage.getItem('afcpln_auth');
    if (!stored) {
      return;
    }

    const parsed = JSON.parse(stored);
    state.token = parsed?.token || null;
    state.user = parsed?.user || null;
  } catch (error) {
    console.warn('Unable to read stored auth data', error);
  }
}

function showLoading() {
  if (elements.listings) {
    elements.listings.innerHTML = '<div class="empty-state">Loading listings…</div>';
  }
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

function findListingById(listingId) {
  if (!listingId) {
    return null;
  }

  return state.listings.find((listing) => extractId(listing) === listingId) || null;
}

function canMessageListing(listing) {
  if (!state.user || state.user.role !== 'user') {
    return false;
  }

  const agentId = extractId(listing?.agent);
  if (!agentId) {
    return false;
  }

  const userId = state.user._id || state.user.id;
  return agentId !== userId;
}

function storeConversation(conversation) {
  if (!conversation || !conversation._id) {
    return null;
  }

  const listingId = extractId(conversation.listing);
  if (listingId) {
    state.listingConversations[listingId] = conversation;
  }

  return conversation;
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
  const userId = state.user?._id || state.user?.id || null;

  messages.forEach((message) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'conversation__message';

    const senderId = extractId(message?.sender);
    const isCurrentUser = senderId && userId && senderId === userId;
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
      metaEl.textContent = new Date(message.createdAt).toLocaleString([], {
        dateStyle: 'short',
        timeStyle: 'short'
      });
      wrapper.append(metaEl);
    }

    fragment.append(wrapper);
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

async function apiRequest(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
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

async function loadConversationForListing(listingId, container) {
  if (!listingId) {
    return null;
  }

  if (!state.token) {
    return null;
  }

  const existing = state.listingConversations[listingId];
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

async function sendListingMessage(listingId, form) {
  if (!listingId || !form) {
    return;
  }

  const container = form.closest('.listing__conversation');
  if (!container) {
    return;
  }

  if (!state.token) {
    setConversationStatus(container, 'Sign in to send a message.', 'error');
    return;
  }

  const textarea = form.querySelector('textarea[name="message"]');
  const message = textarea?.value?.trim();
  if (!message) {
    setConversationStatus(container, 'Please enter a message.', 'error');
    return;
  }

  const conversationId = form.dataset.conversationId;
  const sendButton = form.querySelector('button[type="submit"]');

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

function decorateListingCard(node, listing) {
  if (!node) {
    return;
  }

  const listingId = extractId(listing);
  const contactButton = node.querySelector('.listing__contact-link');
  const conversationContainer = node.querySelector('.listing__conversation');
  const canContact = canMessageListing(listing) && Boolean(state.token);

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
    const conversation = state.listingConversations[listingId];
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

  if (!state.user || state.user.role !== 'user') {
    const container = card.querySelector('.listing__conversation');
    if (container) {
      container.hidden = false;
      setConversationStatus(container, 'Sign in as a buyer to contact the agent.', 'error');
    }
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

  const existing = state.listingConversations[listingId];
  renderConversation(conversationContainer, existing);
  clearConversationStatus(conversationContainer);

  try {
    await loadConversationForListing(listingId, conversationContainer);
  } catch (error) {
    // handled in loader
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

function handleCardClick(event) {
  if (!elements.listings) {
    return;
  }

  const contactButton = event.target.closest('.listing__contact-link');
  if (contactButton && elements.listings.contains(contactButton)) {
    event.preventDefault();
    const listingId = contactButton.dataset.listingId;
    const card = contactButton.closest('.listing');
    if (listingId && card) {
      openListingConversation(listingId, card);
    }
    return;
  }

  const closeButton = event.target.closest('[data-conversation-close]');
  if (closeButton && elements.listings.contains(closeButton)) {
    event.preventDefault();
    const container = closeButton.closest('.listing__conversation');
    const listingId = container?.dataset.listingId;
    const card = closeButton.closest('.listing');
    if (listingId && card) {
      closeListingConversation(listingId, card);
    }
  }
}

function handleConversationSubmit(event) {
  if (!elements.listings) {
    return;
  }

  const form = event.target.closest('.conversation__form');
  if (!form || !elements.listings.contains(form)) {
    return;
  }

  event.preventDefault();
  const listingId = form.dataset.listingId;
  if (!listingId) {
    return;
  }

  sendListingMessage(listingId, form);
}

async function fetchListings() {
  showLoading();
  try {
    const data = await apiRequest('/listings');
    state.listings = Array.isArray(data) ? data : [];
    renderListingCollection(state.listings, elements.template, elements.listings, {
      onRender: decorateListingCard
    });
  } catch (error) {
    if (elements.listings) {
      elements.listings.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
  }
}

restoreAuth();

if (elements.listings && elements.template?.content?.firstElementChild) {
  fetchListings();
  elements.listings.addEventListener('click', handleCardClick);
  elements.listings.addEventListener('submit', handleConversationSubmit);
} else if (elements.listings) {
  elements.listings.innerHTML = '<div class="empty-state">Listing template is missing.</div>';
}
