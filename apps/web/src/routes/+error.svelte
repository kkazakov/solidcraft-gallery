<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status} — SolidCraft Gallery</title>
</svelte:head>

<section class="shell error-page">
  <p class="eyebrow">{page.status}</p>
  <h1>{page.status === 404 ? 'Not found' : 'Something broke'}</h1>
  <p>
    {page.status === 404
      ? 'That page does not exist, or it is private.'
      : 'The request failed. The request id is in the response headers.'}
  </p>
  <p><a class="button" href="/">Go home</a></p>
</section>
