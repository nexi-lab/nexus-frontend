import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Save } from 'lucide-react';

interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  skill_type?: string;
  requires?: string[];
  tags?: string[];
  [key: string]: any;
}

interface SkillEditorProps {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  readOnly?: boolean;
}

/**
 * Specialized editor for SKILL.md files with YAML frontmatter support
 */
export function SkillEditor({ initialContent, onSave, readOnly = false }: SkillEditorProps) {
  const [mode, setMode] = useState<'visual' | 'raw'>('visual');
  const [metadata, setMetadata] = useState<SkillMetadata>({
    name: '',
    description: '',
  });
  const [markdownContent, setMarkdownContent] = useState('');
  const [rawContent, setRawContent] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Parse SKILL.md content on mount and when initialContent changes
  useEffect(() => {
    parseContent(initialContent);
  }, [initialContent]);

  /**
   * Parse SKILL.md content into metadata and markdown sections
   */
  const parseContent = (content: string) => {
    try {
      // Match YAML frontmatter: ---\n...yaml...\n---
      const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
      const match = content.match(frontmatterRegex);

      if (!match) {
        setError('Invalid SKILL.md format: Missing YAML frontmatter');
        setRawContent(content);
        return;
      }

      const [, yamlStr, markdown] = match;

      // Parse YAML (simple parser for common cases)
      const parsedMetadata = parseYAML(yamlStr);
      setMetadata(parsedMetadata);
      setMarkdownContent(markdown.trim());
      setRawContent(content);
      setError(null);
    } catch (err) {
      setError(`Failed to parse SKILL.md: ${err}`);
      setRawContent(content);
    }
  };

  /**
   * Simple YAML parser for skill metadata
   * Handles strings, arrays, multi-line strings with block scalars
   */
  const parseYAML = (yamlStr: string): SkillMetadata => {
    const lines = yamlStr.split('\n');
    const result: SkillMetadata = {
      name: '',
      description: '',
    };

    let currentKey = '';
    let inArray = false;
    let inMultilineString = false;
    let multilineStringType: 'literal' | 'folded' | null = null;
    let arrayItems: string[] = [];
    let multilineString: string[] = [];
    let baseIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and comments when not in multiline string
      if (!inMultilineString && (!trimmed || trimmed.startsWith('#'))) continue;

      // Handle multiline strings (| or >)
      if (inMultilineString) {
        // Check if line is indented (part of the multiline string)
        const indent = line.length - line.trimStart().length;
        if (indent >= baseIndent && line.trim()) {
          multilineString.push(line.substring(baseIndent));
        } else if (!trimmed) {
          // Empty line within multiline string
          multilineString.push('');
        } else {
          // Dedent or new key - end multiline string
          if (multilineStringType === 'literal') {
            result[currentKey] = multilineString.join('\n');
          } else {
            // Folded: join with spaces
            result[currentKey] = multilineString.join(' ').trim();
          }
          inMultilineString = false;
          multilineString = [];
          multilineStringType = null;
          // Process this line as a new key
          i--; // Reprocess this line
          continue;
        }
        continue;
      }

      // Handle array items
      if (trimmed.startsWith('- ')) {
        const item = trimmed.substring(2).trim();
        arrayItems.push(item);
        continue;
      }

      // If we were in an array, save it
      if (inArray && currentKey && arrayItems.length > 0) {
        result[currentKey] = arrayItems;
        arrayItems = [];
        inArray = false;
      }

      // Handle key-value pairs
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        if (value === '|' || value === '>') {
          // Start of multiline string
          currentKey = key;
          inMultilineString = true;
          multilineStringType = value === '|' ? 'literal' : 'folded';
          multilineString = [];
          // Determine base indentation from next line
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            baseIndent = nextLine.length - nextLine.trimStart().length;
          }
        } else if (value) {
          // Has value on same line - remove quotes if present
          let cleanValue = value;
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            cleanValue = value.slice(1, -1);
          }
          result[key] = cleanValue;
          inArray = false;
        } else {
          // No value - next items might be array
          currentKey = key;
          inArray = true;
          arrayItems = [];
        }
      }
    }

    // Handle trailing multiline string
    if (inMultilineString && currentKey && multilineString.length > 0) {
      if (multilineStringType === 'literal') {
        result[currentKey] = multilineString.join('\n');
      } else {
        result[currentKey] = multilineString.join(' ').trim();
      }
    }

    // Handle trailing array
    if (inArray && currentKey && arrayItems.length > 0) {
      result[currentKey] = arrayItems;
    }

    return result;
  };

  /**
   * Serialize metadata and markdown back to SKILL.md format
   */
  const serializeContent = (): string => {
    let yaml = '';

    // Helper to serialize a field value
    const serializeField = (key: string, value: string): string => {
      // Check if value contains newlines
      if (value.includes('\n')) {
        // Use literal block scalar for multi-line strings
        const lines = value.split('\n');
        let result = `${key}: |\n`;
        lines.forEach(line => {
          result += `  ${line}\n`;
        });
        return result;
      } else {
        // Single line value
        // Quote if contains special characters
        const needsQuotes = /[:#\[\]{}|>*&!%@`]/.test(value) || value !== value.trim();
        if (needsQuotes) {
          return `${key}: "${value.replace(/"/g, '\\"')}"\n`;
        }
        return `${key}: ${value}\n`;
      }
    };

    // Add required fields first
    yaml += serializeField('name', metadata.name);
    yaml += serializeField('description', metadata.description);

    // Add optional fields
    if (metadata.version) yaml += serializeField('version', metadata.version);
    if (metadata.author) yaml += serializeField('author', metadata.author);
    if (metadata.skill_type) yaml += serializeField('skill_type', metadata.skill_type);

    // Add arrays
    if (metadata.requires && metadata.requires.length > 0) {
      yaml += 'requires:\n';
      metadata.requires.forEach((req) => {
        yaml += `  - ${req}\n`;
      });
    }

    if (metadata.tags && metadata.tags.length > 0) {
      yaml += 'tags:\n';
      metadata.tags.forEach((tag) => {
        yaml += `  - ${tag}\n`;
      });
    }

    // Combine with markdown
    return `---\n${yaml}---\n\n${markdownContent}`;
  };

  /**
   * Handle save action
   */
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const content = mode === 'visual' ? serializeContent() : rawContent;

      // Validate before saving
      if (mode === 'visual') {
        if (!metadata.name) {
          setError('Skill name is required');
          return;
        }
        if (!metadata.description) {
          setError('Skill description is required');
          return;
        }
      }

      await onSave(content);
    } catch (err: any) {
      setError(`Failed to save: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Update metadata field
   */
  const updateMetadata = (key: keyof SkillMetadata, value: any) => {
    setMetadata((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Update array field (requires, tags)
   */
  const updateArrayField = (key: 'requires' | 'tags', value: string) => {
    const items = value.split(',').map((s) => s.trim()).filter(Boolean);
    updateMetadata(key, items);
  };

  return (
    <div className="flex flex-col h-full">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={mode} onValueChange={(v: string) => setMode(v as 'visual' | 'raw')} className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="visual">Visual Editor</TabsTrigger>
            <TabsTrigger value="raw">Raw YAML + Markdown</TabsTrigger>
          </TabsList>

          {!readOnly && (
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>

        <TabsContent value="visual" className="flex-1 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={metadata.name}
                onChange={(e) => updateMetadata('name', e.target.value)}
                placeholder="my-skill"
                disabled={readOnly}
                required
              />
            </div>

            <div>
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={metadata.version || ''}
                onChange={(e) => updateMetadata('version', e.target.value)}
                placeholder="1.0.0"
                disabled={readOnly}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={metadata.description}
              onChange={(e) => updateMetadata('description', e.target.value)}
              placeholder="A brief description of what this skill does"
              rows={3}
              disabled={readOnly}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                value={metadata.author || ''}
                onChange={(e) => updateMetadata('author', e.target.value)}
                placeholder="Your Name"
                disabled={readOnly}
              />
            </div>

            <div>
              <Label htmlFor="skill_type">Skill Type</Label>
              <Input
                id="skill_type"
                value={metadata.skill_type || ''}
                onChange={(e) => updateMetadata('skill_type', e.target.value)}
                placeholder="documentation, code, prompt, etc."
                disabled={readOnly}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={metadata.tags?.join(', ') || ''}
              onChange={(e) => updateArrayField('tags', e.target.value)}
              placeholder="tag1, tag2, tag3"
              disabled={readOnly}
            />
          </div>

          <div>
            <Label htmlFor="requires">Dependencies (comma-separated)</Label>
            <Input
              id="requires"
              value={metadata.requires?.join(', ') || ''}
              onChange={(e) => updateArrayField('requires', e.target.value)}
              placeholder="dependency-skill-1, dependency-skill-2"
              disabled={readOnly}
            />
          </div>

          <div>
            <Label htmlFor="markdown">Markdown Content</Label>
            <Textarea
              id="markdown"
              value={markdownContent}
              onChange={(e) => setMarkdownContent(e.target.value)}
              placeholder="# Skill Title&#10;&#10;Write your skill documentation here in Markdown..."
              rows={15}
              disabled={readOnly}
              className="font-mono text-sm"
            />
          </div>
        </TabsContent>

        <TabsContent value="raw" className="flex-1">
          <Textarea
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            className="font-mono text-sm h-full min-h-[500px]"
            disabled={readOnly}
            placeholder="---&#10;name: my-skill&#10;description: Skill description&#10;---&#10;&#10;# Markdown content here"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
