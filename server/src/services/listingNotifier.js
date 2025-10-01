const User = require('../models/User');
const { sendListingMatchEmail } = require('./emailService');
const { listingMatchesSearch } = require('../utils/searchMatcher');

async function notifyUsersForListing(listing) {
  const listingData = typeof listing.toObject === 'function' ? listing.toObject({ virtuals: true }) : listing;
  const hydratedListing = listingData;

  const users = await User.find({ role: 'user', 'savedSearches.0': { $exists: true } });

  const tasks = [];

  users.forEach((user) => {
    user.savedSearches.forEach((search) => {
      if (listingMatchesSearch(hydratedListing, search)) {
        tasks.push(sendListingMatchEmail(user, listing, search));
      }
    });
  });

  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

module.exports = {
  notifyUsersForListing
};
