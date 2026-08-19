# Load the library programmatically (zero runtime deps).
const { signTemplate, submitSignedEvent, buildChallengeEvent } = require('../lib/nip07');
const { verifyEvent } = require('../lib/event');

async function signIn(challenge, callbackUrl, domain = 'example.com') {
  const signed = signTemplate({
    template: buildChallengeEvent({ challenge, relay: callbackUrl }),
    domain,
  });

  console.log('Identity :', signed.npub);
  console.log('Event id :', signed.event.id);
  verifyEvent(signed.event); // local sanity check — throws if invalid

  const verdict = await submitSignedEvent(callbackUrl, signed.event);
  return verdict;
}

if (require.main === module) {
  const [challenge, callback] = process.argv.slice(2);
  if (!challenge || !callback) {
    console.error('Usage: node programmatic.js "<challenge>" "<callback-url>"');
    process.exit(2);
  }
  signIn(challenge, callback)
    .then((verdict) => {
      console.log('Verdict  :', JSON.stringify(verdict.response));
      process.exit(verdict.ok ? 0 : 3);
    })
    .catch((e) => {
      console.error('Error:', e.message);
      process.exit(e.code ?? 1);
    });
}

module.exports = { signIn };