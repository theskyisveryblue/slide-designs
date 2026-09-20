import { themes } from '../model/theme';
import type { FamilyTokens } from './helpers';

export const editorial: FamilyTokens = {
  id: 'editorial',
  label: 'Editorial',
  theme: themes.editorial,
  rule: true,
  ruleWeight: 2,
  cardSurface: false,
  bigBlocks: false,
  uppercaseHeadings: false,
  content: {
    deckTitle: 'Fieldnotes: On Clarity',
    cover: {
      kicker: 'Fieldnotes — Issue 04',
      title: 'Good ideas deserve\nbeautiful slides.',
      subtitle:
        'A short editorial deck about hierarchy, negative space and the quiet work of making an argument legible.',
      footer: 'Fieldnotes — a working journal',
    },
    section: {
      index: '01',
      title: 'The argument for\nrestraint',
      blurb: 'Most decks fail from too much, not too little. Editing is the design work.',
    },
    text: {
      kicker: 'Principle 01',
      title: 'Clarity is a design decision, not a final polish',
      body:
        'A slide is a small piece of architecture. One idea holds the weight, and everything else either supports it or gets removed. That is why the strongest pages look almost empty: the argument has room to land.',
      side: 'Practical test: cover the body text. If the title still tells the story, the hierarchy is working.',
      bullets: [
        'Lead with the claim, not the category',
        'Keep one idea per page',
        'Let white space do the separating',
        'Set one accent and use it twice',
      ],
    },
    image: {
      kicker: 'Case note',
      title: 'Photography should\ncarry meaning',
      caption: 'Portrait and field images are cropped to a consistent ratio so the grid holds across every layout.',
      alt: 'Editorial portrait placeholder awaiting a real image',
    },
    comparison: {
      kicker: 'Two approaches',
      title: 'Dense or deliberate?',
      leftTitle: 'The dense page',
      leftBody:
        'Every fact is present, every caveat included. Useful as a reference document, punishing as a talk. It asks the audience to do the editing you skipped.',
      rightTitle: 'The deliberate page',
      rightBody:
        'One claim, one piece of evidence, one next step. The detail lives in the notes and the appendix, where a reader can find it later.',
    },
    metrics: {
      kicker: 'Signal',
      title: 'What the numbers say',
      values: [
        { value: '3', label: 'Ideas per page', detail: 'The working ceiling before recall drops in a live room.' },
        { value: '12', label: 'Words in a headline', detail: 'Short enough to read at the back of a room.' },
        { value: '1', label: 'Accent colour', detail: 'A single accent used twice reads as intentional.' },
      ],
    },
    quote: {
      quote: 'Design is the silent ambassador of your idea. It should argue, not decorate.',
      attribution: 'Mira Okafor',
      role: 'Editorial director, Fieldnotes',
    },
    timeline: {
      kicker: 'Reading order',
      title: 'How an editorial page is built',
      steps: [
        { label: 'Step 01', title: 'Write the claim', body: 'One sentence that could survive on its own in an email.' },
        { label: 'Step 02', title: 'Set the grid', body: 'Twelve columns, a fixed margin, and one baseline for everything.' },
        { label: 'Step 03', title: 'Place the image', body: 'Crop to ratio, keep the subject off the text column.' },
        { label: 'Step 04', title: 'Delete a third', body: 'Then read it aloud. Cut whatever you stumble over.' },
      ],
    },
    closing: {
      kicker: 'Next chapter',
      title: 'Make something\nworth sharing.',
      body: 'Start from a template, replace the words, and export the deck you actually meant to make.',
      cta: 'Start a new deck',
    },
  },
};
