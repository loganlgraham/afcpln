const EMPTY_LISTING_MESSAGE = 'No listings match the filters yet.';

export function formatPrice(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '$0';
  }

  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function selectFirstImage(listing) {
  if (!listing || !Array.isArray(listing.images)) {
    return null;
  }

  return listing.images.find((image) => Boolean(image)) || null;
}

function buildMeta(listing) {
  if (!listing) {
    return '';
  }

  const parts = [];
  if (typeof listing.bedrooms === 'number') {
    parts.push(`${listing.bedrooms} bd`);
  }
  if (typeof listing.bathrooms === 'number') {
    parts.push(`${listing.bathrooms} ba`);
  }
  if (listing.area) {
    parts.push(listing.area);
  }

  const { address } = listing;
  if (address) {
    const locationParts = [address.city, address.state].filter(Boolean);
    if (locationParts.length) {
      parts.push(locationParts.join(', '));
    }
  }

  return parts.join(' • ');
}

function buildAgentLine(listing) {
  if (!listing || !listing.agent) {
    return 'Agent information pending';
  }

  const { agent } = listing;
  const details = [agent.fullName].filter(Boolean);

  if (agent.company) {
    details.push(agent.company);
  }

  if (agent.phoneNumber) {
    details.push(agent.phoneNumber);
  }

  return details.length ? `Listed by ${details.join(' • ')}` : 'Agent information pending';
}

export function createListingCard(listing, template) {
  if (!template || !template.content || !template.content.firstElementChild) {
    return null;
  }

  const node = template.content.firstElementChild.cloneNode(true);
  const imageWrapper = node.querySelector('.listing__image');
  const imageEl = imageWrapper ? imageWrapper.querySelector('img') : null;
  const firstImage = selectFirstImage(listing);

  if (imageWrapper && imageEl) {
    if (firstImage) {
      imageEl.src = firstImage;
      imageEl.alt = listing?.title ? `${listing.title} photo` : 'Listing photo';
      imageWrapper.hidden = false;
    } else {
      imageEl.removeAttribute('src');
      imageWrapper.hidden = true;
    }
  }

  const titleEl = node.querySelector('.listing__title');
  if (titleEl) {
    titleEl.textContent = listing?.title || 'Private Listing';
  }

  const priceEl = node.querySelector('.listing__price');
  if (priceEl) {
    priceEl.textContent = typeof listing?.price === 'number' ? formatPrice(listing.price) : '—';
  }

  const metaEl = node.querySelector('.listing__meta');
  if (metaEl) {
    metaEl.textContent = buildMeta(listing);
  }

  const descriptionEl = node.querySelector('.listing__description');
  if (descriptionEl) {
    descriptionEl.textContent = listing?.description || '';
  }

  const agentEl = node.querySelector('.listing__agent');
  if (agentEl) {
    agentEl.textContent = buildAgentLine(listing);
  }

  const contactLink = node.querySelector('.listing__contact-link');
  if (contactLink) {
    const agentName = listing?.agent?.fullName || 'the listing agent';
    contactLink.hidden = !listing?.agent;
    contactLink.dataset.listingId = listing?._id || '';
    contactLink.dataset.agentId = listing?.agent?._id || '';
    contactLink.setAttribute('aria-label', `Message ${agentName}`);
  }

  if (node) {
    node.dataset.listingId = listing?._id || '';
    node.dataset.agentId = listing?.agent?._id || '';
  }

  const conversation = node.querySelector('.listing__conversation');
  if (conversation) {
    conversation.dataset.listingId = listing?._id || '';
    conversation.dataset.agentId = listing?.agent?._id || '';
    const recipient = conversation.querySelector('[data-recipient]');
    if (recipient) {
      recipient.textContent = listing?.agent?.fullName || 'the listing agent';
    }
    const status = conversation.querySelector('.conversation__status');
    if (status) {
      status.textContent = '';
      status.hidden = true;
    }
  }

  return node;
}

export function renderListingCollection(listings, template, container, options = {}) {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!Array.isArray(listings) || !listings.length) {
    container.innerHTML = `<div class="empty-state">${EMPTY_LISTING_MESSAGE}</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  listings.forEach((listing) => {
    const node = createListingCard(listing, template);
    if (node) {
      if (typeof options.onRender === 'function') {
        options.onRender(node, listing);
      }
      fragment.append(node);
    }
  });

  container.append(fragment);
}

