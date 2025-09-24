import { renderListingCollection } from './listingCards.js';

const API_BASE = '/api';

const elements = {
  listings: document.getElementById('public-listings'),
  template: document.getElementById('listing-template')
};

function showLoading() {
  if (elements.listings) {
    elements.listings.innerHTML = '<div class="empty-state">Loading listings…</div>';
  }
}

function getStoredToken() {
  try {
    const stored = localStorage.getItem('afcpln_auth');
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    return parsed?.token || null;
  } catch (error) {
    console.warn('Unable to read stored auth token', error);
    return null;
  }
}

async function fetchListings() {
  showLoading();
  try {
    const url = new URL(`${API_BASE}/listings`, window.location.origin);
    const headers = { Accept: 'application/json' };
    const token = getStoredToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error('Unable to load listings. Please try again later.');
    }

    const data = await response.json();
    renderListingCollection(data, elements.template, elements.listings);
  } catch (error) {
    if (elements.listings) {
      elements.listings.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
  }
}

if (elements.listings && elements.template?.content?.firstElementChild) {
  fetchListings();
} else if (elements.listings) {
  elements.listings.innerHTML = '<div class="empty-state">Listing template is missing.</div>';
}

