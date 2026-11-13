/* ============================================================
   PITCHBLACK — SITE CONFIG
   Edit this file to wire up Supabase and admin access.
   Steps:
     1. Go to https://supabase.com and create a free project.
     2. In the dashboard: Project Settings > API.
        Copy the Project URL and the "anon public" key.
     3. Replace the two placeholder values below with them.
     4. Also replace the ADMIN_EMAILS value with your own email,
        then commit and push. Admins see the admin panel and
        can review every trade request.
   ============================================================ */

window.PITCHBLACK_CONFIG = {
  // >>> PUT YOUR SUPABASE URL HERE (placeholder until you create the project)
  SUPABASE_URL: "https://kvivbndffnzlujhbpspr.supabase.co",

  // >>> PUT YOUR SUPABASE ANON KEY HERE (placeholder until you create the project)
  SUPABASE_ANON_KEY: "sb_publishable_rXDC2k3DppYwHbL6JLJfhQ_nAzKPJvK",

  // Emails that get the admin view. Add your own login email here.
  ADMIN_EMAILS: [
    "ogbonnaelvischuks1@gmail.com"
  ],

  // Display-only fallback rates in NGN used when the live price API
  // is unreachable. Keep these roughly current.
  FALLBACK_RATES_NGN: {
    BTC: 165000000,
    ETH: 5800000,
    USDT: 1550,
    USDC: 1550,
    BNB: 980000,
    SOL: 290000,
    XRP: 4100,
    DOGE: 300,
    TRX: 640
  },

  // Supported coins. To add or remove a coin, edit this list only —
  // the whole site (rates table, trade form, dashboard) updates itself.
  COINS: [
    {
      code: "BTC", name: "Bitcoin", coingeckoId: "bitcoin",
      minBuyNgn: 5000, minSellCrypto: 0.0001, decimals: 8, note: "BTC receive address"
    },
    {
      code: "USDT", name: "Tether (ERC20/BEP20/TRC20)", coingeckoId: "tether",
      minBuyNgn: 5000, minSellCrypto: 1, decimals: 6, note: "USDT address (note the network)"
    },
    {
      code: "USDC", name: "USD Coin", coingeckoId: "usd-coin",
      minBuyNgn: 5000, minSellCrypto: 1, decimals: 6, note: "USDC address (note the network)"
    },
    {
      code: "ETH", name: "Ethereum", coingeckoId: "ethereum",
      minBuyNgn: 5000, minSellCrypto: 0.005, decimals: 6, note: "ETH receive address"
    },
    {
      code: "BNB", name: "BNB (BSC)", coingeckoId: "binance-coin",
      minBuyNgn: 5000, minSellCrypto: 0.1, decimals: 6, note: "BNB receive address"
    },
    {
      code: "SOL", name: "Solana", coingeckoId: "solana",
      minBuyNgn: 5000, minSellCrypto: 0.5, decimals: 6, note: "SOL receive address"
    },
    {
      code: "XRP", name: "XRP (Ripple)", coingeckoId: "ripple",
      minBuyNgn: 5000, minSellCrypto: 50, decimals: 2, note: "XRP tag/destination note if required"
    },
    {
      code: "DOGE", name: "Dogecoin", coingeckoId: "dogecoin",
      minBuyNgn: 5000, minSellCrypto: 100, decimals: 2, note: "DOGE receive address"
    },
    {
      code: "TRX", name: "TRON (TRC20)", coingeckoId: "tron",
      minBuyNgn: 5000, minSellCrypto: 500, decimals: 2, note: "TRX receive address"
    }
  ]
};
