<script lang="ts">
  import { roleSurfaces } from '$lib/role-surfaces';
  import { roleHomePath } from '$lib/auth';

  let { data, children } = $props();

  const availableSurfaces = $derived(
    data.user ? roleSurfaces.filter((surface) => data.user?.roles.includes(surface.role)) : []
  );
</script>

<svelte:head>
  <title>Research Resource & Grant Administration</title>
</svelte:head>

<div class="app-shell">
  <header>
    <h1>Research Resource & Grant Administration</h1>
    <p class="subtitle">Offline-first administration portal for research funding, review workflows, resources, and finance.</p>

    {#if data.user}
      <div class="identity">
        <strong>{data.user.username}</strong>
        <span>Signed in as {data.user.roles.join(', ')}</span>
      </div>
    {:else}
      <div class="identity identity-anon">
        <strong>Not signed in</strong>
        <span>Authenticate to access role-restricted workflows.</span>
      </div>
    {/if}

    <nav>
      <a href="/">Home</a>

      {#if data.user}
        {#each availableSurfaces as surface}
          <a href={surface.href}>{surface.label}</a>
        {/each}
      {:else}
        <a href="/login">Sign in</a>
      {/if}

      {#if data.user}
        <a href={roleHomePath(data.user.roles)}>My role home</a>
      {/if}
    </nav>

    {#if data.user}
      <form method="POST" action="/logout">
        <button class="logout" type="submit">Sign out</button>
      </form>
    {/if}
  </header>

  <main>
    {@render children()}
  </main>
</div>

<style>
  .app-shell {
    font-family: system-ui, sans-serif;
    margin: 0 auto;
    max-width: 960px;
    padding: 1.5rem;
    color: #1f2937;
  }

  h1 {
    margin-bottom: 0.25rem;
  }

  .subtitle {
    margin: 0;
    color: #374151;
  }

  .identity {
    margin-top: 0.8rem;
    display: grid;
    gap: 0.2rem;
    font-size: 0.9rem;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 0.65rem;
    padding: 0.6rem 0.75rem;
  }

  .identity-anon {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  a {
    color: #0f4c81;
    text-decoration: none;
    font-weight: 600;
  }

  main {
    margin-top: 1.5rem;
  }

  .logout {
    margin-top: 0.8rem;
    border: 1px solid #9ca3af;
    background: #fff;
    border-radius: 0.5rem;
    padding: 0.45rem 0.65rem;
    font-size: 0.88rem;
    cursor: pointer;
  }
</style>
