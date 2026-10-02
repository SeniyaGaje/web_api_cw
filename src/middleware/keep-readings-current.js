const { backfillReadings } = require('../backfill');
const { floorToSlot } = require('../reading-simulator');

// Runs before every /api/v1 request and makes sure readings exist up to the latest 15-minute slot.
// On Vercel there is no always-running process that could do this on a timer, so the requests themselves
// trigger the catch-up. It costs nothing most of the time: once this instance has brought the database up to the
// current slot, it does no more work until the next slot begins.
let filledUpToSlot = 0; // the newest slot this instance has already made sure of
let running = null; // the catch-up in progress, shared by requests that arrive while it runs

async function keepReadingsCurrent(req, res, next) {
  const currentSlot = floorToSlot(new Date()).getTime();
  if (currentSlot > filledUpToSlot) {
    if (!running) {
      running = backfillReadings(new Date())
        .then(() => {
          filledUpToSlot = currentSlot;
        })
        .finally(() => {
          running = null;
        });
    }
    await running; // if it fails, Express 5 passes the error on, and the next request tries again
  }
  next();
}

module.exports = keepReadingsCurrent;
