import './style.css';
import { ApiError, forgotPassword, login, register, resetPassword, verifyEmail } from './lib/api';

declare const lucide: { createIcons: () => void };

type View = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const views: Record<View, string> = {
  login: 'loginForm',
  register: 'registerForm',
  forgot: 'forgotForm',
  reset: 'resetForm',
  verify: 'verifyView',
};

const alertBox = el('alert');
const tabs = el('tabs');
const resetToken = new URLSearchParams(location.search).get('token') ?? '';

/* --------------------------------- UI ----------------------------- */
function clearAlert(): void {
  alertBox.className = 'hidden text-sm rounded-lg px-3 py-2.5 mb-4';
  alertBox.removeAttribute('role');
  alertBox.textContent = '';
}

function showAlert(message: string, type: 'error' | 'success' | 'info' = 'error'): void {
  const styles = {
    error: 'bg-danger/10 text-danger border border-danger/30',
    success: 'bg-success/10 text-success border border-success/30',
    info: 'bg-secondary/10 text-secondary border border-secondary/30',
  } as const;
  alertBox.className = `text-sm rounded-lg px-3 py-2.5 mb-4 ${styles[type]}`;
  // Errors should be announced assertively; success/info politely.
  alertBox.setAttribute('role', type === 'error' ? 'alert' : 'status');
  alertBox.textContent = message;
}

function setActiveTab(view: View): void {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
    const on = btn.dataset.mode === view;
    btn.classList.toggle('bg-primary', on);
    btn.classList.toggle('text-white', on);
    btn.classList.toggle('text-muted', !on);
  });
}

function showView(view: View): void {
  clearAlert();
  (Object.keys(views) as View[]).forEach((key) => {
    el(views[key]).classList.toggle('hidden', key !== view);
  });
  // Tabs only make sense for login/register.
  const showTabs = view === 'login' || view === 'register';
  tabs.classList.toggle('hidden', !showTabs);
  if (showTabs) setActiveTab(view);
}

/** Runs an async submit with button loading state + error surfacing. */
async function withLoading(
  form: HTMLFormElement,
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  const btn = form.querySelector<HTMLButtonElement>('.submit-btn');
  const original = btn?.textContent ?? label;
  if (btn) {
    btn.disabled = true;
    btn.textContent = `${label}…`;
    btn.classList.add('opacity-70');
  }
  clearAlert();
  try {
    await fn();
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    showAlert(message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = original;
      btn.classList.remove('opacity-70');
    }
  }
}

/* ------------------------------ Handlers -------------------------- */
function wireLogin(): void {
  const form = el<HTMLFormElement>('loginForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void withLoading(form, 'Signing in', async () => {
      const email = el<HTMLInputElement>('loginEmail').value.trim();
      const password = el<HTMLInputElement>('loginPassword').value;
      await login(email, password);
      window.location.href = '/';
    });
  });
}

function wireRegister(): void {
  const form = el<HTMLFormElement>('registerForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void withLoading(form, 'Creating account', async () => {
      const name = el<HTMLInputElement>('regName').value.trim();
      const email = el<HTMLInputElement>('regEmail').value.trim();
      const password = el<HTMLInputElement>('regPassword').value;
      if (password.length < 12) {
        showAlert('Password must be at least 12 characters.', 'error');
        return;
      }
      await register({ email, password, name: name || undefined });
      form.reset();
      showAlert('Account created! Check your email for a verification link.', 'success');
    });
  });
}

function wireForgot(): void {
  const form = el<HTMLFormElement>('forgotForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void withLoading(form, 'Sending', async () => {
      const email = el<HTMLInputElement>('forgotEmail').value.trim();
      await forgotPassword(email);
      form.reset();
      showAlert('If an account exists for that email, a reset link is on its way.', 'success');
    });
  });
}

function wireReset(): void {
  const form = el<HTMLFormElement>('resetForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void withLoading(form, 'Updating', async () => {
      const password = el<HTMLInputElement>('resetPassword').value;
      if (password.length < 12) {
        showAlert('Password must be at least 12 characters.', 'error');
        return;
      }
      if (!resetToken) {
        showAlert('Missing or invalid reset link.', 'error');
        return;
      }
      await resetPassword(resetToken, password);
      form.reset();
      showAlert('Password updated. You can now sign in.', 'success');
      setTimeout(() => showView('login'), 1200);
    });
  });
}

async function runVerify(): Promise<void> {
  const token = resetToken; // same ?token= param
  const icon = el('verifyIcon');
  const title = el('verifyTitle');
  const msg = el('verifyMsg');

  const done = (ok: boolean, heading: string, text: string) => {
    icon.innerHTML = ok
      ? '<i data-lucide="check" class="w-6 h-6 text-success"></i>'
      : '<i data-lucide="x" class="w-6 h-6 text-danger"></i>';
    icon.classList.toggle('border-success/40', ok);
    icon.classList.toggle('border-danger/40', !ok);
    title.textContent = heading;
    msg.textContent = text;
    lucide.createIcons();
  };

  if (!token) {
    done(false, 'Invalid link', 'This verification link is missing its token.');
    return;
  }
  try {
    await verifyEmail(token);
    done(true, 'Email verified', 'Your account is ready. Please sign in.');
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Verification failed.';
    done(false, 'Verification failed', message);
  }
}

/* --------------------------- Enhancements ------------------------- */
function wirePasswordToggles(): void {
  document.querySelectorAll<HTMLButtonElement>('.pw-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target ?? '') as HTMLInputElement | null;
      if (!input) return;
      const revealed = input.type === 'text';
      input.type = revealed ? 'password' : 'text';
      btn.innerHTML = revealed
        ? '<i data-lucide="eye" class="w-4 h-4"></i>'
        : '<i data-lucide="eye-off" class="w-4 h-4"></i>';
      btn.setAttribute('aria-label', revealed ? 'Show password' : 'Hide password');
      lucide.createIcons();
    });
  });
}

function wireStrengthMeter(): void {
  const input = document.getElementById('regPassword') as HTMLInputElement | null;
  if (!input) return;
  const wrap = el('pwStrength');
  const bar = el('pwBar');
  const hint = el('pwHint');

  input.addEventListener('input', () => {
    const v = input.value;
    if (!v) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');

    if (v.length < 12) {
      bar.className = 'h-full transition-all duration-300 bg-danger';
      bar.style.width = '20%';
      hint.textContent = `At least 12 characters (${v.length}/12)`;
      return;
    }

    let score = 1;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;

    const widths = ['', '45%', '70%', '88%', '100%'];
    const colors = ['', 'bg-warn', 'bg-warn', 'bg-secondary', 'bg-success'];
    const labels = ['', 'Weak', 'Okay', 'Good', 'Strong'];
    bar.className = `h-full transition-all duration-300 ${colors[score]}`;
    bar.style.width = widths[score];
    hint.textContent = labels[score];
  });
}

/* ------------------------------ Bootstrap ------------------------- */
function init(): void {
  // Tab + inline navigation buttons.
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.mode as View));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.goto as View));
  });

  wireLogin();
  wireRegister();
  wireForgot();
  wireReset();
  wirePasswordToggles();
  wireStrengthMeter();

  const mode = (new URLSearchParams(location.search).get('mode') ?? 'login') as View;
  const initial: View = (Object.keys(views) as View[]).includes(mode) ? mode : 'login';
  showView(initial);
  if (initial === 'verify') void runVerify();

  lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
