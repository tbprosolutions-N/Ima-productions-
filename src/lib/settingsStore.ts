export type IntegrationKey = 'google_drive' | 'google_calendar' | 'morning';

function key(agencyId: string, name: string) {
  return `ima_settings_${agencyId}_${name}`;
}

function demoSecretsAllowed(): boolean {
  // Production rule: never store secrets in the browser.
  const enabled =
    import.meta.env.DEV && String(import.meta.env.VITE_DEMO_BYPASS || '').toLowerCase() === 'true';
  if (!enabled) return false;
  return localStorage.getItem('demo_authenticated') === 'true';
}

export function getAgencyLogo(agencyId: string): string | null {
  const raw = localStorage.getItem(key(agencyId, 'logo'));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { dataUrl?: string };
    if (parsed?.dataUrl) return parsed.dataUrl;
  } catch {
    // Backwards compatibility: raw dataURL string
    if (raw.startsWith('data:')) return raw;
  }
  return null;
}

export type StoredLogo = { filename: string; mime: string; dataUrl: string };

export function getAgencyLogoMeta(agencyId: string): StoredLogo | null {
  const raw = localStorage.getItem(key(agencyId, 'logo'));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredLogo;
    if (parsed?.dataUrl) return parsed;
  } catch {
    // legacy: only data url
    if (raw.startsWith('data:')) return { filename: 'logo', mime: 'image/*', dataUrl: raw };
  }
  return null;
}

export function setAgencyLogo(agencyId: string, logo: StoredLogo) {
  localStorage.setItem(key(agencyId, 'logo'), JSON.stringify(logo));
  window.dispatchEvent(new CustomEvent('ima:logo', { detail: { agencyId } }));
}

export function clearAgencyLogo(agencyId: string) {
  localStorage.removeItem(key(agencyId, 'logo'));
  window.dispatchEvent(new CustomEvent('ima:logo', { detail: { agencyId } }));
}

export function isIntegrationConnected(agencyId: string, integration: IntegrationKey): boolean {
  return localStorage.getItem(key(agencyId, `integration_${integration}`)) === 'true';
}

export function setIntegrationConnected(agencyId: string, integration: IntegrationKey, connected: boolean) {
  localStorage.setItem(key(agencyId, `integration_${integration}`), connected ? 'true' : 'false');
}

export function getMorningApiKey(agencyId: string): string {
  if (!demoSecretsAllowed()) return '';
  return localStorage.getItem(key(agencyId, 'morning_api_key')) || '';
}

export function setMorningApiKey(agencyId: string, apiKey: string) {
  if (!demoSecretsAllowed()) return;
  localStorage.setItem(key(agencyId, 'morning_api_key'), apiKey);
}

export function getMorningCompanyId(agencyId: string): string {
  if (!demoSecretsAllowed()) return '';
  return localStorage.getItem(key(agencyId, 'morning_company_id')) || '';
}

export function setMorningCompanyId(agencyId: string, companyId: string) {
  if (!demoSecretsAllowed()) return;
  localStorage.setItem(key(agencyId, 'morning_company_id'), companyId);
}

export function getCompanyName(agencyId: string): string {
  const raw = localStorage.getItem(key(agencyId, 'company_name')) || '';
  if (raw === 'IMA OS' || raw === 'IMA Productions') return 'NPC';
  return raw;
}

export function setCompanyName(agencyId: string, companyName: string) {
  localStorage.setItem(key(agencyId, 'company_name'), companyName);
  window.dispatchEvent(new CustomEvent('ima:company', { detail: { agencyId } }));
}

export type ManagedUser = {
  id: string;
  full_name: string;
  email: string;
  role: 'producer' | 'finance' | 'manager' | 'owner';
  status: 'active' | 'disabled';
  created_at: string;
  // Optional fine-grained permissions (demo-first; production should store in DB)
  permissions?: {
    finance?: boolean;
    users?: boolean;
    integrations?: boolean;
    events_create?: boolean;
    events_delete?: boolean;
  };
};

export function getManagedUsers(agencyId: string): ManagedUser[] {
  try {
    const raw = localStorage.getItem(key(agencyId, 'managed_users'));
    const parsed = raw ? (JSON.parse(raw) as ManagedUser[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setManagedUsers(agencyId: string, users: ManagedUser[]) {
  localStorage.setItem(key(agencyId, 'managed_users'), JSON.stringify(users));
}

