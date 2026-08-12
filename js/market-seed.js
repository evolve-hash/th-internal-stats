/* San Francisco market seasonality, for the Season view.

   Source: Housing Inventory — New Listing Count, San Francisco County (series
   NEWLISCOU6075), published by Realtor.com and distributed through FRED.
   120 monthly observations, July 2016 to June 2026; the profile below averages
   the nine complete calendar years, 2017 through 2025.

   `shares` is each month's average share of the year's new listings, so it is
   directly comparable to Team Howe's share of closings on the same axis.
   `lo` and `hi` are the lowest and highest share that month has taken across
   those nine years.

   Two caveats worth keeping in mind. This measures when the market puts homes
   on the market, not when they close, which is exactly why Team Howe's own
   closings track it one month later. And these figures are fixed here rather
   than fetched, so they need refreshing roughly once a year — FRED's page for
   the series is the place to get them.

   `strength` is the STL seasonal strength of the raw monthly series: 0.83
   against 0.32 for Team Howe's own closings over the same period. `lag` and
   `r` record that Team Howe's monthly profile matches this one shifted by one
   month, at a correlation of 0.85 (0.41 at two months, and none at zero). */
window.TH_MARKET = {
  label: 'SF market — new listings',
  source: 'Realtor.com / FRED, San Francisco County',
  period: '2017–2025',
  shares: [8.57, 8.65, 9.04, 9.65, 10.24, 9.41, 7.44, 7.08, 12.73, 9.85, 5.29, 2.06],
  lo:     [5.8, 7.8, 4.8, 4.5, 8.8, 7.7, 5.6, 4.8, 10.1, 8.1, 3.8, 1.3],
  hi:     [10.4, 10.0, 11.1, 11.6, 11.5, 10.3, 11.6, 10.6, 15.9, 11.5, 6.8, 3.4],
  strength: 0.83,
  lag: 1,
  r: 0.85
};
