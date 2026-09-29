# Nightmail

An original single-card-hand elimination micro card game for the TrainGames network — a fresh take on prompt [`15-love-letter-style`](../../prompts/15-love-letter-style.md). Couriers race to deliver the sealed **Night Dispatch** to the Night Conductor. All roles, names, flavor text, and artwork are original.

## Rules

- 2–4 couriers. Each round: one card is set aside face-down (plus three face-up with 2 players), everyone is dealt one card.
- On your turn, draw one card, then play one and resolve its effect.
- Last courier standing — or the highest rank when the deck runs out — takes the round and a token. First to the token target (7 / 5 / 4 for 2 / 3 / 4 players, configurable) wins the match.
- Discarding the Night Dispatch for any reason eliminates you.

| Card | × | Rank | Effect |
|---|---|---|---|
| Lookout | 5 | 1 | Name a role (not Lookout). If another courier holds it, they are eliminated. |
| Signalman | 2 | 2 | Look at another courier's hand. |
| Brakeman | 2 | 3 | Compare hands in secret — the lower rank is eliminated. Ties eliminate no one. |
| Lantern Bearer | 2 | 4 | Protected from other couriers' effects until your next turn. |
| Inspector | 2 | 5 | A courier (yourself allowed) discards their hand and draws anew. |
| Switchman | 1 | 6 | Trade hands with another courier. |
| Stoker | 1 | 7 | Must be discarded if held with the Switchman or the Night Dispatch. |
| Night Dispatch | 1 | 8 | Discard it and you are out. |

## Modes

- **Vs computer** (you + 1–3 bots, easy / medium / hard). Bots keep probabilistic beliefs over hidden hands from the discard pile, face-up discards, and their own peeks.
- **Local pass-and-play** (2–4) with a privacy screen between turns.

Private hands never leak: peeks are shown only to the peeking player (or recorded in that bot's private memory).

## Run it

Open `index.html` in a browser, or serve the folder statically. The service worker caches the game for offline play after the first load.

## Tests

```
node tests/engine.test.js
```

Covers every role interaction, elimination paths, protection timing, forced Stoker discards, deck-exhaustion showdowns (including ties), turn order, token/match scoring, and bot move legality.
