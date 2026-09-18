import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../components/LoginPage';

vi.mock('../context/appSliceContexts', () => ({
  useAppUser: () => ({
    users: [],
    setCurrentUser: vi.fn(),
    setLanguage: vi.fn(),
    setIsSessionElevated: vi.fn(),
    currentUser: null,
    isSessionElevated: false,
    impersonatingAs: null,
    originalAdminUser: null,
    setImpersonating: vi.fn(),
    globalPinSessionId: null,
    setGlobalPinSessionId: vi.fn(),
    forceLogoutRequested: false,
    clearForceLogoutRequest: vi.fn(),
    isLoading: false,
    effectiveLanguage: 'it',
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    createUser: vi.fn(),
    reorderUsers: vi.fn(),
    logout: vi.fn(),
    clearLanguage: vi.fn(),
  }),
  useAppConfig: () => ({
    featureFlags: {},
  }),
}));

vi.mock('../context/TenantContext', () => ({
  useTenant: () => ({ tenant: null, loadTenantBySlug: vi.fn() }),
}));

expect.extend(toHaveNoViolations);

describe('a11y', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('LoginPage non ha violazioni a11y (jest-axe)', async () => {
    const { container } = render(
      <MemoryRouter>
        <LoginPage onLogin={() => {}} onBack={() => {}} />
      </MemoryRouter>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
