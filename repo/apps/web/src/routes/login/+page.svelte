<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { roleHomePath, type AuthUser } from '$lib/auth';

  let username = '';
  let password = '';
  let submitting = false;
  let errorMessage = '';

  const submit = async () => {
    errorMessage = '';
    submitting = true;

    try {
      const response = await fetch('/session/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const payload = (await response.json()) as
        | { user?: AuthUser; error?: { message?: string } }
        | Record<string, never>;

      if (!response.ok || !payload.user) {
        errorMessage = payload.error?.message ?? 'Unable to sign in. Please check your credentials.';
        return;
      }

      const next = page.url.searchParams.get('next');
      const target = next && next.startsWith('/') ? next : roleHomePath(payload.user.roles);
      await goto(target, { invalidateAll: true });
    } catch {
      errorMessage = 'Network error while signing in. Please try again.';
    } finally {
      submitting = false;
    }
  };
</script>

<section class="login-wrap">
  <div class="login-card">
    <h2>Sign in</h2>
    <p class="intro">Use your institutional account to access research funding, review, resource, and finance workflows.</p>

    <form
      onsubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label>
        <span>Username</span>
        <input
          type="text"
          autocomplete="username"
          bind:value={username}
          required
          minlength={1}
          maxlength={80}
          disabled={submitting}
        />
      </label>

      <label>
        <span>Password</span>
        <input
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
          minlength={1}
          disabled={submitting}
        />
      </label>

      {#if errorMessage}
        <p class="error" role="alert">{errorMessage}</p>
      {/if}

      <button type="submit" disabled={submitting || !username || !password}>
        {#if submitting}Signing in...{:else}Sign in{/if}
      </button>
    </form>
  </div>
</section>

<style>
  .login-wrap {
    min-height: 70vh;
    display: grid;
    place-items: center;
  }

  .login-card {
    width: min(460px, 100%);
    border-radius: 1rem;
    border: 1px solid #d1d5db;
    background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
    padding: 1.5rem;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  }

  h2 {
    margin: 0;
    font-size: 1.4rem;
  }

  .intro {
    color: #374151;
    margin-top: 0.4rem;
    margin-bottom: 1.25rem;
    font-size: 0.95rem;
    line-height: 1.45;
  }

  form {
    display: grid;
    gap: 1rem;
  }

  label {
    display: grid;
    gap: 0.4rem;
    font-size: 0.9rem;
    color: #111827;
  }

  input {
    border: 1px solid #9ca3af;
    border-radius: 0.6rem;
    padding: 0.6rem 0.7rem;
    font-size: 1rem;
  }

  input:disabled {
    background: #f3f4f6;
    color: #6b7280;
  }

  .error {
    margin: 0;
    color: #b91c1c;
    background: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    padding: 0.55rem 0.65rem;
    font-size: 0.9rem;
  }

  button {
    background: #0f4c81;
    color: white;
    border: 0;
    border-radius: 0.65rem;
    padding: 0.65rem 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
</style>
