/**
 * Path generation utilities following multi-tenant namespace convention
 */

export type ResourceType = 'workspace' | 'resource' | 'connector' | 'memory' | 'skill' | 'agent';

export interface PathOptions {
  resourceType: ResourceType;
  resourceId: string;
  tenantId?: string;
  userId?: string;
}

/**
 * Validate tenant ID format
 */
function validateTenantId(tenantId: string): void {
  if (!tenantId || tenantId.trim() === '') {
    throw new Error('Tenant ID cannot be empty');
  }
  if (tenantId.includes('/')) {
    throw new Error('Tenant ID cannot contain forward slashes');
  }
  if (tenantId.length > 100) {
    throw new Error('Tenant ID too long (max 100 characters)');
  }
}

/**
 * Validate user ID format
 */
function validateUserId(userId: string): void {
  if (!userId || userId.trim() === '') {
    throw new Error('User ID cannot be empty');
  }
  if (userId.includes('/')) {
    throw new Error('User ID cannot contain forward slashes');
  }
  if (userId.length > 100) {
    throw new Error('User ID too long (max 100 characters)');
  }
}

/**
 * Check if string is a valid resource type
 */
function isResourceType(type: string): type is ResourceType {
  return ['workspace', 'resource', 'connector', 'memory', 'skill', 'agent'].includes(type);
}

/**
 * Generate system-wide resource path
 * Example: /resource/res_default_template
 */
export function systemPath(resourceType: ResourceType, resourceId: string): string {
  return `/${resourceType}/${resourceId}`;
}

/**
 * Generate tenant-wide resource path
 * Example: /tenant:acme/resource/res_company_logo
 */
export function tenantPath(
  tenantId: string,
  resourceType: ResourceType,
  resourceId: string
): string {
  validateTenantId(tenantId);
  return `/tenant:${tenantId}/${resourceType}/${resourceId}`;
}

/**
 * Generate user-owned resource path
 * Example: /tenant:acme/user:alice/workspace/ws_marketing
 */
export function userPath(
  tenantId: string,
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): string {
  validateTenantId(tenantId);
  validateUserId(userId);
  return `/tenant:${tenantId}/user:${userId}/${resourceType}/${resourceId}`;
}

/**
 * Generate resource ID with prefix
 * Example: ws_marketing_a1b2c3d4e5f6, res_abc123e5f6g7h8i9j0
 *
 * Uses 12-character UUID for uniqueness to avoid collisions
 */
export function generateResourceId(
  resourceType: ResourceType,
  name?: string
): string {
  const prefixes: Record<ResourceType, string> = {
    workspace: 'ws',
    resource: 'res',
    connector: 'conn',
    memory: 'mem',
    skill: 'skill',
    agent: 'agent',
  };

  const prefix = prefixes[resourceType];

  // Always use consistent 12-character UUID for all cases
  const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12);

  if (name) {
    // Sanitize name (lowercase, alphanumeric + underscore)
    const sanitized = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Validate sanitized name has meaningful content (at least 2 non-underscore chars)
    const meaningfulChars = sanitized.replace(/_/g, '');
    if (meaningfulChars.length < 2) {
      console.warn(`Name "${name}" sanitizes to mostly underscores, using UUID-only ID`);
      return `${prefix}_${uuid}`;
    }

    // Truncate if too long (max 30 chars for name portion)
    const maxNameLength = 30;
    const truncated = sanitized.length > maxNameLength
      ? sanitized.substring(0, maxNameLength)
      : sanitized;

    return `${prefix}_${truncated}_${uuid}`;
  } else {
    // Generate UUID-based ID
    return `${prefix}_${uuid}`;
  }
}

/**
 * Parse path to extract components
 * Uses split-based parsing for robustness with special characters
 */
export function parsePath(path: string): PathOptions | null {
  // Split and remove empty parts
  const parts = path.split('/').filter(p => p);

  if (parts.length < 2) return null;

  // System: /<type>/<id>
  if (parts.length === 2 && isResourceType(parts[0])) {
    return {
      resourceType: parts[0] as ResourceType,
      resourceId: parts[1],
    };
  }

  // Tenant: /tenant:<tid>/<type>/<id>
  if (parts.length === 3 && parts[0].startsWith('tenant:')) {
    const tenantId = parts[0].substring(7); // Remove 'tenant:' prefix
    if (isResourceType(parts[1])) {
      return {
        tenantId,
        resourceType: parts[1] as ResourceType,
        resourceId: parts[2],
      };
    }
  }

  // User: /tenant:<tid>/user:<uid>/<type>/<id>
  if (parts.length === 4 && parts[0].startsWith('tenant:') && parts[1].startsWith('user:')) {
    const tenantId = parts[0].substring(7); // Remove 'tenant:' prefix
    const userId = parts[1].substring(5);     // Remove 'user:' prefix
    if (isResourceType(parts[2])) {
      return {
        tenantId,
        userId,
        resourceType: parts[2] as ResourceType,
        resourceId: parts[3],
      };
    }
  }

  return null; // Not a new convention path
}

/**
 * Check if path follows new convention
 */
export function isNewConventionPath(path: string): boolean {
  return parsePath(path) !== null;
}

/**
 * Get ownership level from path
 */
export function getOwnershipLevel(path: string): 'system' | 'tenant' | 'user' | null {
  const parsed = parsePath(path);
  if (!parsed) return null;
  
  if (parsed.userId) return 'user';
  if (parsed.tenantId) return 'tenant';
  return 'system';
}

