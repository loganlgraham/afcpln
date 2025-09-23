const listForm = document.getElementById('list-property-form');
const listMessage = document.getElementById('list-property-message');
const photoInput = document.getElementById('property-photo');
const photoPreview = document.getElementById('photo-preview');
const findForm = document.getElementById('find-listings-form');
const findMessage = document.getElementById('find-listings-message');
const registerForm = document.getElementById('register-form');
const registerMessage = document.getElementById('register-message');
const listingsContainer = document.getElementById('listing-results');
const emptyState = document.getElementById('listing-empty-state');
const resultsSummary = document.getElementById('results-summary');
const refreshButton = document.getElementById('refresh-listings');
const personaButtons = Array.from(document.querySelectorAll('[data-persona]'));
const listSection = document.querySelector('[data-section="list"]');
const findSection = document.querySelector('[data-section="find"]');
const initialPersona = document.body?.dataset?.initialPersona === 'agent' ? 'agent' : 'buyer';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_LISTING_SUMMARIES = {
  buyer: 'Recently added properties appear here. Use filters to refine your matches.',
  agent: 'Recently added properties appear here. Share your latest off-market opportunities with buyers.'
};
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

let activePersona = initialPersona;
let cachedListings = [];

function setFormMessage(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message || '';
  element.classList.remove('form-message--success', 'form-message--error');
  if (!message) {
    return;
  }
  if (type === 'success') {
    element.classList.add('form-message--success');
  }
  if (type === 'error') {
    element.classList.add('form-message--error');
  }
}

function setLoadingState(button, isLoading, loadingText) {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    if (loadingText) {
      button.textContent = loadingText;
    }
    button.disabled = true;
  } else {
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
    button.disabled = false;
  }
}

function normaliseValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getDefaultSummary() {
  return DEFAULT_LISTING_SUMMARIES[activePersona] || DEFAULT_LISTING_SUMMARIES.buyer;
}

async function fetchJson(input, init) {
  let response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    console.error('Network request failed:', error);
    throw new Error('Could not reach the server. Please try again in a moment.');
  }

  const rawText = await response.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch (error) {
      data = null;
    }
  }

  if (!response.ok) {
    const trimmed = rawText.trim();
    if (data && typeof data === 'object' && data !== null && typeof data.error === 'string' && data.error) {
      throw new Error(data.error);
    }
    if (trimmed) {
      console.error('Request failed with non-JSON response:', trimmed);
    }
    throw new Error(`Request failed with status ${response.status}. Please try again later.`);
  }

  if (data === null || typeof data !== 'object') {
    const trimmed = rawText.trim();
    if (trimmed) {
      console.error('Unexpected non-JSON response:', trimmed);
    }
    throw new Error('Unexpected response from the server. Please try again later.');
  }

  return data;
}

async function fileToBase64Payload(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Invalid file result'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

  return {
    filename: file.name,
    contentType: file.type,
    data: base64
  };
}

async function fileToPreviewUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function clearPhotoPreview() {
  if (!photoPreview) return;
  photoPreview.innerHTML = '';
  photoPreview.hidden = true;
}

async function handlePhotoSelection(event) {
  if (!photoPreview) return;
  const file = event.target.files && event.target.files[0];
  setFormMessage(listMessage, '');

  if (!file) {
    clearPhotoPreview();
    return;
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    setFormMessage(listMessage, 'Photo is too large. Please choose a file under 10MB.', 'error');
    event.target.value = '';
    clearPhotoPreview();
    return;
  }

  try {
    const previewUrl = await fileToPreviewUrl(file);
    const item = document.createElement('div');
    item.className = 'photo-preview__item';
    const image = document.createElement('img');
    image.src = previewUrl;
    image.alt = 'Selected property preview';
    item.appendChild(image);
    photoPreview.innerHTML = '';
    photoPreview.appendChild(item);
    photoPreview.hidden = false;
  } catch (error) {
    console.error('Photo preview failed:', error);
    setFormMessage(listMessage, 'Could not generate a preview for this image.', 'error');
    clearPhotoPreview();
  }
}

function formatCurrency(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return currencyFormatter.format(value);
}

function formatBathrooms(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return numberValue % 1 === 0 ? `${numberValue}` : numberValue.toFixed(1);
}

function formatSquareFeet(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return `${numberValue.toLocaleString()} sq ft`;
}

function formatTimestamp(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return '';
  }
}

function renderListings(listings, summaryText) {
  if (!listingsContainer || !emptyState || !resultsSummary) {
    return;
  }

  listingsContainer.innerHTML = '';
  const hasListings = Array.isArray(listings) && listings.length > 0;
  emptyState.hidden = hasListings;

  if (!hasListings) {
    if (typeof summaryText === 'string') {
      resultsSummary.textContent = summaryText;
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  listings.forEach(listing => {
    fragment.appendChild(createListingCard(listing));
  });
  listingsContainer.appendChild(fragment);

  if (typeof summaryText === 'string') {
    resultsSummary.textContent = summaryText;
  } else {
    resultsSummary.textContent = `Showing ${listings.length} ${listings.length === 1 ? 'listing' : 'listings'}.`;
  }
}

function createListingCard(listing) {
  const article = document.createElement('article');
  article.className = 'listing-card';
  article.setAttribute('role', 'listitem');

  if (listing.photoUrl) {
    const media = document.createElement('div');
    media.className = 'listing-card__media';
    const img = document.createElement('img');
    img.src = listing.photoUrl;
    img.alt = `${listing.title || 'Property'} photo`;
    media.appendChild(img);
    article.appendChild(media);
  }

  const content = document.createElement('div');
  content.className = 'listing-card__content';

  const title = document.createElement('h3');
  title.className = 'listing-card__title';
  title.textContent = listing.title || 'Untitled Property';
  content.appendChild(title);

  const priceTag = document.createElement('span');
  priceTag.className = 'tag';
  priceTag.textContent = formatCurrency(listing.price);
  content.appendChild(priceTag);

  const meta = document.createElement('div');
  meta.className = 'listing-card__meta';
  const locationParts = [listing.area, listing.city, listing.state].filter(Boolean);
  if (locationParts.length) {
    const location = document.createElement('span');
    location.textContent = locationParts.join(' · ');
    meta.appendChild(location);
  }
  if (listing.bedrooms !== null && listing.bedrooms !== undefined && listing.bedrooms !== '') {
    const bedrooms = document.createElement('span');
    bedrooms.textContent = `${listing.bedrooms} ${Number(listing.bedrooms) === 1 ? 'bed' : 'beds'}`;
    meta.appendChild(bedrooms);
  }
  const bathroomsDisplay = formatBathrooms(listing.bathrooms);
  if (bathroomsDisplay) {
    const bathrooms = document.createElement('span');
    bathrooms.textContent = `${bathroomsDisplay} ${Number(listing.bathrooms) === 1 ? 'bath' : 'baths'}`;
    meta.appendChild(bathrooms);
  }
  const squareFeetDisplay = formatSquareFeet(listing.squareFeet);
  if (squareFeetDisplay) {
    const sqft = document.createElement('span');
    sqft.textContent = squareFeetDisplay;
    meta.appendChild(sqft);
  }
  if (meta.children.length) {
    content.appendChild(meta);
  }

  if (listing.description) {
    const description = document.createElement('p');
    description.textContent = listing.description;
    description.className = 'listing-card__description';
    content.appendChild(description);
  }

  if (listing.createdAt) {
    const timestamp = document.createElement('p');
    timestamp.className = 'listing-card__timestamp';
    timestamp.textContent = `Added ${formatTimestamp(listing.createdAt)}`;
    content.appendChild(timestamp);
  }

  article.appendChild(content);
  return article;
}

async function loadListings() {
  if (!resultsSummary) return;
  setFormMessage(findMessage, '');
  setFormMessage(listMessage, '');
  if (refreshButton) {
    setLoadingState(refreshButton, true, 'Refreshing...');
  }
  try {
    const data = await fetchJson('/api/listings');
    cachedListings = Array.isArray(data.listings) ? data.listings : [];
    renderListings(cachedListings, getDefaultSummary());
  } catch (error) {
    console.error('Failed to load listings:', error);
    renderListings([], 'We could not load listings at the moment. Please try refreshing.');
  } finally {
    if (refreshButton) {
      setLoadingState(refreshButton, false);
    }
  }
}

async function handleListFormSubmit(event) {
  event.preventDefault();
  setFormMessage(listMessage, '');
  const submitButton = listForm.querySelector('button[type="submit"]');
  setLoadingState(submitButton, true, 'Publishing...');

  const formData = new FormData(listForm);
  const payload = {
    title: normaliseValue(formData.get('title')),
    area: normaliseValue(formData.get('area')),
    city: normaliseValue(formData.get('city')),
    state: normaliseValue(formData.get('state')),
    price: normaliseValue(formData.get('price')),
    bedrooms: normaliseValue(formData.get('bedrooms')),
    bathrooms: normaliseValue(formData.get('bathrooms')),
    squareFeet: normaliseValue(formData.get('squareFeet')),
    description: normaliseValue(formData.get('description')),
    photo: null
  };

  const photoFile = formData.get('photo');
  if (photoFile && photoFile.size) {
    if (photoFile.size > MAX_UPLOAD_SIZE) {
      setFormMessage(listMessage, 'Photo is too large. Please choose a file under 10MB.', 'error');
      setLoadingState(submitButton, false);
      return;
    }
    try {
      payload.photo = await fileToBase64Payload(photoFile);
    } catch (error) {
      console.error('Photo encoding failed:', error);
      setFormMessage(listMessage, 'We could not process that image. Try another file.', 'error');
      setLoadingState(submitButton, false);
      return;
    }
  }

  try {
    const data = await fetchJson('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!data.listing || typeof data.listing !== 'object') {
      throw new Error('We could not save this listing. Please try again.');
    }
    cachedListings = [data.listing, ...cachedListings];
    renderListings(cachedListings, 'Listing published!');
    setFormMessage(listMessage, data.message || 'Property listed successfully.', 'success');
    listForm.reset();
    clearPhotoPreview();
  } catch (error) {
    console.error('Failed to submit listing:', error);
    setFormMessage(listMessage, error.message || 'We could not save this listing.', 'error');
  } finally {
    setLoadingState(submitButton, false);
  }
}

async function handleFindFormSubmit(event) {
  event.preventDefault();
  setFormMessage(findMessage, '');
  const submitButton = findForm.querySelector('button[type="submit"]');
  setLoadingState(submitButton, true, 'Searching...');

  const formData = new FormData(findForm);
  const payload = {
    area: normaliseValue(formData.get('area')),
    city: normaliseValue(formData.get('city')),
    state: normaliseValue(formData.get('state')),
    minPrice: normaliseValue(formData.get('minPrice')),
    maxPrice: normaliseValue(formData.get('maxPrice')),
    bedrooms: normaliseValue(formData.get('bedrooms')),
    bathrooms: normaliseValue(formData.get('bathrooms'))
  };

  try {
    const data = await fetchJson('/api/listings/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const results = Array.isArray(data.results) ? data.results : [];
    renderListings(results, results.length ? `Found ${results.length} matching ${results.length === 1 ? 'listing' : 'listings'}.` : 'No listings matched your filters. Try widening your search.');
    setFormMessage(findMessage, results.length ? 'Filters applied.' : 'No listings matched your filters.', results.length ? 'success' : 'error');
  } catch (error) {
    console.error('Filter search failed:', error);
    setFormMessage(findMessage, error.message || 'Filters could not be applied.', 'error');
  } finally {
    setLoadingState(submitButton, false);
  }
}

function handleFindFormReset() {
  setTimeout(() => {
    setFormMessage(findMessage, '');
    renderListings(cachedListings, 'Filters cleared. Showing all listings.');
  }, 0);
}

function applyPersona(persona) {
  const targetPersona = persona === 'agent' ? 'agent' : 'buyer';
  activePersona = targetPersona;

  personaButtons.forEach(button => {
    const isActive = button.dataset.persona === targetPersona;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  if (document.body) {
    document.body.dataset.activePersona = targetPersona;
  }

  if (listSection) {
    listSection.hidden = targetPersona !== 'agent';
  }

  if (findSection) {
    findSection.hidden = targetPersona !== 'buyer';
  }

  if (targetPersona === 'agent') {
    setFormMessage(findMessage, '');
  } else {
    setFormMessage(listMessage, '');
  }

  if (resultsSummary && (!listingsContainer || listingsContainer.children.length === 0)) {
    resultsSummary.textContent = getDefaultSummary();
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  setFormMessage(registerMessage, '');
  const submitButton = registerForm.querySelector('button[type="submit"]');
  setLoadingState(submitButton, true, 'Creating...');

  const formData = new FormData(registerForm);
  const payload = {
    name: normaliseValue(formData.get('name')),
    email: normaliseValue(formData.get('email')),
    password: String(formData.get('password') || '')
  };

  try {
    const data = await fetchJson('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setFormMessage(registerMessage, data.message || 'Registration successful!', 'success');
    registerForm.reset();
  } catch (error) {
    console.error('Registration failed:', error);
    setFormMessage(registerMessage, error.message || 'Registration failed.', 'error');
  } finally {
    setLoadingState(submitButton, false);
  }
}

if (photoInput) {
  photoInput.addEventListener('change', handlePhotoSelection);
}

if (listForm) {
  listForm.addEventListener('submit', handleListFormSubmit);
  listForm.addEventListener('reset', () => {
    setTimeout(() => {
      setFormMessage(listMessage, '');
      clearPhotoPreview();
    }, 0);
  });
}

if (findForm) {
  findForm.addEventListener('submit', handleFindFormSubmit);
  findForm.addEventListener('reset', handleFindFormReset);
}

if (registerForm) {
  registerForm.addEventListener('submit', handleRegisterSubmit);
  registerForm.addEventListener('reset', () => {
    setTimeout(() => setFormMessage(registerMessage, ''), 0);
  });
}

if (personaButtons.length) {
  personaButtons.forEach(button => {
    button.addEventListener('click', () => {
      const persona = button.dataset.persona === 'agent' ? 'agent' : 'buyer';
      if (persona !== activePersona) {
        applyPersona(persona);
      }
    });
  });
}

applyPersona(initialPersona);

if (refreshButton) {
  refreshButton.addEventListener('click', loadListings);
}

window.addEventListener('DOMContentLoaded', loadListings);
