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

export function createAgentMailto(listing) {
  const email = listing?.agent?.email ? String(listing.agent.email).trim() : '';
  if (!email) {
    return null;
  }

  const title = listing?.title ? String(listing.title).trim() : 'your listing';
  const locationParts = [];
  if (listing?.area) {
    locationParts.push(String(listing.area).trim());
  }
  if (listing?.address?.city) {
    locationParts.push(String(listing.address.city).trim());
  }
  if (listing?.address?.state) {
    locationParts.push(String(listing.address.state).trim());
  }
  const location = locationParts.filter(Boolean).join(', ');
  const interestLabel = location ? `${title} in ${location}` : title;

  const fullName = listing?.agent?.fullName ? String(listing.agent.fullName).trim() : '';
  const firstName = fullName.split(/\s+/)[0] || '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,';

  const bodyLines = [
    greeting,
    '',
    `I'm interested in ${interestLabel}.`,
    'Could we schedule a tour or discuss the property in more detail?',
    '',
    'Thanks!'
  ];

  const params = new URLSearchParams({
    subject: `Inquiry about ${title}`,
    body: bodyLines.join('\n')
  });

  return `mailto:${email}?${params.toString()}`;
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
    const mailto = createAgentMailto(listing);
    if (mailto) {
      contactLink.href = mailto;
      contactLink.hidden = false;
      const agentName = listing?.agent?.fullName || 'the listing agent';
      contactLink.setAttribute('aria-label', `Email ${agentName}`);
    } else {
      contactLink.hidden = true;
    }
  }

  return node;
}

export function renderListingCollection(listings, template, container) {
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
      fragment.append(node);
    }
  });

  container.append(fragment);
}

