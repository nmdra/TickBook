const preferences = new Map();

const defaultPrefs = {
  locale: 'en',
  timezone: 'UTC',
  channels: {
    email: true,
    sms: true,
    push: true,
    whatsapp: false,
  },
};

const getPreferences = (userId) => preferences.get(Number(userId)) || defaultPrefs;

const setPreferences = (userId, value) => {
  preferences.set(Number(userId), {
    ...defaultPrefs,
    ...value,
    channels: {
      ...defaultPrefs.channels,
      ...(value?.channels || {}),
    },
  });
};

module.exports = {
  getPreferences,
  setPreferences,
};
