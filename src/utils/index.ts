import { v4 as uuidv4 } from 'uuid';

export function getUniqueId(): string {
  const id = window.localStorage.getItem('zz-unique_id');
  if (id) {
    return id;
  } else {
    const newId = uuidv4();
    window.localStorage.setItem('zz-unique_id', newId);
    return newId;
  }
}

/**
 * Safely copy text to clipboard with fallback for environments where
 * navigator.clipboard is not available (non-secure contexts, older browsers, etc.)
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Try modern Clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      // Fall through to fallback method
      console.warn('Clipboard API failed, trying fallback:', err);
    }
  }

  // Fallback: use execCommand for older browsers or non-secure contexts
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (!successful) {
      throw new Error('execCommand copy failed');
    }
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    throw new Error('Failed to copy to clipboard. Please copy manually.');
  }
}
