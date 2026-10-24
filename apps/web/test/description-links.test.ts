import { describe, expect, it } from 'vitest';
import { linkifyDescription } from '../src/lib/description-links.js';

describe('linkifyDescription', () => {
  it('leaves a description without URLs as one text segment', () => {
    expect(linkifyDescription('A snap-fit box for M2.5 standoffs.')).toEqual([
      { type: 'text', text: 'A snap-fit box for M2.5 standoffs.' },
    ]);
  });

  it('links http and https URLs and keeps the surrounding prose', () => {
    expect(linkifyDescription('See http://example.com and https://example.com/a?b=1#c for details.')).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'link', href: 'http://example.com', text: 'http://example.com' },
      { type: 'text', text: ' and ' },
      { type: 'link', href: 'https://example.com/a?b=1#c', text: 'https://example.com/a?b=1#c' },
      { type: 'text', text: ' for details.' },
    ]);
  });

  it('handles a description that is only a URL', () => {
    expect(linkifyDescription('https://example.com/model')).toEqual([
      { type: 'link', href: 'https://example.com/model', text: 'https://example.com/model' },
    ]);
  });

  it('accepts an uppercase scheme and preserves the query string', () => {
    expect(linkifyDescription('HTTPS://EXAMPLE.COM/?a=1&b=2')).toEqual([
      { type: 'link', href: 'HTTPS://EXAMPLE.COM/?a=1&b=2', text: 'HTTPS://EXAMPLE.COM/?a=1&b=2' },
    ]);
  });

  it('keeps trailing sentence punctuation outside the link', () => {
    expect(linkifyDescription('Docs: https://example.com/a, https://example.com/b; https://example.com/c!')).toEqual([
      { type: 'text', text: 'Docs: ' },
      { type: 'link', href: 'https://example.com/a', text: 'https://example.com/a' },
      { type: 'text', text: ', ' },
      { type: 'link', href: 'https://example.com/b', text: 'https://example.com/b' },
      { type: 'text', text: '; ' },
      { type: 'link', href: 'https://example.com/c', text: 'https://example.com/c' },
      { type: 'text', text: '!' },
    ]);
  });

  it('strips several trailing dots and question marks', () => {
    expect(linkifyDescription('https://example.com/...?')).toEqual([
      { type: 'link', href: 'https://example.com/', text: 'https://example.com/' },
      { type: 'text', text: '...?' },
    ]);
  });

  it('keeps balanced parentheses in a URL', () => {
    expect(linkifyDescription('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      {
        type: 'link',
        href: 'https://en.wikipedia.org/wiki/Foo_(bar)',
        text: 'https://en.wikipedia.org/wiki/Foo_(bar)',
      },
    ]);
  });

  it('removes an unmatched closing bracket and the punctuation after it', () => {
    expect(linkifyDescription('(see https://example.com/docs).')).toEqual([
      { type: 'text', text: '(see ' },
      { type: 'link', href: 'https://example.com/docs', text: 'https://example.com/docs' },
      { type: 'text', text: ').' },
    ]);
  });

  it('leaves non-http schemes and bare hosts as text', () => {
    const description = 'ftp://example.com mailto:user@example.com javascript:alert(1) www.example.com';
    expect(linkifyDescription(description)).toEqual([{ type: 'text', text: description }]);
  });

  it('leaves a URL without a host as text', () => {
    expect(linkifyDescription('http:// and https://.')).toEqual([{ type: 'text', text: 'http:// and https://.' }]);
  });

  it('returns no segments for an empty description', () => {
    expect(linkifyDescription('')).toEqual([]);
  });
});
