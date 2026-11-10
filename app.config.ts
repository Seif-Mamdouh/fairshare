import config from "./app.json";
// Native signing and associated-domain setup are configured at build time.
export default {
  ...config.expo,
  ios: {
    ...config.expo.ios,
    ...(process.env.BANK_IOS_CALLBACK_HOST
      ? {
          associatedDomains: ["applinks:" + process.env.BANK_IOS_CALLBACK_HOST],
        }
      : {}),
  },
};
