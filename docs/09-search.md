# 09 — Search

PostgreSQL full-text search is enough for the beta: thousands of projects, tens of queries per
second, faceting on tags and license. The design keeps a clean boundary so Meilisearch or
Typesense can replace the query layer without touching ingest.

## What is indexed

`projects.search_vector` is a `tsvector` maintained by a trigger on insert/update of the indexed
columns.

| Source | Configuration | Weight | Example |
|---|---|---|---|
| `title` | simple **and** english | A / B | “Raspberry Pi 4 case” |
| `tags` | simple | A | `enclosure`, `raspberry-pi` |
| `description` | english | B | “Snap-fit enclosure with M2.5 standoffs” |
| `readme` (Markdown text) | english | B | assembly notes, print settings |
| `keywords` (from `document.json`) | simple | A | parameter names, feature names, body names, materials |

`keywords` is built during ingest from the document: parameter names, feature names and types, body
names, and material names, deduplicated, lowercased, capped at 4 KB. This is what makes a search for
“M3 standoff” or “PETG” find a design whose title never mentions them.

Not indexed: design geometry, full STEP contents, image pixels, private projects, quarantined
projects, failed versions.

## Trigger

```sql
create or replace function projects_search_vector_update() returns trigger
language plpgsql as $$
declare
  exact_tokens text := concat_ws(' ', new.title, array_to_string(new.tags, ' '), new.keywords);
  prose text := concat_ws(' ', new.title, new.description, new.readme);
begin
  new.search_vector :=
      setweight(to_tsvector('simple', exact_tokens), 'A')
   || setweight(to_tsvector('english', prose), 'B');
  return new;
end
$$;
```

Two configurations are indexed together: `simple` keeps titles, tags and parameter names exact (so
“M3”, “PETG” and part numbers are searchable), while `english` stems prose (so “enclosures” finds
“enclosure”). Queries use both and take the better rank; indexing only one configuration and
querying with the other is a classic mismatch (an English query stems “raspberry” to “raspberri”,
which never matches a `simple` title token).

The trigger runs in the ingest transaction; a full reindex job can rebuild every row.

## Query

```sql
with q as (
  select websearch_to_tsquery('simple', $1) as qs,
         websearch_to_tsquery('english', $1) as qe
)
select p.*,
       greatest(
         ts_rank_cd(p.search_vector, q.qs, 32),
         ts_rank_cd(p.search_vector, q.qe, 32)
       ) as text_rank
from public_projects p, q
where p.search_vector @@ q.qs or p.search_vector @@ q.qe
order by text_rank desc, p.published_at desc, p.id desc
limit $2;
```

`websearch_to_tsquery` gives users quoted phrases, `or`, and `-exclusion` without a query language.
`ts_rank_cd` with normalization 32 keeps rank comparable across document lengths.

### Fallback and typo tolerance

If FTS returns fewer than 5 results:

```sql
select p.*, similarity(p.title, $1) as sim
from public_projects p
where (p.title % $1 or p.title ilike '%' || $1 || '%')
order by sim desc, p.published_at desc
limit 20;
```

`pg_trgm` GIN index on `title`. Trigram search is capped at 200 ms; if exceeded, return the FTS
results and log a slow query.

### Filters

| Filter | SQL |
|---|---|
| `tag` (repeatable, AND) | `p.tags @> $tags` |
| `license` | `p.license = $1` |
| `has=step` | `exists (select 1 from artifacts a join versions v on v.id=a.version_id where v.project_id=p.id and a.kind='step')` |
| `owner` | `p.owner_id = (select id from users where username=$1)` |

Filters are applied before ranking; a materialized `project_artifacts` summary table can replace the
`exists` later.

## Ranking

For `sort=relevance` (default when `q` is present):

```text
score = 0.70 * text_norm
      + 0.15 * freshness
      + 0.10 * popularity
      + 0.05 * completeness
```

| Term | Definition |
|---|---|
| `text_norm` | `text_rank / (text_rank + 0.5)` — squashes into 0..1 |
| `freshness` | `exp(-age_days / 180)` |
| `popularity` | `log1p(downloads + 5 * favorites) / 10`, capped at 1 |
| `completeness` | 1 when renders + license + README exist; 0.5 otherwise |

Featured projects are **not** boosted in search; they are a separate home-page slot. Boosting paid
or featured content in relevance is a trust problem and is out of scope.

`sort=newest` uses `published_at desc, id desc`. `sort=popular` uses `downloads desc, favorites desc,
published_at desc`.

## Pagination

Cursor = base64url of `{ "k": <sort key>, "id": <uuid> }`. The query adds
`(sort_key, id) < ($k, $id)` (or `>` for ascending) and orders by `(sort_key, id)`. No offsets, no
duplicate rows when new projects appear between pages.

`total_estimate` comes from `count(*) over ()` on the first page only, or an approximate count from
`pg_class` for large sets. It is labelled “about N” in the UI.

**Implementation note (beta):** the first implementation uses `limit`/`offset` with `?page=N`
instead of the cursor above. The API shape is unchanged otherwise; switch to keyset pagination
before the catalogue or crawl rate makes deep offsets expensive.

## Facets

Computed with the same filters, minus the facet's own filter:

```sql
select tag, count(*) from public_projects, unnest(tags) tag
group by tag order by count desc limit 30;
```

Cached in memory for 60 seconds. License facets are a simple group-by. Facet counts are approximate
under concurrent writes; that is acceptable and documented in the UI as “counts may lag”.

## Autocomplete

`GET /api/v1/search/suggest?q=` returns the top 5 titles and tags using:

- prefix match on a `lower(title)` index (`text_pattern_ops`) for the first 3 characters;
- trigram similarity for the rest;
- cached 30 seconds per normalized prefix.

Debounced 150 ms client-side, abortable, no analytics on partial input.

## SEO

| Element | Value |
|---|---|
| `<title>` | `{title} — {author} · SolidCraft Gallery` |
| Meta description | First 155 chars of description or README |
| Canonical | `https://gallery.example/{owner}/{slug}` |
| Open Graph image | `/media/{sha}/og.png` (1200×630) |
| JSON-LD | `CreativeWork` with `name`, `author`, `license`, `datePublished`, `encodingFormat` |
| Sitemap | `/sitemap.xml` index + `/sitemap-projects-{n}.xml`, 50k URLs each |
| Robots | `Allow: /`, `Disallow: /dashboard`, `/api`, `/media/private`, `/admin`; `noindex` on unlisted |
| RSS | `/feed.xml` newest 50 public projects (**later**) |

Sitemaps are regenerated hourly from the database; only `public` + `ready` rows. A deleted project
disappears at the next regeneration and returns `410` for 30 days.

## Private and unlisted guarantees

- Every public query includes `visibility='public' AND status='ready'`.
- A database view `public_projects` encapsulates the predicate; route code queries the view, not the
  table, to make accidental leaks harder.
- `unlisted` pages return `<meta name="robots" content="noindex,nofollow">` and are excluded from
  sitemaps, feeds and suggestions.
- Search suggestions never include private titles.
- Tests assert that a private project never appears in search, facets, sitemap or suggestions.

## Reindexing

- Incremental: the trigger runs in the ingest transaction.
- Full: `search.reindex` job rebuilds `search_vector` in batches of 500 with `updated_at` touched.
- After a CLI/ingest change that alters `keywords`, enqueue a full reindex for affected projects.
- Reindex is idempotent and can run while serving.

## Quality loop

- Log zero-result queries (normalized, truncated, no IP) for 30 days.
- Weekly review: map zero-result terms to missing tags, synonyms, or metadata guidance.
- A synonym table (`raspberry pi` ↔ `rpi`, `enclosure` ↔ `case`) applied to the query **later**.
- No personal search history is stored.

## Scaling

At roughly 100k projects or 50 queries/second, move the query layer to Meilisearch:

- Same ingest pipeline pushes a document (`id`, `title`, `description`, `tags`, `license`,
  `keywords`, `published_at`, `downloads`, `favorites`).
- Postgres remains the source of truth; the index is rebuildable.
- The API contract does not change; only `packages/search` swaps its implementation.

Until then, `pg_trgm` + FTS keeps the stack to one database and one backup.
