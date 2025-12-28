import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, User, Building2, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ConfirmationData {
  pending_token: string;
  user_info: {
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    oauth_provider: string;
  };
  tenant_info: {
    tenant_id: string;
    name: string;
    domain: string | null;
    description: string | null;
    is_personal: boolean;
    can_edit_name: boolean;
  };
}

interface OAuthConfirmationProps {
  confirmationData: ConfirmationData;
}

export default function OAuthConfirmation({ confirmationData }: OAuthConfirmationProps) {
  const navigate = useNavigate();
  const { apiClient } = useAuth();
  const { user_info, tenant_info, pending_token } = confirmationData;

  const [tenantName, setTenantName] = useState(tenant_info.name);
  const [tenantSlug, setTenantSlug] = useState(tenant_info.tenant_id);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateSlug = (slug: string): boolean => {
    // Slug validation: 3-63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens
    if (slug.length < 3 || slug.length > 63) {
      setSlugError('Slug must be between 3 and 63 characters');
      return false;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      setSlugError('Slug must be lowercase alphanumeric with hyphens (no leading/trailing hyphens)');
      return false;
    }
    setSlugError(null);
    return true;
  };

  const handleSlugChange = (newSlug: string) => {
    setTenantSlug(newSlug);
    validateSlug(newSlug);
  };

  const handleConfirm = async () => {
    // Validate slug before submitting
    if (!validateSlug(tenantSlug)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.authOAuthConfirm({
        pending_token,
        tenant_name: tenant_info.can_edit_name && tenantName !== tenant_info.name ? tenantName : null,
        tenant_slug: tenantSlug !== tenant_info.tenant_id ? tenantSlug : null,
      });

      // Store JWT token and user account
      const userAccount = {
        ...response.user,
        api_key: response.api_key, // Include API key in userAccount object
        tenant_id: response.tenant_id, // Include tenant ID in userAccount object
      };
      localStorage.setItem('nexus_jwt_token', response.token);
      localStorage.setItem('nexus_user_account', JSON.stringify(userAccount));

      // Store API key and tenant ID
      if (response.api_key) {
        localStorage.setItem('nexus_user_api_key', response.api_key);
      }
      if (response.tenant_id) {
        localStorage.setItem('nexus_tenant_id', response.tenant_id);
      }

      // Clear sessionStorage
      sessionStorage.removeItem('oauth_state');

      // Redirect to home page
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch (err: any) {
      console.error('Failed to confirm registration:', err);
      const errorDetail = err.response?.data?.detail || err.message || 'Unknown error';

      // Handle specific error cases
      if (errorDetail.includes('expired')) {
        setError('Your session has expired. Please sign in again.');
        setTimeout(() => navigate('/login'), 3000);
      } else if (errorDetail.includes('already exists') && errorDetail.includes('account')) {
        setError('This account already exists. Redirecting to login...');
        setTimeout(() => navigate('/login'), 3000);
      } else if (errorDetail.includes('already taken') || errorDetail.includes('Invalid tenant slug')) {
        // Slug validation error - show in slug field
        setSlugError(errorDetail);
      } else {
        setError(`Registration failed: ${errorDetail}`);
      }

      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Confirm Your Information
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Please review your account information before continuing
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden">
          {/* User Information Section */}
          <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-4">
              <User className="h-5 w-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">User Information</h3>
            </div>
            <div className="flex items-start space-x-4">
              {user_info.avatar_url && (
                <img
                  src={user_info.avatar_url}
                  alt="Profile"
                  className="h-16 w-16 rounded-full"
                />
              )}
              <div className="flex-1">
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Name</label>
                  <p className="mt-1 text-base text-gray-900 dark:text-gray-100">
                    {user_info.display_name || 'Not provided'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Email</label>
                  <p className="mt-1 text-base text-gray-900 dark:text-gray-100">{user_info.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tenant Information Section */}
          <div className="px-6 py-6">
            <div className="flex items-center mb-4">
              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Organization Information</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Type</label>
                <div className="mt-1 flex items-center">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      tenant_info.is_personal
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                    }`}
                  >
                    {tenant_info.is_personal ? 'Personal Organization' : 'Company Organization'}
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="tenant-slug"
                  className="block text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  Organization Slug
                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(You can customize this)</span>
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="tenant-slug"
                    value={tenantSlug}
                    onChange={(e) => handleSlugChange(e.target.value.toLowerCase())}
                    placeholder="Enter organization slug"
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 ${
                      slugError ? 'border-red-300 dark:border-red-700' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  />
                  {slugError ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{slugError}</p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Used in URLs and API calls (3-63 chars, lowercase alphanumeric + hyphens)
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Domain</label>
                <p className="mt-1 text-base text-gray-900 dark:text-gray-100">{tenant_info.domain}</p>
              </div>

              <div>
                <label
                  htmlFor="tenant-name"
                  className="block text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  Organization Name
                  {tenant_info.can_edit_name && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(You can customize this)</span>
                  )}
                </label>
                {tenant_info.can_edit_name ? (
                  <div className="mt-1">
                    <input
                      type="text"
                      id="tenant-name"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="Enter organization name"
                      className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Customize your personal organization name
                    </p>
                  </div>
                ) : (
                  <div className="mt-1">
                    <p className="text-base text-gray-900 dark:text-gray-100">{tenant_info.name}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Company organization names are derived from the domain and cannot be changed
                    </p>
                  </div>
                )}
              </div>

              {tenant_info.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Description</label>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{tenant_info.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-6 py-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Confirmation Button */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  Creating Account...
                </>
              ) : (
                'Confirm and Continue'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
