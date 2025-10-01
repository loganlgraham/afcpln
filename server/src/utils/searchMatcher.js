function normalize(value) {
  return value ? String(value).trim().toLowerCase() : '';
}

function matchesArea(listing, searchAreas) {
  if (!searchAreas || !searchAreas.length) {
    return true;
  }

  const normalizedAreas = searchAreas.map(normalize);
  const listingArea = normalize(listing.area);
  const listingCity = normalize(listing.address && listing.address.city);

  return normalizedAreas.includes(listingArea) || normalizedAreas.includes(listingCity);
}

function matchesPrice(listing, search) {
  if (search.minPrice !== undefined && search.minPrice !== null) {
    if (Number(listing.price) < Number(search.minPrice)) {
      return false;
    }
  }

  if (search.maxPrice !== undefined && search.maxPrice !== null) {
    if (Number(listing.price) > Number(search.maxPrice)) {
      return false;
    }
  }

  return true;
}

function matchesBedrooms(listing, search) {
  if (search.minBedrooms !== undefined && search.minBedrooms !== null) {
    if (Number(listing.bedrooms) < Number(search.minBedrooms)) {
      return false;
    }
  }
  return true;
}

function matchesBathrooms(listing, search) {
  if (search.minBathrooms !== undefined && search.minBathrooms !== null) {
    if (Number(listing.bathrooms) < Number(search.minBathrooms)) {
      return false;
    }
  }
  return true;
}

function matchesKeywords(listing, searchKeywords) {
  if (!searchKeywords || !searchKeywords.length) {
    return true;
  }

  const haystack = `${listing.title} ${listing.description}`.toLowerCase();
  const normalizedKeywords = searchKeywords.map((keyword) => String(keyword).toLowerCase());

  return normalizedKeywords.some((keyword) => haystack.includes(keyword));
}

function listingMatchesSearch(listing, search) {
  if (!listing || !search) {
    return false;
  }

  return (
    matchesArea(listing, search.areas) &&
    matchesPrice(listing, search) &&
    matchesBedrooms(listing, search) &&
    matchesBathrooms(listing, search) &&
    matchesKeywords(listing, search.keywords)
  );
}

module.exports = {
  listingMatchesSearch,
  matchesArea,
  matchesPrice,
  matchesBedrooms,
  matchesBathrooms,
  matchesKeywords
};
