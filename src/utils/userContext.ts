/**
 * User context utilities for extracting tenant and user information
 */

// Define a minimal UserInfo interface that matches what we need
export interface UserInfo {
  subject_id?: string;
  user?: string;
  tenant_id?: string;
  is_admin?: boolean;
}

export interface UserContext {
  userId: string;
  tenantId: string;
  isAdmin: boolean;
}

/**
 * Extract user context from userInfo object
 * Throws error if user is not authenticated or ID not found
 *
 * @example
 * const { userId, tenantId, isAdmin } = getUserContext(userInfo);
 */
export function getUserContext(userInfo: UserInfo | null): UserContext {
  if (!userInfo) {
    throw new Error('User not authenticated');
  }

  const userId = userInfo.subject_id || userInfo.user;
  if (!userId) {
    throw new Error('User ID not found in user info');
  }

  const tenantId = userInfo.tenant_id || 'default';
  const isAdmin = userInfo.is_admin || false;

  return { userId, tenantId, isAdmin };
}

/**
 * Try to extract user context, returns null if not available
 * Use this when user context is optional
 *
 * @example
 * const userContext = tryGetUserContext(userInfo);
 * if (userContext) {
 *   // Use userContext.userId, userContext.tenantId
 * }
 */
export function tryGetUserContext(userInfo: UserInfo | null): UserContext | null {
  try {
    return getUserContext(userInfo);
  } catch {
    return null;
  }
}
