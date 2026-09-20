import { themes } from '../model/theme';
import type { FamilyTokens } from './helpers';

export const product: FamilyTokens = {
  id: 'product',
  label: 'Clean Product',
  theme: themes.product,
  rule: false,
  ruleWeight: 1,
  cardSurface: true,
  bigBlocks: false,
  uppercaseHeadings: false,
  content: {
    deckTitle: 'Harbour — Launch Deck',
    cover: {
      kicker: 'Harbour 2.0',
      title: 'Ship the work,\nnot the status update.',
      subtitle:
        'Harbour turns scattered project threads into one calm timeline, so a team can see the whole release without chasing anyone for it.',
      footer: 'Harbour — product launch',
    },
    section: {
      index: '01',
      title: 'The problem we\nkept hearing',
      blurb: 'Teams were not short of tools. They were short of one honest view of the work.',
    },
    text: {
      kicker: 'Overview',
      title: 'One timeline your whole team can read',
      body:
        'Harbour gathers the work that already exists in your tracker, your docs and your release notes, then presents it as a single view that a designer, an engineer and a customer lead can all understand at a glance.',
      side: 'Setup takes about ten minutes. Harbour reads your existing projects instead of asking you to re-enter them.',
      bullets: [
        'Import from your current tracker',
        'Share a read-only view with stakeholders',
        'Track scope changes automatically',
        'Export a launch deck straight from the timeline',
      ],
    },
    image: {
      kicker: 'Product',
      title: 'A calm surface\nover busy work',
      caption: 'Product screens are placed in a consistent card, scaled to the same optical height on every layout.',
      alt: 'Product screenshot placeholder awaiting an image',
    },
    comparison: {
      kicker: 'Plans',
      title: 'Choose the fit',
      leftTitle: 'Team',
      leftBody: 'For groups of up to fifteen. Shared timelines, read-only stakeholder links, and a full export history for the last ninety days.',
      rightTitle: 'Company',
      rightBody: 'Unlimited guests, custom fields, audit log and single sign-on. Everything in Team, plus the controls a larger organisation needs.',
    },
    metrics: {
      kicker: 'Results',
      title: 'What changed after launch',
      values: [
        { value: '41%', label: 'Fewer status meetings', detail: 'Median across 120 pilot teams over eight weeks.' },
        { value: '10 min', label: 'Time to first view', detail: 'From sign-in to a shared timeline a stakeholder can read.' },
        { value: '2.4×', label: 'Faster release notes', detail: 'Because the timeline already holds the story.' },
      ],
    },
    quote: {
      quote: 'We stopped writing update documents. The timeline is the update.',
      attribution: 'Dana Whitfield',
      role: 'Head of Delivery, Northwind',
    },
    timeline: {
      kicker: 'Rollout',
      title: 'How the launch runs',
      steps: [
        { label: 'Week 1', title: 'Connect', body: 'Link your tracker and invite the delivery team.' },
        { label: 'Week 2', title: 'Shape', body: 'Confirm milestones and share a read-only view.' },
        { label: 'Week 4', title: 'Present', body: 'Export the launch deck directly from the timeline.' },
        { label: 'Week 6', title: 'Review', body: 'Compare planned and actual scope, then adjust.' },
      ],
    },
    closing: {
      kicker: 'Next',
      title: 'Start your first\ntimeline today.',
      body: 'Pilot Harbour with one release. Ten minutes to connect, one week to see the difference.',
      cta: 'Request access',
    },
  },
};
