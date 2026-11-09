// The ideas a "what this table showed" card can name, each with one sentence and a source a
// learner can open (Jason, 2026-11-06: a plain line, then the named idea, with a link).
// Sources checked 2026-11-06. Content: CC BY-SA 4.0 / code: AGPL-3.0-only
// SPDX-License-Identifier: AGPL-3.0-only

export const IDEAS = {
  reciprocity: {
    name: 'Nice, retaliatory, forgiving, clear',
    text: "In Axelrod's tournaments the most successful strategies were nice, retaliatory, forgiving and clear: never the first to stop cooperating, quick to answer when someone does, and quick to make up.",
    source: { label: 'Axelrod, The Evolution of Cooperation (1984)', url: 'https://en.wikipedia.org/wiki/The_Evolution_of_Cooperation' },
  },
  noise: {
    name: 'Mistakes and forgiveness',
    text: 'When moves can go wrong, strict copying can lock a group into answering one slip with another. Strategies that sometimes forgive recover; this is why Generous Tit for Tat does better than plain Tit for Tat when mistakes happen.',
    source: { label: 'Nowak and Sigmund, Nature (1992)', url: 'https://www.nature.com/articles/355250a0' },
  },
  shadow: {
    name: 'The shadow of the future',
    text: 'Axelrod called it the shadow of the future: cooperation holds when players expect to keep meeting, because what you give now comes back later.',
    source: { label: 'Axelrod, The Evolution of Cooperation (1984)', url: 'https://en.wikipedia.org/wiki/The_Evolution_of_Cooperation' },
  },
  endgame: {
    name: 'The end-game problem',
    text: 'When a relationship is about to end, the reason to keep cooperating fades, because there will be no later round to repay or punish. Axelrod: cooperation needs a long enough shadow of the future.',
    source: { label: 'Axelrod, The Evolution of Cooperation (1984)', url: 'https://en.wikipedia.org/wiki/The_Evolution_of_Cooperation' },
  },
  freeRider: {
    name: 'The free-rider problem',
    text: 'Each player does best by letting the others pay for something everyone shares. If enough people reason that way, it is never provided. Olson called this the free-rider problem.',
    source: { label: 'Olson, The Logic of Collective Action (1965)', url: 'https://en.wikipedia.org/wiki/The_Logic_of_Collective_Action' },
  },
  threshold: {
    name: 'A threshold public good',
    text: 'The pool is a public good with a threshold: it pays everyone only if enough is given. Giving nothing pays best for one player, as long as the others carry it; when too many try that, everyone loses.',
    source: { label: 'Public goods game', url: 'https://en.wikipedia.org/wiki/Public_goods_game' },
  },
  congruence: {
    name: 'Rules people can keep',
    text: 'Rising stakes outrun what players hold, so even a trusting table has limits. Ostrom found that shared resources last when the rules ask no more than people can provide; she called this congruence.',
    source: { label: 'Ostrom, Governing the Commons (1990)', url: 'https://en.wikipedia.org/wiki/Elinor_Ostrom' },
  },
  protest: {
    name: 'Selective protest',
    text: "Reciprocity isn't only self-interest. De Waal lists selective protest among its signs: objecting when someone else is treated unfairly.",
    source: { label: 'Ostrom and Walker, Trust and Reciprocity (2003)', url: 'https://www.russellsage.org/publications/book/trust-and-reciprocity' },
  },
  grudge: {
    name: 'Partner specificity',
    text: 'Reciprocity keeps an account with each partner. De Waal calls this partner specificity, and the answer to being short-changed is retaliation.',
    source: { label: 'Ostrom and Walker, Trust and Reciprocity (2003)', url: 'https://www.russellsage.org/publications/book/trust-and-reciprocity' },
  },
  turns: {
    name: 'Turn-taking',
    text: 'Turn-taking is one of de Waal\'s signs of reciprocity. When one player keeps the advantage, the others stop cooperating with them.',
    source: { label: 'Ostrom and Walker, Trust and Reciprocity (2003)', url: 'https://www.russellsage.org/publications/book/trust-and-reciprocity' },
  },
  sanctions: {
    name: 'Monitoring and graduated sanctions',
    text: "Ostrom found that commons last when members watch each other's conduct and sanction rule-breakers, starting gently and growing firmer: graduated sanctions.",
    source: { label: 'Ostrom, Governing the Commons (1990)', url: 'https://en.wikipedia.org/wiki/Elinor_Ostrom' },
  },
  ultimatum: {
    name: 'The ultimatum game',
    text: 'In the ultimatum game, people often turn down offers they find unfair, even when it costs them. Henrich and colleagues found that what counts as a fair offer varies from one society to another.',
    source: { label: 'Ultimatum game; Henrich and colleagues (2001)', url: 'https://en.wikipedia.org/wiki/Ultimatum_game' },
  },
  centipede: {
    name: 'The centipede game',
    text: 'In the centipede game, working backwards from the end says grab at once. Yet people usually keep building for a while, and both gain (McKelvey and Palfrey, 1992).',
    source: { label: 'Centipede game', url: 'https://en.wikipedia.org/wiki/Centipede_game' },
  },
  equity: {
    name: 'Equality or equity',
    text: 'Equality gives everyone the same share. Equity gives in proportion to what each put in, the comparison Adams found people use to judge fairness. Each protects someone, so neither is the one fair split.',
    source: { label: 'Adams, equity theory (1963)', url: 'https://en.wikipedia.org/wiki/Equity_theory' },
  },
  trust: {
    name: 'Rewarding fair dealing',
    text: 'Paying to reward a fair split is positive reciprocity. It builds the trust that lets a group keep building, rather than grabbing.',
    source: { label: 'Ostrom and Walker, Trust and Reciprocity (2003)', url: 'https://www.russellsage.org/publications/book/trust-and-reciprocity' },
  },
  commonsDrained: {
    name: 'Rules for what may be taken',
    text: "Trust between players doesn't protect what they share. Ostrom found that commons last when there are rules for how much may be taken, suited to local conditions, and the people using them help make those rules. Without such a rule, a table that cooperates well can still use its Commons up.",
    source: { label: 'Ostrom, Governing the Commons (1990)', url: 'https://en.wikipedia.org/wiki/Elinor_Ostrom' },
  },
  // The Wheel (Game 3). Sources checked 2026-11-10.
  wsls: {
    name: 'Win-stay, lose-shift',
    text: "Keep what worked last time; change what didn't. Nowak and Sigmund found this simple rule (they called it Pavlov) did better than Tit for Tat in their simulations: it recovers from mistakes, and it takes advantage of players who always cooperate. Learning only from your own results finds what pays you, which isn't always what pays the group.",
    source: { label: 'Nowak and Sigmund, Nature (1993)', url: 'https://www.nature.com/articles/364056a0' },
  },
  secondOrder: {
    name: 'The second-order dilemma',
    text: 'Correcting a free rider is a public good of its own: everyone gains when they change, but only the one who acts pays. Yamagishi showed that a system for sanctioning is itself a public good, which people will help provide once they see that goodwill alone fails.',
    source: { label: 'Yamagishi, Journal of Personality and Social Psychology (1986)', url: 'https://doi.org/10.1037/0022-3514.51.1.110' },
  },
  difference: {
    name: 'The least advantaged',
    text: "Here the whole table's bonus is judged by its poorest player, in the spirit of Rawls's difference principle: inequalities are to be arranged to the greatest benefit of the least advantaged.",
    source: { label: 'Rawls, A Theory of Justice (1971), in the Stanford Encyclopedia of Philosophy', url: 'https://plato.stanford.edu/entries/original-position/difference-principle.html' },
  },
  rosca: {
    name: 'A rotating pot',
    text: 'Everyone pays in and the pot goes round to each in turn, like a rotating savings and credit association, found all over the world. Such groups hold together only while every member keeps paying in; Besley, Coate and Loury looked at what keeps them going when a member might default.',
    source: { label: 'Besley, Coate and Loury, American Economic Review (1993)', url: 'https://researchonline.lse.ac.uk/id/eprint/1613' },
  },
  cascade: {
    name: 'A trickle or a cascade',
    text: "What reaches the white arrow goes on only as far as each holder passes it. The 2017 design notes put the game's challenge as: turn a trickle into a cascade.",
    source: null, // the game's own lesson (Wheel of Fortune Sharing Game, 2017-11-19)
  },
  risingAmount: {
    name: 'The rising amount',
    text: "The rising amount is this game's real pressure. Every round costs one more, so the pool has to be shared out before the players run dry. Game 1 teaches the finite Commons; here the limit is what players can keep paying.",
    source: null, // the game's own lesson (Jason, 2026-11-06, decision 6)
  },
};

/** Pick up to n moments: ones involving you first, then by priority, one per idea. */
export function pickMoments(moments, n = 2) {
  const seen = new Set();
  return [...moments].sort((a, b) => (b.you - a.you) || (a.priority - b.priority)).filter((m) => {
    if (seen.has(m.idea)) return false;
    seen.add(m.idea);
    return true;
  }).slice(0, n);
}

export const listOf = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
